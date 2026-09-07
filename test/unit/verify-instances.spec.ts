import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import {
    InstanceNode,
    type InstanceEncoding,
} from '@/lib-components/nodes/InstanceNode.js'
import { types } from '@/lib-components/nodes/types.js'
import { VuetrexStage, type VxMouseEvent } from '@/lib-components/three/stage.js'

interface Item {
    id: string
    x: number
    color: number
}

function fixture() {
    const scene = new THREE.Scene()
    const connectors = {
        update: vi.fn(),
        remove: vi.fn(() => []),
    }
    const stage = {
        boxRadius: 1,
        boxDistance: 1,
        gap: 1,
        createElementMaterial: () => new THREE.MeshStandardMaterial({ color: 0xffffff }),
        getScene: () => scene,
        connectors,
    } as unknown as VuetrexStage
    const parent = new GroupNode(stage)
    const node = new InstanceNode<Item>(stage)
    parent.appendChild(node)
    return { node, parent, scene, connectors }
}

const encoding: InstanceEncoding<Item> = {
    transform(item) {
        return new THREE.Matrix4().makeTranslation(item.x, 0.5, 0)
    },
    color: item => item.color,
}

describe('InstanceNode', () => {
    it('is registered as the vx-instances built-in', () => {
        expect(types['vx-instances']).toBe(InstanceNode)
    })

    it('realizes semantic items as one InstancedMesh', async () => {
        const { node, parent } = fixture()
        node.setStateValue('items', [
            { id: 'pod-a', x: 0, color: 0x112233 },
            { id: 'pod-b', x: 2, color: 0x445566 },
        ])
        node.setStateValue('encoding', encoding)

        node.syncWithThree()
        await nextTick()

        expect(parent.group.children).toHaveLength(1)
        const mesh = node.element.mesh as THREE.InstancedMesh
        expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
        expect(mesh.geometry.type).toBe('RoundedBoxGeometry')
        expect(mesh.count).toBe(2)

        const matrix = new THREE.Matrix4()
        mesh.getMatrixAt(1, matrix)
        expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(2)

        const color = new THREE.Color()
        mesh.getColorAt(1, color)
        expect(color.getHex()).toBe(0x445566)
    })

    it('retains keyed GPU slots across reorder and reuses a removed slot', async () => {
        const { node } = fixture()
        node.setStateValue('items', [
            { id: 'pod-a', x: 0, color: 0xffffff },
            { id: 'pod-b', x: 1, color: 0xffffff },
        ])
        node.setStateValue('encoding', encoding)
        node.syncWithThree()
        await nextTick()

        expect(node.instanceHitAt(0)?.id).toBe('pod-a')
        expect(node.instanceHitAt(1)?.id).toBe('pod-b')

        node.setStateValue('items', [
            { id: 'pod-b', x: 4, color: 0xffffff },
            { id: 'pod-a', x: 5, color: 0xffffff },
        ])
        await nextTick()

        expect(node.instanceHitAt(0)?.id).toBe('pod-a')
        expect(node.instanceHitAt(1)?.id).toBe('pod-b')
        const matrix = new THREE.Matrix4()
        ;(node.element.mesh as THREE.InstancedMesh).getMatrixAt(0, matrix)
        expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(5)

        node.setStateValue('items', [
            { id: 'pod-b', x: 4, color: 0xffffff },
            { id: 'pod-c', x: 6, color: 0xffffff },
        ])
        await nextTick()

        expect(node.instanceHitAt(0)?.id).toBe('pod-c')
        expect(node.instanceHitAt(1)?.id).toBe('pod-b')
    })

    it('reports encoded geometry bounds to parent layouts', () => {
        const { node } = fixture()
        node.setStateValue('items', [
            { id: 'wide', x: 0, color: 0xffffff },
            { id: 'upper', x: 0, color: 0xffffff },
        ])
        node.setStateValue('encoding', {
            transform(_item: Item, index: number) {
                return new THREE.Matrix4().compose(
                    new THREE.Vector3(0, index === 0 ? 0.5 : 2, 0),
                    new THREE.Quaternion(),
                    new THREE.Vector3(index === 0 ? 2 : 1, 1, 3),
                )
            },
            color: () => 0xffffff,
        } satisfies InstanceEncoding<Item>)

        expect(node.measuredSize.value.toArray()).toEqual([2, 2.5, 3])
        node.renderOffset().toArray().forEach(value => expect(value).toBeCloseTo(0))
    })

    it('returns the semantic hit for an instance index', async () => {
        const { node } = fixture()
        const item = { id: 'pod-a', x: 0, color: 0xffffff }
        node.setStateValue('items', [item])
        node.syncWithThree()
        await nextTick()

        expect(node.instanceHitAt(0)).toEqual({
            id: 'pod-a',
            item,
            instanceIndex: 0,
        })
        expect(node.instanceHitAt(1)).toBeUndefined()
    })

    it('resolves semantic instances to world-space bounds', async () => {
        const { node, parent } = fixture()
        node.setStateValue('items', [{ id: 'pod-a', x: 1, color: 0xffffff }])
        node.setStateValue('encoding', encoding)
        node.syncWithThree()
        await nextTick()

        const mesh = node.element.mesh as THREE.InstancedMesh
        mesh.position.set(0, 0, 0)
        parent.group.position.set(4, 1, -2)
        parent.group.scale.setScalar(2)

        const bounds = node.instanceWorldBounds('pod-a')
        expect(bounds?.getCenter(new THREE.Vector3()).toArray()).toEqual([6, 2, -2])
        expect(bounds?.getSize(new THREE.Vector3()).toArray()).toEqual([2, 2, 2])
        expect(node.instanceWorldBounds('missing')).toBeUndefined()
    })

    it('adds the semantic hit to stage pointer events', async () => {
        const { node } = fixture()
        const item = { id: 'pod-a', x: 0, color: 0xffffff }
        node.setStateValue('items', [item])
        node.syncWithThree()
        await nextTick()

        const eventStage = Object.create(VuetrexStage.prototype) as VuetrexStage
        ;(eventStage as any).selectedObject = node.element.mesh
        ;(eventStage as any).selectedInstanceId = 0

        let received: VxMouseEvent | undefined
        node.onClick = event => { received = event as VxMouseEvent }
        eventStage.onCanvasClick(new MouseEvent('mousedown'))

        expect(received?.vxInstance).toEqual({
            id: 'pod-a',
            item,
            instanceIndex: 0,
        })
    })
})

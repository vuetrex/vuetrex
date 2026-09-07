import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { GeometryNode } from '@/lib-components/geometry/GeometryNode.js'
import { geo } from '@/lib-components/geometry/index.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { types } from '@/lib-components/nodes/types.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function fixture() {
    const scene = new THREE.Scene()
    const stage = {
        boxRadius: 1,
        boxDistance: 1,
        gap: 1,
        createElementMaterial: () => new THREE.MeshStandardMaterial({ color: 0xffffff }),
        getScene: () => scene,
        shadowsEnabled: () => true,
        connectors: { update: vi.fn(), remove: vi.fn(() => []) },
        reconcileConnections: vi.fn(),
        invalidateContentBounds: vi.fn(),
    } as unknown as VuetrexStage
    const parent = new GroupNode(stage)
    scene.add(parent.group)
    const node = new GeometryNode(stage)
    parent.appendChild(node)
    return { node, parent, stage }
}

async function flush() {
    await nextTick()
    await nextTick()
}

describe('GeometryNode', () => {
    it('is registered as the only procedural renderer element', () => {
        expect(types['vx-geometry']).toBe(GeometryNode)
        expect(types['vx-geo-transform']).toBeUndefined()
    })

    it('batches compatible records and reports compiled layout bounds', async () => {
        const { node } = fixture()
        node.setStateValue('graph', geo.distribute(geo.box(), {
            points: [[0, 0, 0], [2, 0, 0]],
        }))
        node.syncWithThree()
        await flush()

        expect(node.group.children).toHaveLength(1)
        const mesh = node.group.children[0] as THREE.InstancedMesh
        expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
        expect(mesh.count).toBe(2)
        expect(node.instanceBatchCount).toBe(1)
        expect(node.measuredSize.value.toArray()).toEqual([3, 1, 1])
        expect(node.group.position.y).toBeCloseTo(0.5)
    })

    it('updates instance buffers without replacing a compatible batch', async () => {
        const { node } = fixture()
        node.setStateValue('graph', geo.distribute(geo.box(), {
            points: [[0, 0, 0], [1, 0, 0]],
        }))
        node.syncWithThree()
        await flush()
        const mesh = node.group.children[0] as THREE.InstancedMesh

        node.setStateValue('graph', geo.distribute(geo.box(), {
            points: [[0, 0, 0], [4, 0, 0]],
        }))
        await flush()

        expect(node.group.children[0]).toBe(mesh)
        const matrix = new THREE.Matrix4()
        mesh.getMatrixAt(1, matrix)
        expect(new THREE.Vector3().setFromMatrixPosition(matrix).x).toBe(4)
        expect(node.measuredSize.value.x).toBe(5)
    })

    it('keeps realization and prototype counts bounded across repeated parameter changes', async () => {
        const { node } = fixture()
        node.setStateValue('graph', geo.distribute(geo.box({ width: 1 }), {
            points: [[0, 0, 0], [1, 0, 0]],
        }))
        node.syncWithThree()
        await flush()

        for (let update = 1; update <= 12; update++) {
            node.setStateValue('graph', geo.distribute(geo.box({ width: update % 2 ? 1 : 1.25 }), {
                points: [[0, 0, 0], [update, 0, 0]],
            }))
            await flush()
            expect(node.group.children).toHaveLength(1)
            expect(node.instanceBatchCount).toBe(1)
            expect(node.prototypeCount).toBe(1)
        }
    })

    it('resolves hits from more than one generated instance batch', async () => {
        const { node } = fixture()
        const boxItem = { id: 'box' }
        const leafItem = { id: 'leaf' }
        node.setStateValue('graph', geo.boolean([
            geo.distribute(geo.box(), { items: [boxItem], keyBy: 'id', position: [0, 0, 0] }),
            geo.distribute(geo.icosphere(), { items: [leafItem], keyBy: 'id', position: [2, 0, 0] }),
        ]))
        node.syncWithThree()
        await flush()

        expect(node.instanceBatchCount).toBe(2)
        const meshes = node.group.children as THREE.InstancedMesh[]
        expect(node.instanceHitAt(0, meshes[0])?.item).toBe(boxItem)
        expect(node.instanceHitAt(0, meshes[1])?.item).toBe(leafItem)
    })

    it('detaches and disposes owned realization state on removal', async () => {
        const { node, parent } = fixture()
        node.setStateValue('graph', geo.box())
        node.syncWithThree()
        await flush()
        const dispose = vi.fn()
        node.material.addEventListener('dispose', dispose)

        parent.removeChild(node)

        expect(node.group.parent).toBeNull()
        expect(node.group.children).toHaveLength(0)
        expect(dispose).toHaveBeenCalledOnce()
    })
})

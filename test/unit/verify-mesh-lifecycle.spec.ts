import { nextTick, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { Cylinder } from '@/lib-components/nodes/shapes/Cylinder.js'
import { Wedge } from '@/lib-components/nodes/shapes/Wedge.js'
import type { Node } from '@/lib-components/nodes/Node.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function makeStage() {
    const scene = new THREE.Scene()
    const createElementMaterial = vi.fn(() => new THREE.MeshStandardMaterial())
    const removeObject = vi.fn((element: Element3d) => {
        element.mesh?.removeFromParent()
        element.mesh = null
    })
    const renderMesh = vi.fn((
        element: Element3d,
        height: number,
        size: number,
        generate: (height: number, size: number) => THREE.Mesh,
        parent: THREE.Object3D = scene,
    ) => {
        if (element.mesh) return
        const mesh = generate(height, size)
        parent.add(mesh)
        element.mesh = mesh
    })
    const stage = {
        boxRadius: 1,
        boxDistance: 0.5,
        gap: 0.5,
        createElementMaterial,
        getScene: () => scene,
        renderMesh,
        removeObject,
        connect: vi.fn(),
        unregisterConnection: vi.fn(),
        reconcileConnections: vi.fn(),
        invalidateContentBounds: vi.fn(),
        connectors: {
            update: vi.fn(),
            remove: vi.fn(),
        },
    } as unknown as VuetrexStage

    return { stage, createElementMaterial, removeObject }
}

function attachToReactiveParent(node: Node) {
    const elements = shallowRef<Node[]>([node])
    const group = new THREE.Group()
    node.parent.value = {
        elements,
        group,
        isGroupNode: true,
        layoutPositionOf: () => new THREE.Vector3(),
        parent: shallowRef(null),
    } as any
    return { elements, group }
}

describe('MeshNode GPU resource lifecycle', () => {
    it('creates exactly one persistent material for each built-in shape', () => {
        const { stage, createElementMaterial } = makeStage()
        const nodes = [new Box(stage), new Cylinder(stage), new Wedge(stage)]

        expect(createElementMaterial).toHaveBeenCalledTimes(nodes.length)

        nodes.forEach(node => node.onRemoved())
    })

    it('disposes replaced geometry and disposes the material on removal', async () => {
        const { stage, removeObject } = makeStage()
        const box = new Box(stage)
        const { elements, group } = attachToReactiveParent(box)

        box.syncWithThree()
        await nextTick()

        const firstMesh = box.element.mesh as THREE.Mesh
        const firstGeometryDisposed = vi.fn()
        firstMesh.geometry.addEventListener('dispose', firstGeometryDisposed)

        // MeshNode tracks sibling count as layout context, so this forces the
        // same rebuild that occurs when a dynamic scene adds a sibling.
        elements.value = [box, {} as Node]
        await nextTick()

        const replacementMesh = box.element.mesh as THREE.Mesh
        expect(replacementMesh).not.toBe(firstMesh)
        expect(firstGeometryDisposed).toHaveBeenCalledOnce()
        expect(firstMesh.parent).toBeNull()

        const replacementGeometryDisposed = vi.fn()
        const materialDisposed = vi.fn()
        replacementMesh.geometry.addEventListener('dispose', replacementGeometryDisposed)
        box.material.addEventListener('dispose', materialDisposed)

        box.onRemoved()

        expect(replacementGeometryDisposed).toHaveBeenCalledOnce()
        expect(materialDisposed).toHaveBeenCalledOnce()
        expect(replacementMesh.parent).toBeNull()
        expect(box.element.mesh).toBeNull()
        expect(group.children).toHaveLength(0)
        expect(removeObject).toHaveBeenCalledTimes(2)
    })
})

import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import * as THREE from 'three'
import { Panel } from '@/lib-components/nodes/Panel.js'
import { Stack } from '@/lib-components/nodes/Stack.js'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { types } from '@/lib-components/nodes/types.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function makeStage(): VuetrexStage {
    const scene = new THREE.Scene()
    return {
        boxDistance: 0.32,
        createElementMaterial: () => new THREE.MeshStandardMaterial(),
        getScene: () => scene,
        renderMesh: () => {},
        removeObject: () => {},
        connect: () => '',
        unregisterConnection: () => {},
        reconcileConnections: () => {},
        connectors: {
            update: () => {},
            remove: () => [],
        },
    } as unknown as VuetrexStage
}

describe('Panel', () => {
    it('is registered as a built-in visual container', () => {
        expect(types.panel).toBe(Panel)
    })

    it('reserves a south label region and places content on the north part of the top face', async () => {
        const panel = new Panel(makeStage())
        panel.setStateValue('size', 2)
        panel.setStateValue('depth', 1)
        panel.setStateValue('height', 0.2)
        panel.setStateValue('label-share', 0.4)

        const stack = new Stack(panel.stage)
        const pod = new Box(panel.stage)
        pod.setSize(0.4)
        pod.setStateValue('depth', 0.4)
        pod.setHeight(0.3)
        stack.appendChild(pod)
        panel.appendChild(stack)
        panel.syncWithThree()
        await nextTick()

        expect(panel.group.position.y).toBeCloseTo(0.1, 6)
        expect(panel.group.position.z).toBeCloseTo(-0.2, 6)
        expect(panel.group.scale.x).toBeCloseTo(1, 6)
        expect(panel.measuredSize.value).toEqual(new THREE.Vector3(2, 0.5, 1))

        panel.setStateValue('label-region', 'north')
        await nextTick()
        expect(panel.group.position.z).toBeCloseTo(0.2, 6)
        panel.onRemoved()
    })

    it('uniformly shrinks oversized content into the declared content region', async () => {
        const panel = new Panel(makeStage())
        panel.setStateValue('size', 2)
        panel.setStateValue('depth', 1)
        panel.setStateValue('label-share', 0.4)
        panel.setStateValue('content-padding', 0.08)

        const content = new Box(panel.stage)
        content.setSize(1)
        content.setStateValue('depth', 1)
        panel.appendChild(content)
        panel.syncWithThree()
        await nextTick()

        expect(panel.group.scale.x).toBeCloseTo(0.504, 6)
        expect(panel.group.scale.y).toBeCloseTo(0.504, 6)
        expect(panel.group.scale.z).toBeCloseTo(0.504, 6)
        panel.onRemoved()
    })

    it('builds backing geometry from the declared width, height, and depth', async () => {
        const panel = new Panel(makeStage())
        panel.setStateValue('size', 2.4)
        panel.setStateValue('depth', 1.2)
        panel.setStateValue('height', 0.3)
        panel.syncWithThree()
        await nextTick()

        const root = panel.element.mesh as THREE.Group
        const backing = root.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        backing.geometry.computeBoundingBox()
        const dimensions = backing.geometry.boundingBox!.getSize(new THREE.Vector3())
        expect(dimensions.x).toBeCloseTo(2.4, 5)
        expect(dimensions.y).toBeCloseTo(0.3, 5)
        expect(dimensions.z).toBeCloseTo(1.2, 5)
        panel.onRemoved()
    })
})

/** Hover restoration must use resolved design values, never an animated material snapshot. */
import { afterEach, describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import gsap from 'gsap'
import { nextTick, shallowRef } from 'vue'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type { VxHoverProps, VxMaterialProps } from '@/lib-components/styling/types.js'

const boxes: Box[] = []
afterEach(() => boxes.splice(0).forEach(box => box.onRemoved()))

async function makeBox(material: VxMaterialProps | undefined, hover: VxHoverProps) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.1 })
    const scene = new THREE.Scene()
    const stage = {
        boxRadius: 1.3, boxDistance: 1.5,
        createElementMaterial: () => mat,
        renderMesh: (element: any, height: number, size: number, generate: any) => {
            if (!element.mesh) { element.mesh = generate(height, size); scene.add(element.mesh) }
        },
        removeObject: (element: any) => { element.mesh?.removeFromParent(); element.mesh = null },
        getScene: () => scene, reconcileConnections: vi.fn(),
        connectors: { update: vi.fn(), remove: vi.fn() },
    } as unknown as VuetrexStage
    const box = new Box(stage)
    boxes.push(box)
    box.parent.value = {
        elements: shallowRef([box]), parent: shallowRef(null),
        group: scene, isGroupNode: true, layoutPositionOf: () => new THREE.Vector3(),
    } as any
    box.setStateValue('material', material)
    box.setStateValue('hover', hover)
    box.syncWithThree()
    await nextTick()
    return { box, mat, mesh: box.element.mesh! }
}

function finish(mat: THREE.MeshStandardMaterial, mesh: THREE.Object3D) {
    for (const target of [mat.color, mat.emissive, mat, mesh.scale]) {
        gsap.getTweensOf(target).forEach(tween => tween.progress(1))
    }
}

describe('MeshNode hover restoration', () => {
    it('restores the authored color even when the material is mid-animation', async () => {
        const { box, mat, mesh } = await makeBox({ color: 0xff0000 }, { color: 0x0000ff, transition: 1 })
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        gsap.getTweensOf(mat.color)[0].progress(0.4)
        expect(mat.color.getHex()).not.toBe(0xff0000)
        box.dispatchPointerleave(new MouseEvent('pointerleave'))
        finish(mat, mesh)
        expect(mat.color.getHex()).toBe(0xff0000)
    })

    it('restores the latest material prop after an update while hovered', async () => {
        const { box, mat, mesh } = await makeBox({ color: 0x00ff00 }, { color: 0xffffff, transition: 1 })
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        gsap.getTweensOf(mat.color)[0].progress(0.4)
        box.setStateValue('material', { color: 0x0000ff })
        await nextTick()
        expect(mat.color.getHex()).toBe(0xffffff)
        box.dispatchPointerleave(new MouseEvent('pointerleave'))
        finish(mat, mesh)
        expect(mat.color.getHex()).toBe(0x0000ff)
    })

    it('restores the base scale after an interrupted hover scale tween', async () => {
        const { box, mat, mesh } = await makeBox(undefined, { scale: 1.3, transition: 1 })
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        gsap.getTweensOf(mesh.scale)[0].progress(0.4)
        expect(mesh.scale.x).toBeGreaterThan(1)
        box.dispatchPointerleave(new MouseEvent('pointerleave'))
        finish(mat, mesh)
        expect(mesh.scale.toArray()).toEqual([1, 1, 1])
    })

    it('cancels owned in-flight tweens on leave and re-entry, including emissive', async () => {
        const { box, mat, mesh } = await makeBox(undefined, { color: 0x0000ff, emissive: 0xff0000, scale: 1.2, transition: 1 })
        const currentTweens = () => [mat, mat.color, mat.emissive, mesh.scale].flatMap(target => gsap.getTweensOf(target))
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        const entering = currentTweens()
        expect(entering).toHaveLength(4)
        box.dispatchPointerleave(new MouseEvent('pointerleave'))
        expect(entering.every(tween => tween.parent === null)).toBe(true)
        const leaving = currentTweens()
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        expect(leaving.every(tween => tween.parent === null)).toBe(true)
    })

    it('restores creation defaults when no material prop was supplied', async () => {
        const { box, mat, mesh } = await makeBox(undefined, { roughness: 0.9, transition: 1 })
        box.dispatchPointerenter(new MouseEvent('pointerenter'))
        gsap.getTweensOf(mat)[0].progress(0.4)
        expect(mat.roughness).toBeGreaterThan(0.3)
        box.dispatchPointerleave(new MouseEvent('pointerleave'))
        finish(mat, mesh)
        expect(mat.roughness).toBeCloseTo(0.3)
    })
})

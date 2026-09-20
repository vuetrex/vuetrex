import { mergeStyleSheets } from '@/lib-components/styling/stylesheets.js'
import * as THREE from 'three'
import gsap from 'gsap'
import { computed, nextTick, reactive, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { Panel } from '@/lib-components/nodes/Panel.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type { VxMaterialProps, VxHoverProps } from '@/lib-components/styling/types.js'

function setup(Kind: typeof Box | typeof Panel) {
    const scene = new THREE.Scene()
    const createMaterial = vi.fn(() => new THREE.MeshStandardMaterial({ color: 0x123456, roughness: 0.3, metalness: 0.1 }))
    const renderMesh = vi.fn((element, height, size, generate, parent = scene) => {
        if (!element.mesh) {
            element.mesh = generate(height, size)
            parent.add(element.mesh)
        }
    })
    const stage = {
        boxRadius: 1, boxDistance: 0.5, gap: 0.5,
        createElementMaterial: createMaterial, getScene: () => scene, renderMesh,
        removeObject: (element: any) => { element.mesh?.removeFromParent(); element.mesh = null },
        reconcileConnections: vi.fn(), invalidateContentBounds: vi.fn(),
        connectors: { update: vi.fn(), remove: vi.fn() },
    } as unknown as VuetrexStage
    const node = new Kind(stage)
    node.parent.value = {
        elements: shallowRef([node]), group: scene, isGroupNode: true,
        layoutPositionOf: () => new THREE.Vector3(), parent: shallowRef(null),
    } as any
    const surface = () => (node instanceof Box ? node.element.mesh : node.element.mesh!.children[0]) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
    return { node, surface, createMaterial, stage }
}

for (const Kind of [Box, Panel]) describe(`${Kind.name} shared material binding`, () => {
    it('reacts to field deletion, hover edits, and undefined bindings without rebuilding geometry', async () => {
        const { node, surface, createMaterial } = setup(Kind)
        const texture = new THREE.Texture()
        const props = reactive<VxMaterialProps>({ color: 'red', map: texture, bumpMap: texture, bumpScale: 0.02, roughness: 0.9, opacity: 0.5 })
        const hover = reactive<VxHoverProps>({ color: 'blue', transition: 0, wireframe: true })
        node.setStateValue('material', props)
        node.setStateValue('hover', hover)
        node.syncWithThree()
        node.syncWithThree()
        await nextTick()
        const mesh = surface(), material = mesh.material, geometry = mesh.geometry
        expect(material.map).toBe(texture)
        expect(material.bumpMap).toBe(texture)
        expect(material.bumpScale).toBe(0.02)
        expect(material.transparent).toBe(true)
        node.dispatchPointerenter(new MouseEvent('pointerenter'))
        expect(material.color.getHex()).toBe(0x0000ff)
        expect(material.wireframe).toBe(true)
        delete props.roughness
        delete props.map
        delete props.bumpMap
        delete props.bumpScale
        delete props.opacity
        delete hover.wireframe
        hover.color = 'green'
        await nextTick()
        expect(material.roughness).toBe(0.3)
        expect(material.map).toBeNull()
        expect(material.bumpMap).toBeNull()
        expect(material.bumpScale).toBe(1)
        expect(material.transparent).toBe(false)
        expect(material.wireframe).toBe(false)
        expect(material.color.getHex()).toBe(0x008000)
        node.setStateValue('material', undefined)
        await nextTick()
        node.dispatchPointerleave(new MouseEvent('pointerleave'))
        expect(material.color.getHex()).toBe(0x123456)
        node.dispatchPointerenter(new MouseEvent('pointerenter'))
        node.setStateValue('hover', undefined)
        await nextTick()
        expect(material.color.getHex()).toBe(0x123456)
        expect(surface().geometry).toBe(geometry)
        expect(surface().material).toBe(material)
        expect(createMaterial).toHaveBeenCalledOnce()
        node.onRemoved()
    })

    it('updates named styles and restores inline defaults without sharing hover state', async () => {
        const first = setup(Kind), second = setup(Kind)
        const definitions = shallowRef({ common: { materials: {
            accent: { base: { color: 'red', roughness: 0.8 }, hover: { color: 'blue', transition: 0 } },
        } } })
        const styles = computed(() => mergeStyleSheets([definitions.value], 'light'))
        first.stage.materialStyles = second.stage.materialStyles = styles
        for (const fixture of [first, second]) {
            fixture.node.setStateValue('material', 'accent')
            fixture.node.syncWithThree()
        }
        await nextTick()
        first.node.dispatchPointerenter(new MouseEvent('pointerenter'))
        expect(first.surface().material.color.getHex()).toBe(0x0000ff)
        expect(second.surface().material.color.getHex()).toBe(0xff0000)
        definitions.value = { common: { materials: {
            accent: { base: { color: 'green', roughness: 0.2 }, hover: { color: 'white', transition: 0 } },
        } } }
        await nextTick()
        expect(first.surface().material.color.getHex()).toBe(0xffffff)
        expect(second.surface().material.color.getHex()).toBe(0x008000)
        first.node.setStateValue('material', undefined)
        await nextTick()
        expect(first.surface().material.color.getHex()).toBe(0x123456)
        first.node.onRemoved(); second.node.onRemoved()
    })

    it('cancels transitions on unmount and disposes replaced/final geometry and material once', async () => {
        const { node, surface } = setup(Kind)
        const texture = new THREE.Texture()
        const textureDispose = vi.spyOn(texture, 'dispose')
        node.setStateValue('material', { map: texture })
        node.setStateValue('hover', { color: 'red', emissive: 'blue', scale: 1.1, transition: 1 })
        node.syncWithThree()
        await nextTick()
        const oldGeometryDispose = vi.spyOn(surface().geometry, 'dispose')
        node.dispatchPointerenter(new MouseEvent('pointerenter'))
        node.setStateValue('size', 2)
        await nextTick()
        expect(oldGeometryDispose).toHaveBeenCalledOnce()
        const { material, geometry } = surface()
        const geometryDispose = vi.spyOn(geometry, 'dispose'), materialDispose = vi.spyOn(material, 'dispose')
        const target = node.element.mesh!
        node.dispatchPointerleave(new MouseEvent('pointerleave'))
        node.onRemoved()
        node.onRemoved()
        node.syncWithThree()
        await nextTick()
        expect(geometryDispose).toHaveBeenCalledOnce()
        expect(materialDispose).toHaveBeenCalledOnce()
        expect(textureDispose).not.toHaveBeenCalled()
        for (const object of [material, material.color, material.emissive, target.scale]) {
            expect(gsap.getTweensOf(object)).toHaveLength(0)
        }
    })
})

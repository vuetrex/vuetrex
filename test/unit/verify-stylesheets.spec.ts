import * as THREE from 'three'
import { computed, defineComponent, h, inject, nextTick, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { VxStyleSheet, defineVxStyleSheet, materialStylesKey, mergeStyleSheets, resolveMaterialBinding } from '@/lib-components/styling/stylesheets.js'
import { resolveMaterial } from '@/lib-components/styling/resolveMaterial.js'
import { useCanvasTexture } from '@/lib-components/styling/textures.js'
import { finishes } from '@/lib-components/styling/finishes.js'
import { InstanceNode } from '@/lib-components/nodes/InstanceNode.js'
import { GeometryNode } from '@/lib-components/geometry/GeometryNode.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { geo } from '@/lib-components/geometry/index.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function fixture() {
    const styles = ref(mergeStyleSheets([defineVxStyleSheet({ common: { materials: {
        metal: { base: { color: 'red', metalness: 1 } }, accent: { extends: 'metal', base: { roughness: 0.2 } },
    } } })], 'light'))
    const scene = new THREE.Scene()
    const stage = { boxRadius: 1, boxDistance: 1, gap: 1, materialStyles: computed(() => styles.value),
        getScene: () => scene, createElementMaterial: () => new THREE.MeshStandardMaterial({ roughness: 0.3 }),
        connectors: { update: vi.fn(), remove: vi.fn() }, invalidateContentBounds: vi.fn(),
    } as unknown as VuetrexStage
    return { stage, styles, parent: new GroupNode(stage) }
}

describe('named materials and resource helpers', () => {
    it('composes sheets, variants, inheritance and inline hover without mutating textures', () => {
        const map = new THREE.Texture()
        const sheet = defineVxStyleSheet({ common: { materials: {
            metal: { base: { metalness: 0.9, map }, hover: { scale: 1.1, color: 'blue' } },
            trim: { extends: 'metal', base: { roughness: 0.2 } },
        } }, dark: { materials: { metal: { base: { color: 'red' } } } } })
        const styles = mergeStyleSheets([sheet, { common: { materials: { trim: { base: { roughness: 0.4 } } } } }], 'dark')
        const binding = resolveMaterialBinding(styles, { preset: 'trim', map: null }, { scale: 1.2 })
        const value = resolveMaterial(...binding.layers)
        expect(value.metalness).toBe(0.9); expect(value.roughness).toBe(0.4); expect(value.map).toBeNull()
        expect(binding.hover).toEqual({ scale: 1.2, color: 'blue' })
        expect(Object.isFrozen(map)).toBe(false)
        expect(sheet.common!.materials!.metal.base!.map).toBe(map)
        expect(() => mergeStyleSheets([{ common: { materials: { a: { extends: 'b' }, b: { extends: 'a' } } } }], 'light')).toThrow('cycle')
        expect(() => resolveMaterialBinding(styles, 'missing')).toThrow('Unknown')
    })
    it('provides reactive styles without a DOM wrapper and updates scheme/removal', async () => {
        const Probe = defineComponent({ setup() { const styles = inject(materialStylesKey)!; return () => h('span', Object.keys(styles.value).join(',')) } })
        const wrapper = mount(VxStyleSheet, { props: { sheets: [{ dark: { materials: { dark: { base: { color: 'black' } } } } }], scheme: 'dark' }, slots: { default: () => h(Probe) } })
        expect(wrapper.text()).toBe('dark')
        await wrapper.setProps({ scheme: 'light' }); expect(wrapper.text()).toBe('')
        wrapper.unmount()
    })
    it('keeps independent plain finish values', () => {
        const a = finishes.satinMetal(), b = finishes.satinMetal()
        a.metalness = 0
        expect(b.metalness).toBe(0.92)
        expect(finishes.tintedGlass({ opacity: 0.4 })).toMatchObject({ alphaMode: 'blend', opacity: 0.4, depthWrite: false })
    })
    it.each(['color', 'bump'] as const)('redraws an owned %s canvas texture in place and disposes after unmount', async purpose => {
        const context = { save: vi.fn(), restore: vi.fn(), resetTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
        const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as any)
        const color = ref('red'); let texture!: ReturnType<typeof useCanvasTexture>
        const wrapper = mount(defineComponent({ setup() {
            texture = useCanvasTexture(ctx => { ctx.fillStyle = color.value; ctx.fillRect(0, 0, 4, 4) }, { purpose, width: 4, height: 4 })
            return () => h('div')
        } }))
        const first = texture.value!, version = first.version, dispose = vi.spyOn(first, 'dispose')
        expect(first.colorSpace).toBe(purpose === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace)
        color.value = 'blue'; await nextTick()
        expect(texture.value).toBe(first); expect(first.version).toBeGreaterThan(version); expect(context.fillStyle).toBe('blue')
        wrapper.unmount(); expect(dispose).toHaveBeenCalledOnce(); canvas.mockRestore()
    })
    it('resets instance materials and keeps their identity and borrowed textures', async () => {
        const { stage, parent } = fixture(), node = new InstanceNode(stage)
        const texture = new THREE.Texture(), dispose = vi.spyOn(texture, 'dispose')
        parent.appendChild(node); node.setStateValue('material', { preset: 'accent', map: texture, bumpMap: texture, bumpScale: 0.01, opacity: 0.5 })
        node.syncWithThree(); await nextTick()
        const material = node.material, matDispose = vi.spyOn(material, 'dispose')
        expect(material.transparent).toBe(true); expect(material.map).toBe(texture)
        expect(material.bumpMap).toBe(texture); expect(material.bumpScale).toBe(0.01)
        node.setStateValue('material', undefined); await nextTick()
        expect(node.material).toBe(material); expect(material.map).toBeNull(); expect(material.roughness).toBe(0.3)
        expect(material.transparent).toBe(false)
        expect(material.bumpMap).toBeNull(); expect(material.bumpScale).toBe(1)
        node.onRemoved(); node.onRemoved(); expect(matDispose).toHaveBeenCalledOnce(); expect(dispose).not.toHaveBeenCalled()
    })
    it('restores procedural channels, invalidates programs, and preserves geometry across stylesheet edits', async () => {
        const { stage, styles, parent } = fixture(), node = new GeometryNode(stage)
        const map = new THREE.Texture(), mapDispose = vi.spyOn(map, 'dispose')
        parent.appendChild(node); node.setStateValue('graph', geo.box().material('accent'))
        node.setStateValue('materials', { accent: { preset: 'accent', map, bumpMap: map, bumpScale: 0.02, opacity: 0.5 } })
        node.syncWithThree(); await nextTick()
        const mesh = node.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
        const material = mesh.material, geometry = mesh.geometry, version = material.version
        const dispose = vi.spyOn(material, 'dispose')
        expect(material.map).toBe(map); expect(material.transparent).toBe(true)
        expect(material.bumpMap).toBe(map); expect(material.bumpScale).toBe(0.02)
        node.setStateValue('materials', { accent: { preset: 'accent', map, bumpMap: map, bumpScale: 0.005, opacity: 0.5 } })
        await nextTick()
        expect(material.bumpScale).toBe(0.005); expect(material.version).toBe(version)
        expect(mesh.geometry).toBe(geometry)
        node.setStateValue('materials', undefined); await nextTick()
        expect(material.map).toBeNull(); expect(material.transparent).toBe(false); expect(material.version).toBeGreaterThan(version)
        expect(material.bumpMap).toBeNull(); expect(material.bumpScale).toBe(1)
        styles.value = mergeStyleSheets([{ common: { materials: { accent: { base: { color: 'blue' } } } } }], 'light')
        await nextTick()
        expect(mesh.material).toBe(material); expect(mesh.geometry).toBe(geometry)
        expect(material.color.getHex()).toBe(0x0000ff); expect(material.metalness).toBe(0); expect(material.roughness).toBe(0.3)
        node.onRemoved(); node.onRemoved(); expect(dispose).toHaveBeenCalledOnce(); expect(mapDispose).not.toHaveBeenCalled()
    })
})

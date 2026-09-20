import * as THREE from 'three'
import gsap from 'gsap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyResolvedMaterial, materialTextureFields, readMaterial } from '@/lib-components/nodes/material.js'
import { resolveMaterial } from '@/lib-components/styling/resolveMaterial.js'
import { MaterialController } from '@/lib-components/styling/MaterialController.js'
import type { VxMaterialProps } from '@/lib-components/styling/types.js'

const controllers: MaterialController[] = []
function controller() {
    const material = new THREE.MeshStandardMaterial({ color: 0x123456, roughness: 0.3, metalness: 0.1 })
    const control = new MaterialController(material)
    controllers.push(control)
    return { material, control }
}
function finish(material: THREE.MeshStandardMaterial, target?: THREE.Object3D) {
    for (const object of [material.color, material.emissive, material, target?.scale]) {
        if (object) gsap.getTweensOf(object).forEach(tween => tween.progress(1))
    }
}
afterEach(() => controllers.splice(0).forEach(control => control.dispose()))

describe('complete material resolution', () => {
    it('resolves ordered immutable layers, linear colors, and borrowed textures', () => {
        const texture = new THREE.Texture()
        const inputColor = new THREE.Color(0x123456)
        const defaults = Object.freeze({ color: inputColor, roughness: 0.3, map: texture })
        const override = Object.freeze({ color: 'red', roughness: undefined, map: null })
        const next = resolveMaterial(defaults, override)
        expect(next.color).toEqual([1, 0, 0])
        expect(next.roughness).toBe(0.3)
        expect(next.map).toBeNull()
        expect(resolveMaterial(defaults).map).toBe(texture)
        expect(inputColor.getHex()).toBe(0x123456)
        expect(Object.isFrozen(next)).toBe(true)
        expect(Object.isFrozen(next.color)).toBe(true)
        expect(Object.isFrozen(texture)).toBe(false)
    })

    it('defines alpha inference and explicit modes without changing depth-write defaults', () => {
        expect(resolveMaterial({ opacity: 0.4 })).toMatchObject({ alphaMode: 'blend', depthWrite: true, alphaTest: 0 })
        expect(resolveMaterial({ opacity: 0.4, alphaMode: 'opaque', alphaTest: 0.2 })).toMatchObject({ alphaMode: 'opaque', alphaTest: 0 })
        expect(resolveMaterial({ alphaMode: 'mask' })).toMatchObject({ alphaTest: 0.5 })
        expect(resolveMaterial({ alphaTest: 0.2 })).toMatchObject({ alphaMode: 'mask', alphaTest: 0.2 })
        expect(resolveMaterial({ alphaMode: 'blend', depthWrite: false })).toMatchObject({ depthWrite: false })
    })

    it('resets every supported field, including explicit null texture removal', () => {
        const { material, control } = controller()
        const initial = resolveMaterial(readMaterial(material))
        const texture = new THREE.Texture()
        const overrides: VxMaterialProps = {
            color: 'red', opacity: 0.4, alphaMode: 'mask', alphaTest: 0.7,
            roughness: 0.9, metalness: 0.8, emissive: 'blue', emissiveIntensity: 0.6,
            wireframe: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
            flatShading: true, toneMapped: false, envMapIntensity: 2, bumpScale: 0.04,
            ...Object.fromEntries(materialTextureFields.map(key => [key, texture])),
        }
        control.update([overrides])
        expect(resolveMaterial(readMaterial(material))).toEqual(resolveMaterial(overrides))
        control.update([{ color: 'red' }])
        expect(resolveMaterial(readMaterial(material))).toEqual({ ...initial, color: [1, 0, 0] })
        control.update([undefined])
        expect(resolveMaterial(readMaterial(material))).toEqual(initial)
        expect(material.map).toBeNull()
    })

    it('restores borrowed stage textures and lets null clear a lower-priority slot', () => {
        const texture = new THREE.Texture()
        const material = new THREE.MeshStandardMaterial({ map: texture })
        const control = new MaterialController(material)
        controllers.push(control)
        control.update([{ map: null }])
        expect(material.map).toBeNull()
        control.update([{ map: undefined }])
        expect(material.map).toBe(texture)
        control.update([], { map: null, transition: 0 })
        control.setHovered(true)
        expect(material.map).toBeNull()
        control.setHovered(false)
        expect(material.map).toBe(texture)
    })

    it('preserves identity and marks only program-affecting updates for recompilation', () => {
        const { material, control } = controller()
        const version = material.version
        control.update([{ color: 'red', roughness: 0.7, depthWrite: false }])
        expect(material.version).toBe(version)
        for (const props of [
            { flatShading: true }, { toneMapped: false }, { side: THREE.DoubleSide },
            { wireframe: true }, { alphaMode: 'blend' as const }, { alphaMode: 'mask' as const },
            ...materialTextureFields.map(key => ({ [key]: new THREE.Texture() })),
        ]) {
            const before = material.version
            control.update([props])
            expect(material.version).toBeGreaterThan(before)
            const applied = material.version
            control.update([props])
            expect(material.version).toBe(applied)
        }
        expect(control.material).toBe(material)
        control.update([{ alphaMode: 'mask', alphaTest: 0.3 }])
        const maskVersion = material.version
        control.update([{ alphaMode: 'mask', alphaTest: 0.6 }])
        expect(material.version).toBe(maskVersion)
    })

    it('resolves bump defaults, replaces maps, and changes strength without recompilation', () => {
        const original = new THREE.Texture(), replacement = new THREE.Texture()
        const originalDispose = vi.spyOn(original, 'dispose'), replacementDispose = vi.spyOn(replacement, 'dispose')
        const material = new THREE.MeshStandardMaterial({ bumpMap: original, bumpScale: 0.2 })
        const control = new MaterialController(material)
        controllers.push(control)
        const dispose = vi.spyOn(material, 'dispose')
        expect(resolveMaterial()).toMatchObject({ bumpMap: null, bumpScale: 1 })
        const version = material.version
        control.update([{ bumpScale: 0 }])
        expect(material.bumpScale).toBe(0)
        expect(material.bumpMap).toBe(original)
        expect(material.version).toBe(version)
        control.update([{ bumpMap: replacement, bumpScale: -0.03 }])
        expect(material.bumpMap).toBe(replacement)
        expect(material.bumpScale).toBe(-0.03)
        expect(material.version).toBeGreaterThan(version)
        const replaced = material.version
        control.update([{ bumpMap: replacement, bumpScale: 0.01 }])
        expect(material.version).toBe(replaced)
        control.update([{ bumpMap: null }])
        expect(material.bumpMap).toBeNull()
        expect(material.bumpScale).toBe(0.2)
        expect(material.version).toBeGreaterThan(replaced)
        control.update([undefined])
        expect(material.bumpMap).toBe(original)
        expect(material.bumpScale).toBe(0.2)
        expect(control.material).toBe(material)
        control.dispose(); control.dispose()
        expect(dispose).toHaveBeenCalledOnce()
        expect(originalDispose).not.toHaveBeenCalled()
        expect(replacementDispose).not.toHaveBeenCalled()
    })

    it('interrupts bump hover transitions and retains bump data when a normal map takes precedence', () => {
        const { material, control } = controller()
        const bumpMap = new THREE.Texture(), normalMap = new THREE.Texture()
        control.update([{ bumpMap, bumpScale: 0.01 }], { bumpScale: 0.05, transition: 1 })
        control.setHovered(true)
        const tween = gsap.getTweensOf(material)[0]
        tween.progress(0.5)
        expect(material.bumpScale).toBeGreaterThan(0.01)
        expect(material.bumpScale).toBeLessThan(0.05)
        control.update([{ bumpMap, normalMap, bumpScale: 0.02 }])
        expect(tween.parent).toBeNull()
        expect(material.bumpScale).toBe(0.02)
        expect(material.bumpMap).toBe(bumpMap)
        expect(material.normalMap).toBe(normalMap)
        const version = material.version
        control.update([{ bumpMap, normalMap: null, bumpScale: 0.02 }])
        expect(material.normalMap).toBeNull()
        expect(material.bumpMap).toBe(bumpMap)
        expect(material.version).toBeGreaterThan(version)
        control.update([undefined])
        expect(material.bumpMap).toBeNull()
        expect(material.bumpScale).toBe(1)
    })

    it('applies complete descriptors without owning caller textures', () => {
        const material = new THREE.MeshStandardMaterial()
        const texture = new THREE.Texture()
        const dispose = vi.spyOn(texture, 'dispose')
        applyResolvedMaterial(material, resolveMaterial({ map: texture }))
        applyResolvedMaterial(material, resolveMaterial())
        material.dispose()
        expect(dispose).not.toHaveBeenCalled()
    })
})

describe('material controller transitions and ownership', () => {
    it('does not share material or hover state across independent bindings', () => {
        const a = controller(), b = controller()
        const hover = Object.freeze({ color: 'red', emissive: 'blue', transition: 0 })
        for (const entry of [a, b]) entry.control.update([], hover)
        a.control.setHovered(true)
        expect(a.material.color.getHex()).toBe(0xff0000)
        expect(b.material.color.getHex()).toBe(0x123456)
        a.control.setHovered(false)
        expect(a.material.color.equals(b.material.color)).toBe(true)
    })

    it('cancels color, emissive, opacity, and scale tweens and resolves new props while hovered', () => {
        const { control, material } = controller()
        const object = new THREE.Object3D()
        object.scale.set(2, 3, 4)
        control.setTarget(object)
        control.update([{ color: 'blue' }], { color: 'red', emissive: 'green', opacity: 0.2, scale: 1.5, transition: 1 })
        control.setHovered(true)
        const oldTweens = [material, material.color, material.emissive, object.scale].flatMap(target => gsap.getTweensOf(target))
        oldTweens.forEach(tween => tween.progress(0.4))
        control.update([{ color: 'yellow', roughness: 0.6 }], { emissive: 'blue', transition: 0 })
        expect(oldTweens.every(tween => tween.parent === null)).toBe(true)
        expect(material.color.getHex()).toBe(0xffff00)
        expect(material.emissive.getHex()).toBe(0x0000ff)
        expect(material.opacity).toBe(1)
        expect(material.transparent).toBe(false)
        expect(object.scale.toArray()).toEqual([2, 3, 4])
        control.setHovered(false)
        expect(material.emissive.getHex()).toBe(0)
        expect(material.roughness).toBe(0.6)
    })

    it('supports interrupted leave/re-entry without stale alpha completion callbacks', () => {
        const { control, material } = controller()
        control.update([], { opacity: 0.3, transition: 1 })
        control.setHovered(true)
        finish(material)
        control.setHovered(false)
        expect(material.transparent).toBe(true)
        const leaving = gsap.getTweensOf(material)[0]
        leaving.progress(0.5)
        control.setHovered(true)
        expect(leaving.parent).toBeNull()
        finish(material)
        expect(material.opacity).toBe(0.3)
        expect(material.transparent).toBe(true)
        control.setHovered(false)
        finish(material)
        expect(material.opacity).toBe(1)
        expect(material.transparent).toBe(false)
    })

    it('restores defaults when hover or the base binding is removed during hover', () => {
        const { control, material } = controller()
        control.update([{ roughness: 0.9 }], { color: 'red', transition: 0 })
        control.setHovered(true)
        control.update([undefined], { color: 'red', transition: 0 })
        expect(material.roughness).toBe(0.3)
        expect(material.color.getHex()).toBe(0xff0000)
        control.update([undefined], undefined)
        expect(material.color.getHex()).toBe(0x123456)
        control.setHovered(false)
        finish(material)
        expect(material.color.getHex()).toBe(0x123456)
    })

    it('moves active appearance to replacement geometry and cancels detached scale tweens', () => {
        const { control, material } = controller()
        const first = new THREE.Object3D(), second = new THREE.Object3D()
        control.setTarget(first)
        control.update([], { scale: 2, color: 'red', transition: 1 })
        control.setHovered(true)
        const tween = gsap.getTweensOf(first.scale)[0]
        tween.progress(0.5)
        control.setTarget(second)
        expect(tween.parent).toBeNull()
        expect(first.scale.x).toBe(1)
        expect(second.scale.x).toBe(2)
        expect(material.color.getHex()).toBe(0xff0000)
    })

    it('leaves independently authored transforms alone until a scale hover takes ownership', () => {
        const { control } = controller()
        const target = new THREE.Object3D()
        control.setTarget(target)
        target.scale.set(2, 3, 4)
        control.update([{ color: 'red' }], { emissive: 'blue', transition: 0 })
        control.setHovered(true)
        control.setHovered(false)
        expect(target.scale.toArray()).toEqual([2, 3, 4])
        control.update([], { scale: 2, transition: 0 })
        control.setHovered(true)
        expect(target.scale.toArray()).toEqual([4, 6, 8])
        control.setHovered(false)
        expect(target.scale.toArray()).toEqual([2, 3, 4])
        target.scale.setScalar(5)
        control.update([])
        expect(target.scale.toArray()).toEqual([5, 5, 5])
    })

    it('cancels all owned tweens and disposes exactly once without disposing textures', () => {
        const { control, material } = controller()
        const texture = new THREE.Texture(), hoverTexture = new THREE.Texture()
        const dispose = vi.spyOn(material, 'dispose')
        const textureDispose = vi.spyOn(texture, 'dispose'), hoverDispose = vi.spyOn(hoverTexture, 'dispose')
        const target = new THREE.Object3D()
        control.setTarget(target)
        control.update([{ map: texture }], { map: hoverTexture, color: 'red', emissive: 'blue', scale: 2, transition: 1 })
        control.setHovered(true)
        control.dispose()
        control.dispose()
        control.update([{ color: 'green' }])
        control.setHovered(false)
        for (const object of [material, material.color, material.emissive, target.scale]) {
            expect(gsap.getTweensOf(object)).toHaveLength(0)
        }
        expect(dispose).toHaveBeenCalledOnce()
        expect(textureDispose).not.toHaveBeenCalled()
        expect(hoverDispose).not.toHaveBeenCalled()
    })
})

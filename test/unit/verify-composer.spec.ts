import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { mergeComposerOptions, resolveComposerOptions } from '@/lib-components/scene/composer.js'
import { defineVxStyleSheet, mergeComposerStyleSheets } from '@/lib-components/styling/stylesheets.js'
import { ComposerDeclaration } from '@/lib-components/scene/declarations.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { ComposerController } from '@/lib-components/three/postprocessing/ComposerController.js'

describe('composer configuration', () => {
    it('expands the last preset beneath merged explicit fields without mutating input', () => {
        const bloom = { strength: 0.5 } as const
        const layers = [{ preset: 'technical', bloom }, { preset: 'luminous', output: { exposure: 1.2 } }] as const
        const resolved = resolveComposerOptions(...layers)
        expect(resolved).toMatchObject({ preset: 'luminous', quality: 'balanced', maxPixelRatio: 1.5,
            output: { toneMapping: 'aces', exposure: 1.2 },
            bloom: { mode: 'selected', strength: 0.5, radius: 0.3, threshold: 0 } })
        expect(bloom).toEqual({ strength: 0.5 })
        expect(Object.isFrozen(resolved)).toBe(true)
        expect(Object.isFrozen(resolved!.bloom)).toBe(true)
    })

    it('implements ordered false, true, object, removal, and quality cap semantics', () => {
        expect(resolveComposerOptions({ preset: 'luminous' }, { bloom: false })!.bloom).toBe(false)
        expect(resolveComposerOptions({ preset: 'luminous', bloom: { strength: 0.9 } }, { bloom: true })!.bloom)
            .toEqual({ mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 })
        expect(resolveComposerOptions({ bloom: false }, { bloom: { mode: 'luminance' } })!.bloom)
            .toEqual({ mode: 'luminance', strength: 0.3, radius: 0.3, threshold: 1 })
        expect(resolveComposerOptions({ quality: 'low', maxPixelRatio: 2 })!.maxPixelRatio).toBe(1)
        expect(mergeComposerOptions({ bloom: { strength: 0.2 } }, { bloom: false }, { bloom: { radius: 0.7 } })!.bloom)
            .toEqual({ radius: 0.7 })
    })

    it.each([
        [{ nope: true }, 'composer.nope'],
        [{ ambientOcclusion: true }, 'composer.ambientOcclusion'],
        [{ grading: true }, 'composer.grading'],
        [{ output: { exposure: 0 } }, 'composer.output.exposure'],
        [{ bloom: { strength: 3 } }, 'composer.bloom.strength'],
        [{ bloom: { mode: 'wrong' } }, 'composer.bloom.mode'],
        [{ maxPixelRatio: Number.NaN }, 'composer.maxPixelRatio'],
    ] as const)('reports invalid and deferred options at their property path', (value, path) => {
        expect(() => resolveComposerOptions(value as any)).toThrow(path)
    })

    it('merges immutable stylesheet common/scheme composer layers', () => {
        const sheet = defineVxStyleSheet({ common: { composer: { preset: 'technical', bloom: { strength: 0.2 } } },
            dark: { composer: { preset: 'luminous', bloom: { radius: 0.7 } } } })
        expect(Object.isFrozen(sheet.common!.composer)).toBe(true)
        expect(resolveComposerOptions(mergeComposerStyleSheets([sheet], 'dark'))).toMatchObject({
            preset: 'luminous', bloom: { strength: 0.2, radius: 0.7 },
        })
        expect(resolveComposerOptions(mergeComposerStyleSheets([sheet], 'light'))).toMatchObject({ preset: 'technical' })
    })

    it('keeps the declaration host-only, normalizes prop spellings, and restores stylesheet ownership', async () => {
        const setComposerDeclaration = vi.fn()
        const stage = { boxDistance: 1, gap: 1, getScene: () => new THREE.Scene(), setComposerDeclaration,
            connectors: { update: vi.fn(), remove: vi.fn() }, invalidateContentBounds: vi.fn() } as unknown as VuetrexStage
        const parent = new GroupNode(stage)
        const declaration = new ComposerDeclaration(stage)
        declaration.setStateValue('max-pixel-ratio', 1.25)
        declaration.setStateValue('bloom', { mode: 'selected', strength: 0.4 })
        parent.appendChild(declaration)
        declaration.syncWithThree()
        await nextTick()
        expect(parent.elements.value).toHaveLength(0)
        expect(setComposerDeclaration).toHaveBeenCalledWith(expect.objectContaining({ maxPixelRatio: 1.25 }))

        const output = reactive({ exposure: 1 })
        const bloom = reactive({ mode: 'selected' as const, strength: 0.3 })
        declaration.setStateValue('output', output)
        declaration.setStateValue('bloom', bloom)
        await nextTick()
        setComposerDeclaration.mockClear()
        output.exposure = 1.4
        bloom.strength = 0.7
        await nextTick()
        expect(setComposerDeclaration).toHaveBeenCalledWith(expect.objectContaining({
            output: { exposure: 1.4 }, bloom: { mode: 'selected', strength: 0.7 },
        }))
        declaration.setStateValue('enabled', false)
        await nextTick()
        expect(setComposerDeclaration).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
        declaration.onRemoved(); declaration.onRemoved()
        expect(setComposerDeclaration).toHaveBeenLastCalledWith(undefined)
    })
})

describe('node bloom metadata', () => {
    it('inherits membership and gain independently and validates authored values', () => {
        const stage = { boxDistance: 1, gap: 1, getScene: () => new THREE.Scene(),
            connectors: { update: vi.fn(), remove: vi.fn() }, invalidateContentBounds: vi.fn() } as unknown as VuetrexStage
        const parent = new GroupNode(stage), child = new GroupNode(stage)
        parent.appendChild(child)
        parent.setStateValue('effects', { bloom: 'include', bloomGain: 0.5 })
        child.setStateValue('effects', { bloomGain: 0 })
        expect(child.resolvedNodeEffects()).toEqual({ bloom: 'include', bloomGain: 0 })
        child.setStateValue('effects', undefined)
        expect(child.resolvedNodeEffects()).toEqual({ bloom: 'include', bloomGain: 0.5 })
        expect(() => child.setStateValue('effects', { bloom: 'yes' })).toThrow('effects.bloom')
        expect(() => child.setStateValue('effects', { bloomGain: 5 })).toThrow('effects.bloomGain')
    })
})

describe('composer controller ownership', () => {
    it('updates parameters in place, replaces topology by key, and restores legacy state', () => {
        let ratio = 2
        const renderer = {
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1,
            outputColorSpace: THREE.SRGBColorSpace,
            getPixelRatio: () => ratio,
            setPixelRatio: (value: number) => { ratio = value },
            getSize: (target: THREE.Vector2) => target.set(320, 180),
            setSize: vi.fn(),
        } as unknown as THREE.WebGLRenderer
        const controller = new ComposerController(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 320, 180)
        controller.configure({ preset: 'luminous', maxPixelRatio: 1.25, reducedEffects: false })
        const first = controller.diagnostics()
        expect(first.passKeys).toContain('bloom:selected')
        expect(first.targetSize.pixelRatio).toBe(1.25)

        controller.configure({ preset: 'luminous', reducedEffects: false, bloom: { strength: 0.8 } })
        const parameters = controller.diagnostics()
        expect(parameters.allocations).toBe(first.allocations)
        expect(parameters.effective!.bloom).toMatchObject({ strength: 0.8 })

        controller.configure({ bloom: { mode: 'luminance' } })
        expect(controller.diagnostics().allocations).toBe(first.allocations + 1)

        const source = new THREE.MeshStandardMaterial({ emissive: 0x0000ff, emissiveIntensity: 2 })
        const object = new THREE.Mesh(new THREE.BoxGeometry(), source)
        const mask = (controller as any).emissionMaterial(source, 0.4, 0.1, object) as THREE.MeshBasicMaterial
        const disposeMask = vi.spyOn(mask, 'dispose')
        expect(mask.color.b).toBe(2)
        expect(mask.userData.vxBloomUniforms.threshold.value).toBe(0.4)
        expect(mask.userData.vxBloomUniforms.gain.value).toBe(0.1)
        const shader = { uniforms: {}, fragmentShader: 'vec3 outgoingLight = reflectedLight.indirectDiffuse;' }
        mask.onBeforeCompile(shader as any, renderer)
        expect(shader.fragmentShader.indexOf('vxLuminance')).toBeLessThan(shader.fragmentShader.indexOf('outgoingLight * vxBloomGain'))

        const textSource = new THREE.MeshBasicMaterial()
        Object.defineProperty(textSource, 'isTroikaTextMaterial', { value: true })
        const text = new THREE.Mesh(new THREE.PlaneGeometry(), textSource) as THREE.Mesh & {
            createDerivedMaterial: (base: THREE.Material) => THREE.Material
        }
        text.createDerivedMaterial = base => {
            Object.defineProperty(base, 'isTroikaTextMaterial', { value: true })
            return base
        }
        const textMask = (controller as any).emissionMaterial(textSource, 0.2, 0.7, text) as THREE.Material
        expect((textMask as any).isTroikaTextMaterial).toBe(true)
        expect(textMask.userData.vxBloomUniforms).toEqual({ threshold: { value: 0.2 }, gain: { value: 0.7 } })
        text.geometry.dispose()

        const map = new THREE.Texture(), alphaMap = new THREE.Texture()
        const cutout = new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: 0.42, side: THREE.DoubleSide })
        const occluder = (controller as any).blackMaterial(new THREE.Mesh(new THREE.PlaneGeometry(), cutout), cutout) as THREE.MeshBasicMaterial
        expect(occluder.map).toBe(map)
        expect(occluder.alphaMap).toBe(alphaMap)
        expect(occluder.alphaTest).toBe(0.42)
        expect(occluder.side).toBe(THREE.DoubleSide)
        expect(occluder.depthWrite).toBe(true)

        controller.configure({ bloom: false })
        expect(disposeMask).toHaveBeenCalledOnce()
        controller.configure(undefined)
        expect(controller.diagnostics().passKeys).toEqual(['legacy-render'])
        expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
        expect(renderer.toneMappingExposure).toBe(1)
        controller.destroy(); controller.destroy()
    })
})

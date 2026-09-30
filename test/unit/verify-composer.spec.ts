import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { mergeComposerOptions, resolveComposerOptions } from '@/lib-components/scene/composer.js'
import { defineVxStyleSheet, mergeComposerStyleSheets } from '@/lib-components/styling/stylesheets.js'
import { ComposerDeclaration } from '@/lib-components/scene/declarations.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { ComposerController } from '@/lib-components/three/postprocessing/ComposerController.js'
import { AnnotationPass } from '@/lib-components/three/postprocessing/AnnotationPass.js'

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
        [{ ambientOcclusion: { intensity: 2 } }, 'composer.ambientOcclusion.intensity'],
        [{ grading: { contrast: -1 } }, 'composer.grading.contrast'],
        [{ output: { exposure: 0 } }, 'composer.output.exposure'],
        [{ bloom: { strength: 3 } }, 'composer.bloom.strength'],
        [{ bloom: { mode: 'wrong' } }, 'composer.bloom.mode'],
        [{ maxPixelRatio: Number.NaN }, 'composer.maxPixelRatio'],
    ] as const)('reports invalid options at their property path', (value, path) => {
        expect(() => resolveComposerOptions(value as any)).toThrow(path)
    })

    it('resolves depth, image treatment, focus, outlines, annotation protection, and borrowed LUTs', () => {
        const texture = new THREE.Data3DTexture(new Uint8Array(2 * 2 * 2 * 4), 2, 2, 2)
        const resolved = resolveComposerOptions({
            ambientOcclusion: true,
            grading: { contrast: 1.1, saturation: 0.8 },
            vignette: true,
            depthOfField: { focus: [1, 2, 3], maxBlur: 0.01 },
            outlines: { color: '#22ccff', thickness: 2 },
            lut: { texture, intensity: 0.5 },
            protectAnnotations: true,
        })!
        expect(resolved).toMatchObject({
            ambientOcclusion: { intensity: 0.2, radius: 0.25 },
            grading: { contrast: 1.1, saturation: 0.8 },
            vignette: { strength: 0.1, offset: 0.8 },
            depthOfField: { focus: [1, 2, 3], aperture: 0.0002, maxBlur: 0.01 },
            outlines: { color: '#22ccff', thickness: 2 },
            lut: { texture, intensity: 0.5 }, protectAnnotations: true,
        })
        expect(Object.isFrozen(resolved.lut)).toBe(true)
        expect(Object.isFrozen(texture)).toBe(false)
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
        parent.setStateValue('effects', { bloom: 'include', bloomGain: 0.5, outline: 'include' })
        child.setStateValue('effects', { bloomGain: 0 })
        expect(child.resolvedNodeEffects()).toEqual({ bloom: 'include', bloomGain: 0, outline: 'include' })
        child.setStateValue('effects', undefined)
        expect(child.resolvedNodeEffects()).toEqual({ bloom: 'include', bloomGain: 0.5, outline: 'include' })
        expect(() => child.setStateValue('effects', { bloom: 'yes' })).toThrow('effects.bloom')
        expect(() => child.setStateValue('effects', { bloomGain: 5 })).toThrow('effects.bloomGain')
    })
})

describe('composer controller ownership', () => {
    function rendererFixture(): THREE.WebGLRenderer {
        let ratio = 1
        return {
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1,
            outputColorSpace: THREE.SRGBColorSpace,
            getPixelRatio: () => ratio,
            setPixelRatio: (value: number) => { ratio = value },
            getSize: (target: THREE.Vector2) => target.set(320, 180),
            setSize: vi.fn(),
        } as unknown as THREE.WebGLRenderer
    }

    it.each([0, 2, 8])('preserves high-quality scene edges within the hardware sample limit (%i)', (maxSamples) => {
        const renderer = rendererFixture()
        Object.assign(renderer, { capabilities: { maxSamples } })
        const controller = new ComposerController(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 320, 180)
        controller.configure({ quality: 'high', antialias: 'auto' })
        const first = (controller as any).managed.composer
        expect(first.renderTarget1.samples).toBe(Math.min(4, maxSamples))
        expect(first.renderTarget2.samples).toBe(Math.min(4, maxSamples))
        const dispose = vi.spyOn(first, 'dispose')
        controller.configure({ quality: 'high', antialias: 'fxaa' })
        expect(dispose).toHaveBeenCalledOnce()
        expect((controller as any).managed.composer.renderTarget1.samples).toBe(0)
        controller.configure({ quality: 'balanced', antialias: 'auto' })
        expect((controller as any).managed.composer.renderTarget1.samples).toBe(0)
        controller.destroy()
    })

    it('builds and updates the complete depth and image-treatment pipeline', () => {
        const renderer = rendererFixture()
        const controller = new ComposerController(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 320, 180)
        const texture = new THREE.Data3DTexture(new Uint8Array(32), 2, 2, 2)
        controller.configure({ reducedEffects: false, ambientOcclusion: true, grading: true, vignette: true,
            depthOfField: { focus: 4 }, outlines: true, lut: { texture }, protectAnnotations: true })
        expect(controller.diagnostics().passKeys).toEqual(expect.arrayContaining([
            'ao:on', 'dof:on', 'grade:on', 'lut:on', 'outline:on', 'annotations:on',
        ]))
        expect(controller.diagnostics().supportedFeatures).toMatchObject({
            ambientOcclusion: true, depthOfField: true, annotations: true, outlines: true, lut: true,
        })
        const pipeline = (controller as any).managed
        const disposed = [pipeline.aoPass, pipeline.dofPass, pipeline.gradePass, pipeline.lutPass,
            pipeline.outlinePass, pipeline.annotationPass].map((pass: { dispose: () => void }) => vi.spyOn(pass, 'dispose'))
        const allocation = controller.diagnostics().allocations
        controller.configure({ reducedEffects: false, ambientOcclusion: { intensity: 0.5 }, grading: { contrast: 1.1 },
            vignette: { strength: 0.2 }, depthOfField: { focus: 8 }, outlines: { strength: 4 },
            lut: { texture, intensity: 0.4 }, protectAnnotations: true })
        expect(controller.diagnostics().allocations).toBe(allocation)
        controller.configure({ quality: 'low', ambientOcclusion: true })
        disposed.forEach(spy => expect(spy).toHaveBeenCalledOnce())
        expect(controller.diagnostics().effective!.ambientOcclusion).toBe(false)
        expect(controller.diagnostics().fallbackReasons).toContain('Ambient occlusion is disabled at low quality')
        controller.destroy()
    })

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

        const instanceSource = new THREE.MeshStandardMaterial({ emissive: 0x00ff00 })
        const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(), instanceSource, 2)
        const instanceTexture = new THREE.DataTexture(new Float32Array([0, 0.5]), 2, 1, THREE.RedFormat, THREE.FloatType)
        const disposeTexture = vi.spyOn(instanceTexture, 'dispose')
        const wholeMaterial = (controller as any).emissionMaterial(instanceSource, 0, 1, instances) as THREE.MeshBasicMaterial
        const disposeWhole = vi.spyOn(wholeMaterial, 'dispose')
        expect(wholeMaterial.customProgramCacheKey()).toContain('whole')
        instances.userData.vxInstanceBloomMask = { texture: instanceTexture, size: 2, any: true }
        const instanceMaterial = (controller as any).emissionMaterial(instanceSource, 0, 1, instances) as THREE.MeshBasicMaterial
        expect(instanceMaterial).not.toBe(wholeMaterial)
        expect(disposeWhole).toHaveBeenCalledOnce()
        expect(instanceMaterial.customProgramCacheKey()).toContain('instances')
        expect((controller as any).emissionMaterial(instanceSource, 0.2, 0.5, instances)).toBe(instanceMaterial)
        const instanceShader = { uniforms: {}, vertexShader: 'void main() { gl_Position = vec4(0.0); }',
            fragmentShader: 'vec3 outgoingLight = reflectedLight.indirectDiffuse;' }
        instanceMaterial.onBeforeCompile(instanceShader as any, renderer)
        expect(instanceShader.vertexShader).toContain('gl_InstanceID')
        expect(instanceShader.fragmentShader).toContain('vxInstanceBloomGain')
        const disposeInstance = vi.spyOn(instanceMaterial, 'dispose')
        delete instances.userData.vxInstanceBloomMask
        const restored = (controller as any).emissionMaterial(instanceSource, 0, 1, instances) as THREE.MeshBasicMaterial
        expect(disposeInstance).toHaveBeenCalledOnce()
        expect(restored.customProgramCacheKey()).toContain('whole')
        const restoredShader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'vec3 outgoingLight = reflectedLight.indirectDiffuse;' }
        restored.onBeforeCompile(restoredShader as any, renderer)
        expect(restoredShader.vertexShader).not.toContain('gl_InstanceID')
        expect(restoredShader.fragmentShader).not.toContain('vxInstanceBloomGain')
        expect(disposeTexture).not.toHaveBeenCalled()
        instanceTexture.dispose()

        const textSource = new THREE.MeshBasicMaterial()
        Object.defineProperty(textSource, 'isTroikaTextMaterial', { value: true })
        const text = Object.assign(new THREE.Mesh(new THREE.PlaneGeometry(), textSource), {
            createDerivedMaterial: (base: THREE.Material): THREE.Material => {
                Object.defineProperty(base, 'isTroikaTextMaterial', { value: true })
                return base
            },
        })
        const textMask = (controller as any).emissionMaterial(textSource, 0.2, 0.7, text) as THREE.Material
        expect((textMask as any).isTroikaTextMaterial).toBe(true)
        expect(textMask.userData.vxBloomUniforms).toMatchObject({ threshold: { value: 0.2 }, gain: { value: 0.7 } })
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

describe('annotation protection', () => {
    it('copies prior color and redraws annotations against world depth without clearing it', () => {
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
        const surfaceMaterial = new THREE.MeshBasicMaterial()
        const surface = new THREE.Mesh(new THREE.BoxGeometry(), surfaceMaterial)
        const label = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
        label.userData.vxBloomRole = 'annotation'
        scene.background = new THREE.Color('#808080')
        const background = scene.background
        surface.add(label); scene.add(surface)
        const observations: Array<{ surfaceColor: boolean; labelVisible: boolean; autoClear: boolean }> = []
        const renderer = {
            autoClear: true,
            setRenderTarget: vi.fn(),
            clearDepth: vi.fn(),
            render: (object: THREE.Object3D) => {
                if (object === scene) {
                    expect(scene.background).toBeNull()
                    observations.push({ surfaceColor: surfaceMaterial.colorWrite,
                        labelVisible: label.visible, autoClear: renderer.autoClear })
                }
            },
        } as unknown as THREE.WebGLRenderer
        const pass = new AnnotationPass(scene, camera)
        const restore = pass.hideAnnotations()
        pass.render(renderer, new THREE.WebGLRenderTarget(2, 2), new THREE.WebGLRenderTarget(2, 2))
        expect(observations).toEqual([{ surfaceColor: false, labelVisible: true, autoClear: false }])
        expect(surfaceMaterial.colorWrite).toBe(true)
        expect(label.visible).toBe(false)
        expect(scene.background).toBe(background)
        restore()
        expect(label.visible).toBe(true)
        label.visible = false
        observations.length = 0
        const restoreHidden = pass.hideAnnotations()
        pass.render(renderer, new THREE.WebGLRenderTarget(2, 2), new THREE.WebGLRenderTarget(2, 2))
        restoreHidden()
        expect(label.visible).toBe(false)
        expect(observations).toHaveLength(0)
        expect(renderer.autoClear).toBe(true)
        pass.dispose()
    })
})

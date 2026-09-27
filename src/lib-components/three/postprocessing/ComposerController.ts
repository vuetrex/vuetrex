import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { resolveComposerOptions, type VxComposerOptions, type VxResolvedComposerOptions, type VxToneMapping } from '../../scene/composer.js'

export interface ComposerDiagnostics {
    readonly requested?: VxResolvedComposerOptions
    readonly effective?: VxResolvedComposerOptions
    readonly passKeys: readonly string[]
    readonly targetSize: Readonly<{ width: number; height: number; pixelRatio: number }>
    readonly estimatedOwnedBytes: number
    readonly supportedFeatures: Readonly<{ output: true; fxaa: true; luminanceBloom: true; selectedBloom: true }>
    readonly fallbackReasons: readonly string[]
    readonly allocations: number
    readonly updates: number
    readonly lastError?: string
}

const CompositeShader = {
    uniforms: { tDiffuse: { value: null }, tBloom: { value: null } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBloom; varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tDiffuse, vUv) + texture2D(tBloom, vUv); }`,
}

type ManagedPipeline = {
    composer: EffectComposer
    renderPass: RenderPass
    bloomComposer?: EffectComposer
    bloomRenderPass?: RenderPass
    bloomPass?: UnrealBloomPass
    compositePass?: ShaderPass
    outputPass: OutputPass
    fxaaPass?: ShaderPass
    topology: string
}

/** Owns the legacy and configured post-processing pipelines for exactly one Scene. */
export class ComposerController {
    private readonly legacyComposer: EffectComposer
    private readonly legacyRenderPass: RenderPass
    private managed?: ManagedPipeline
    private requested?: VxResolvedComposerOptions
    private effective?: VxResolvedComposerOptions
    private lastWorking?: VxResolvedComposerOptions
    private width: number
    private height: number
    private sourcePixelRatio: number
    private destroyed = false
    private allocations = 1
    private updates = 0
    private lastError?: string
    private fallbackReasons: string[] = []
    private lastStatusKey = ''
    private media?: MediaQueryList
    private readonly mediaChanged = () => this.reconcileEffective()
    private readonly contextRestored = () => {
        if (!this.requested || this.destroyed) return
        this.disposeManaged()
        this.reconcileEffective()
    }
    private readonly original: { toneMapping: THREE.ToneMapping; exposure: number; outputColorSpace: string; pixelRatio: number }
    private readonly masks = new Map<THREE.Object3D, Map<THREE.Material, THREE.Material>>()
    private readonly blackMaterials = new Map<THREE.Material, THREE.Material>()

    constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene,
        private readonly camera: THREE.Camera, width: number, height: number,
        private readonly onStatus?: (status: ComposerDiagnostics) => void) {
        this.width = width
        this.height = height
        this.sourcePixelRatio = renderer.getPixelRatio()
        this.original = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
            outputColorSpace: renderer.outputColorSpace, pixelRatio: renderer.getPixelRatio() }
        this.legacyComposer = new EffectComposer(renderer)
        this.legacyRenderPass = new RenderPass(scene, camera)
        this.legacyComposer.addPass(this.legacyRenderPass)
        renderer.domElement?.addEventListener?.('webglcontextrestored', this.contextRestored)
        if (typeof window !== 'undefined' && window.matchMedia) {
            this.media = window.matchMedia('(prefers-reduced-motion: reduce)')
            this.media.addEventListener?.('change', this.mediaChanged)
        }
    }

    configure(...layers: (Readonly<VxComposerOptions> | undefined)[]): void {
        if (this.destroyed) return
        const candidate = resolveComposerOptions(...layers)
        this.requested = candidate
        this.reconcileEffective()
    }

    private reconcileEffective(): void {
        const requested = this.requested
        const reduce = requested?.reducedEffects === true || (requested?.reducedEffects === 'system' && this.media?.matches)
        this.effective = requested && reduce && requested.bloom !== false
            ? Object.freeze({ ...requested, bloom: false })
            : requested
        try {
            if (!this.effective) {
                this.disposeManaged()
                this.restoreRenderer()
                this.resize(this.width, this.height, this.sourcePixelRatio)
                this.lastError = undefined
                this.fallbackReasons = []
                this.publishStatus()
                return
            }
            this.applyRenderer(this.effective)
            const topology = this.topology(this.effective)
            if (this.managed?.topology !== topology) {
                const candidate = this.createManaged(this.effective, topology)
                const prior = this.managed
                this.managed = candidate
                this.allocations += 1
                this.disposePipeline(prior)
            } else this.updateManaged(this.managed, this.effective)
            if (!this.effective.enabled || this.effective.bloom === false) this.clearBloomAdapters()
            this.resize(this.width, this.height, this.sourcePixelRatio)
            this.updates += 1
            this.lastWorking = this.effective
            this.lastError = undefined
            this.fallbackReasons = []
            this.publishStatus()
        } catch (cause) {
            this.lastError = cause instanceof Error ? cause.message : String(cause)
            this.fallbackReasons = [`Configured composer failed; retaining ${this.managed ? 'the last working plan' : 'basic rendering'}: ${this.lastError}`]
            this.effective = this.managed ? this.lastWorking : undefined
            if (this.effective) this.applyRenderer(this.effective)
            else this.restoreRenderer()
            this.publishStatus()
        }
    }

    private topology(options: VxResolvedComposerOptions): string {
        const bloom = options.enabled ? options.bloom : false
        const aa = options.antialias === 'fxaa' || options.antialias === 'auto'
        return `output|bloom:${bloom === false ? 'off' : bloom.mode}|aa:${aa ? 'fxaa' : 'off'}|quality:${options.quality}`
    }

    private createManaged(options: VxResolvedComposerOptions, topology: string): ManagedPipeline {
        const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
        const composer = new EffectComposer(this.renderer, target)
        const renderPass = new RenderPass(this.scene, this.camera)
        composer.addPass(renderPass)
        const pipeline: ManagedPipeline = { composer, renderPass, outputPass: new OutputPass(), topology }
        const bloom = options.enabled ? options.bloom : false
        if (bloom !== false) {
            const bloomTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
            pipeline.bloomComposer = new EffectComposer(this.renderer, bloomTarget)
            pipeline.bloomComposer.renderToScreen = false
            pipeline.bloomRenderPass = new RenderPass(this.scene, this.camera)
            pipeline.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold)
            pipeline.bloomComposer.addPass(pipeline.bloomRenderPass)
            pipeline.bloomComposer.addPass(pipeline.bloomPass)
            pipeline.compositePass = new ShaderPass(CompositeShader)
            pipeline.compositePass.uniforms.tBloom.value = pipeline.bloomPass.renderTargetsHorizontal[0].texture
            composer.addPass(pipeline.compositePass)
        }
        composer.addPass(pipeline.outputPass)
        if (options.antialias === 'fxaa' || options.antialias === 'auto') {
            pipeline.fxaaPass = new ShaderPass(FXAAShader)
            composer.addPass(pipeline.fxaaPass)
        }
        this.updateManaged(pipeline, options)
        return pipeline
    }

    private updateManaged(pipeline: ManagedPipeline, options: VxResolvedComposerOptions): void {
        if (pipeline.bloomPass && options.bloom !== false) {
            pipeline.bloomPass.strength = options.bloom.strength
            pipeline.bloomPass.radius = options.bloom.radius
            // Selected adapters apply threshold before their independent gain.
            pipeline.bloomPass.threshold = options.bloom.mode === 'selected' ? 0 : options.bloom.threshold
        }
    }

    render(): void {
        if (typeof window !== 'undefined' && Math.abs((window.devicePixelRatio || 1) - this.sourcePixelRatio) > 0.001) {
            this.resize(this.width, this.height, window.devicePixelRatio || 1)
        }
        if (!this.managed || !this.effective) { this.legacyComposer.render(); return }
        try {
            const bloom = this.effective.enabled ? this.effective.bloom : false
            if (bloom !== false && this.managed.bloomComposer) {
                const restore = this.prepareBloom(bloom.mode, bloom.threshold)
                try { this.managed.bloomComposer.render() } finally { restore() }
                if (this.managed.compositePass && this.managed.bloomPass) {
                    // Composite only the blurred contribution, never the sharp extraction source;
                    // the sharp core is already present in the beauty pass.
                    this.managed.compositePass.uniforms.tBloom.value = this.managed.bloomPass.renderTargetsHorizontal[0].texture
                }
            }
            this.managed.composer.render()
        } catch (cause) {
            this.lastError = cause instanceof Error ? cause.message : String(cause)
            this.fallbackReasons = [`Configured composer render failed; using basic rendering: ${this.lastError}`]
            this.disposeManaged()
            this.effective = undefined
            this.restoreRenderer()
            this.publishStatus()
            this.legacyComposer.render()
        }
    }

    resize(width: number, height: number, devicePixelRatio: number): void {
        this.width = Math.max(0, width)
        this.height = Math.max(0, height)
        this.sourcePixelRatio = Math.max(0.1, devicePixelRatio || 1)
        const ratio = this.effective ? Math.min(this.sourcePixelRatio, this.effective.maxPixelRatio) : this.sourcePixelRatio
        this.renderer.setPixelRatio(ratio)
        this.renderer.setSize(Math.max(1, width), Math.max(1, height))
        const composer = this.managed?.composer ?? this.legacyComposer
        composer.setPixelRatio(ratio)
        composer.setSize(Math.max(1, width), Math.max(1, height))
        this.managed?.bloomComposer?.setPixelRatio(ratio)
        this.managed?.bloomComposer?.setSize(Math.max(1, width), Math.max(1, height))
        if (this.managed?.fxaaPass) {
            this.managed.fxaaPass.uniforms.resolution.value.set(1 / Math.max(1, width * ratio), 1 / Math.max(1, height * ratio))
        }
    }

    private applyRenderer(options: VxResolvedComposerOptions): void {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.toneMapping = toneMapping(options.output.toneMapping)
        this.renderer.toneMappingExposure = options.output.exposure
    }

    private restoreRenderer(): void {
        this.renderer.toneMapping = this.original.toneMapping
        this.renderer.toneMappingExposure = this.original.exposure
        this.renderer.outputColorSpace = this.original.outputColorSpace
    }

    private prepareBloom(mode: 'selected' | 'luminance', threshold: number): () => void {
        const priorBackground = this.scene.background
        this.scene.background = new THREE.Color(0)
        const changed: Array<{ object: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
        const seenMasks = new Set<THREE.Object3D>()
        const seenBlack = new Set<THREE.Material>()
        this.scene.traverse(object => {
            const mesh = object as THREE.Mesh
            if (!mesh.material || !object.visible) return
            const effect = contributionEffect(object)
            const excluded = effect.bloom === 'exclude'
            if (mode === 'luminance' && !excluded) return
            const include = mode === 'selected' && effect.bloom === 'include'
            changed.push({ object: mesh, material: mesh.material })
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const replacements = materials.map(material => include
                ? (seenMasks.add(object), this.emissionMaterial(material, threshold, effect.bloomGain, object))
                : (seenBlack.add(material), this.blackMaterial(object, material)))
            mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0]
        })
        for (const [object, materials] of this.masks) if (!seenMasks.has(object)) {
            for (const material of materials.values()) material.dispose()
            this.masks.delete(object)
        }
        for (const [source, material] of this.blackMaterials) if (!seenBlack.has(source)) {
            material.dispose()
            this.blackMaterials.delete(source)
        }
        return () => {
            for (const entry of changed) entry.object.material = entry.material
            this.scene.background = priorBackground
        }
    }

    private emissionMaterial(source: THREE.Material, threshold: number, gain: number, object: THREE.Object3D): THREE.Material {
        let objectMasks = this.masks.get(object)
        if (!objectMasks) { objectMasks = new Map(); this.masks.set(object, objectMasks) }
        let result = objectMasks.get(source)
        const anySource = source as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; emissiveMap?: THREE.Texture | null; map?: THREE.Texture | null; alphaMap?: THREE.Texture | null; opacity?: number; alphaTest?: number; side?: THREE.Side }
        const screen = object.userData.vxScreenStyle as { brightness?: number; bloomMask?: THREE.Texture | null } | undefined
        const troikaText = source as THREE.Material & { isTroikaTextMaterial?: boolean }
        if (troikaText.isTroikaTextMaterial && typeof (object as any).createDerivedMaterial === 'function') {
            if (!result) {
                const base = new THREE.MeshBasicMaterial()
                const uniforms = { threshold: { value: threshold }, gain: { value: gain } }
                base.onBeforeCompile = shader => {
                    shader.uniforms.vxBloomThreshold = uniforms.threshold
                    shader.uniforms.vxBloomGain = uniforms.gain
                    shader.fragmentShader = `uniform float vxBloomThreshold; uniform float vxBloomGain;\n${shader.fragmentShader}`
                        .replace(/(vec3 outgoingLight = [^;]+;)/,
                            '$1 float vxLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); outgoingLight = vxLuminance >= vxBloomThreshold ? outgoingLight * vxBloomGain : vec3(0.0);')
                }
                base.customProgramCacheKey = () => 'vuetrex-selected-bloom-troika-v1'
                result = (object as any).createDerivedMaterial(base) as THREE.Material
                if (result !== base) result.addEventListener('dispose', () => base.dispose())
                result.userData.vxBloomUniforms = uniforms
                objectMasks.set(source, result)
            }
            const uniforms = result.userData.vxBloomUniforms as { threshold: { value: number }; gain: { value: number } }
            uniforms.threshold.value = threshold
            uniforms.gain.value = gain
            result.depthWrite = source.depthWrite
            result.depthTest = source.depthTest
            result.side = source.side
            return result
        }
        if (source instanceof THREE.ShaderMaterial && !((object as THREE.Points).isPoints && object.userData.vxParticleAdapter === 'cpu')) {
            const reason = `Selected bloom skipped unsupported custom ShaderMaterial${source.name ? ` ${source.name}` : ''}`
            if (!this.fallbackReasons.includes(reason)) {
                this.fallbackReasons.push(reason)
                this.publishStatus()
            }
        }
        if ((object as THREE.Points).isPoints && object.userData.vxParticleAdapter === 'cpu' && source instanceof THREE.ShaderMaterial) {
            if (!result) {
                const particleMask = source.clone()
                particleMask.uniforms = THREE.UniformsUtils.clone(source.uniforms)
                particleMask.uniforms.vxBloomGain = { value: gain }
                particleMask.uniforms.vxBloomThreshold = { value: threshold }
                particleMask.fragmentShader = `uniform float vxBloomGain; uniform float vxBloomThreshold;\n${source.fragmentShader}`
                    .replace('gl_FragColor = vec4(vColor, vOpacity * coverage);',
                        'float vxLuminance = dot(vColor, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(vxLuminance >= vxBloomThreshold ? vColor * vxBloomGain : vec3(0.0), vOpacity * coverage);')
                    .replace('#include <tonemapping_fragment>', '')
                    .replace('#include <colorspace_fragment>', '')
                    .replace('#include <fog_fragment>', '')
                objectMasks.set(source, particleMask)
                result = particleMask
            }
            ;(result as THREE.ShaderMaterial).uniforms.vxBloomGain.value = gain
            ;(result as THREE.ShaderMaterial).uniforms.vxBloomThreshold.value = threshold
            result.depthWrite = source.depthWrite
            result.depthTest = source.depthTest
            return result
        }
        if (!result) {
            if ((object as THREE.Points).isPoints) result = new THREE.PointsMaterial({ size: (source as THREE.PointsMaterial).size ?? 1 })
            else if ((object as THREE.Line).isLine) result = new THREE.LineBasicMaterial()
            else result = new THREE.MeshBasicMaterial()
            const uniforms = { threshold: { value: threshold }, gain: { value: gain } }
            result.userData.vxBloomUniforms = uniforms
            result.onBeforeCompile = shader => {
                shader.uniforms.vxBloomThreshold = uniforms.threshold
                shader.uniforms.vxBloomGain = uniforms.gain
                shader.fragmentShader = `uniform float vxBloomThreshold; uniform float vxBloomGain;\n${shader.fragmentShader}`
                    .replace(/(vec3 outgoingLight = [^;]+;)/,
                        '$1 float vxLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); outgoingLight = vxLuminance >= vxBloomThreshold ? outgoingLight * vxBloomGain : vec3(0.0);')
            }
            result.customProgramCacheKey = () => 'vuetrex-selected-bloom-v1'
            objectMasks.set(source, result)
        }
        const target = result as THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.PointsMaterial
        const uniforms = target.userData.vxBloomUniforms as { threshold: { value: number }; gain: { value: number } }
        uniforms.threshold.value = threshold
        uniforms.gain.value = gain
        const color = anySource.emissive ?? anySource.color ?? new THREE.Color(0)
        target.color.copy(color).multiplyScalar(anySource.emissive ? anySource.emissiveIntensity ?? 1 : 1)
        if ('map' in target) {
            const hadMap = Boolean(target.map)
            target.map = screen ? anySource.map ?? null : anySource.emissiveMap ?? null
            if (target instanceof THREE.MeshBasicMaterial || target instanceof THREE.PointsMaterial) {
                const hadAlphaMap = Boolean(target.alphaMap)
                target.alphaMap = screen?.bloomMask ?? anySource.alphaMap ?? null
                if (hadAlphaMap !== Boolean(target.alphaMap)) target.needsUpdate = true
            }
            if (hadMap !== Boolean(target.map)) target.needsUpdate = true
        }
        target.transparent = anySource.transparent
        target.opacity = anySource.opacity ?? 1
        target.alphaTest = screen?.bloomMask ? Math.max(0.001, anySource.alphaTest ?? 0) : anySource.alphaTest ?? 0
        target.side = anySource.side ?? THREE.FrontSide
        target.depthWrite = source.depthWrite
        target.depthTest = source.depthTest
        return target
    }

    private blackMaterial(object: THREE.Object3D, source: THREE.Material): THREE.Material {
        const kind = (object as THREE.Points).isPoints ? 'points' : (object as THREE.Line).isLine ? 'line' : 'mesh'
        let material = this.blackMaterials.get(source)
        if (!material) {
            material = kind === 'points' ? new THREE.PointsMaterial({ color: 0, size: 1 })
                : kind === 'line' ? new THREE.LineBasicMaterial({ color: 0 }) : new THREE.MeshBasicMaterial({ color: 0 })
            this.blackMaterials.set(source, material)
        }
        const sourceCoverage = source as THREE.Material & {
            map?: THREE.Texture | null
            alphaMap?: THREE.Texture | null
            alphaTest?: number
            opacity?: number
            alphaHash?: boolean
        }
        const target = material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial | THREE.PointsMaterial
        if ('map' in target) {
            const hadMap = Boolean(target.map)
            target.map = sourceCoverage.map ?? null
            if (hadMap !== Boolean(target.map)) target.needsUpdate = true
        }
        if (target instanceof THREE.MeshBasicMaterial || target instanceof THREE.PointsMaterial) {
            const hadAlphaMap = Boolean(target.alphaMap)
            target.alphaMap = sourceCoverage.alphaMap ?? null
            if (hadAlphaMap !== Boolean(target.alphaMap)) target.needsUpdate = true
        }
        material.alphaTest = sourceCoverage.alphaTest ?? 0
        material.alphaHash = sourceCoverage.alphaHash ?? false
        material.transparent = source.transparent
        material.opacity = source.transparent ? 0 : sourceCoverage.opacity ?? 1
        material.side = source.side
        material.depthTest = source.depthTest
        material.depthWrite = source.transparent ? false : source.depthWrite
        return material
    }

    diagnostics(): ComposerDiagnostics {
        const ratio = this.renderer.getPixelRatio()
        const passKeys = this.managed ? this.managed.topology.split('|') : ['legacy-render']
        const pixels = Math.round(this.width * ratio) * Math.round(this.height * ratio)
        // RGBA half-float color plus depth for composer targets; bloom includes its
        // composer pair, bright target, and horizontal/vertical mip chain.
        const mainBytesPerPixel = 24
        const bloomBytesPerPixel = this.managed?.bloomComposer ? 32 : 0
        return Object.freeze({ requested: this.requested, effective: this.effective,
            passKeys: Object.freeze(passKeys), targetSize: Object.freeze({ width: this.width, height: this.height, pixelRatio: ratio }),
            estimatedOwnedBytes: pixels * (mainBytesPerPixel + bloomBytesPerPixel),
            supportedFeatures: Object.freeze({ output: true, fxaa: true, luminanceBloom: true, selectedBloom: true }),
            fallbackReasons: Object.freeze([...this.fallbackReasons]), allocations: this.allocations, updates: this.updates,
            lastError: this.lastError })
    }

    private publishStatus(): void {
        if (!this.onStatus) return
        const status = this.diagnostics()
        const key = JSON.stringify({ requested: status.requested, effective: status.effective,
            passKeys: status.passKeys, fallbackReasons: status.fallbackReasons, lastError: status.lastError })
        if (key === this.lastStatusKey) return
        this.lastStatusKey = key
        this.onStatus(status)
    }

    destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.media?.removeEventListener?.('change', this.mediaChanged)
        this.renderer.domElement?.removeEventListener?.('webglcontextrestored', this.contextRestored)
        this.disposeManaged()
        this.legacyRenderPass.dispose()
        this.legacyComposer.dispose()
        this.clearBloomAdapters()
        this.restoreRenderer()
    }

    private clearBloomAdapters(): void {
        for (const materials of this.masks.values()) for (const material of materials.values()) material.dispose()
        for (const material of this.blackMaterials.values()) material.dispose()
        this.masks.clear(); this.blackMaterials.clear()
    }

    private disposeManaged(): void { this.disposePipeline(this.managed); this.managed = undefined; this.clearBloomAdapters() }
    private disposePipeline(pipeline?: ManagedPipeline): void {
        if (!pipeline) return
        pipeline.renderPass.dispose(); pipeline.bloomRenderPass?.dispose(); pipeline.bloomPass?.dispose()
        pipeline.compositePass?.dispose(); pipeline.outputPass.dispose(); pipeline.fxaaPass?.dispose()
        pipeline.bloomComposer?.dispose(); pipeline.composer.dispose()
    }
}

function contributionEffect(object: THREE.Object3D): { bloom: 'auto' | 'include' | 'exclude'; bloomGain: number } {
    const direct = object.userData.vxBloomEffects as { bloom?: 'auto' | 'include' | 'exclude'; bloomGain?: number } | undefined
    if (direct) return { bloom: direct.bloom ?? 'auto', bloomGain: direct.bloomGain ?? 1 }
    let current: THREE.Object3D | null = object
    while (current) {
        const node = current.userData.el?.node as { resolvedNodeEffects?: () => { bloom: 'auto' | 'include' | 'exclude'; bloomGain: number } } | undefined
        if (node?.resolvedNodeEffects) {
            const resolved = node.resolvedNodeEffects()
            // Labels/helpers are non-emitting by default. An explicit inherited
            // include still opts the contribution in, which keeps selected bloom
            // usable for authored luminous text.
            if (object.userData.vxBloomRole === 'annotation' && resolved.bloom === 'auto') {
                return { bloom: 'exclude', bloomGain: resolved.bloomGain }
            }
            return resolved
        }
        current = current.parent
    }
    if (object.userData.vxBloomRole === 'annotation') return { bloom: 'exclude', bloomGain: 1 }
    return { bloom: 'auto', bloomGain: 1 }
}

function toneMapping(value: VxToneMapping): THREE.ToneMapping {
    if (value === 'none') return THREE.NoToneMapping
    if (value === 'neutral') return THREE.NeutralToneMapping
    if (value === 'agx') return THREE.AgXToneMapping
    return THREE.ACESFilmicToneMapping
}

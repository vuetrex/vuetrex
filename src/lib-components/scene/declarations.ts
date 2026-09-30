import { watchSceneEffect } from '../diagnostics/sceneErrors.js'
import { lightingDefaults } from '../three/lighting/LiveLighting.js'
import { shallowReactive, toRaw, watchEffect, type WatchStopHandle } from 'vue'
import { Texture } from 'three'
import { StageDeclaration } from '../nodes/StageDeclaration.js'
import type { VuetrexStage } from '../three/stage.js'
import { createStudioEnvironment } from './studio.js'
import type { VxComposerOptions } from './composer.js'
import type { VxCameraMotion } from '../three/cameraController.js'

export interface VxEnvironmentProps { preset?: 'studio'; texture?: Texture; enabled?: boolean; intensity?: number; rotation?: number }
export interface VxCameraProps {
    direction?: readonly [number, number, number]
    fit?: 'content'
    padding?: number
    duration?: number
    motion?: VxCameraMotion
}
export interface VxFloorProps {
    finish?: 'matte' | 'mirror'
    color?: number
    reflection?: number
    grid?: boolean
    captions?: boolean
    /** World-space X/Z extent where the floor starts blending into the background. */
    fadeStart?: number
    /** World-space X/Z extent where the floor has fully blended into the background. */
    fadeEnd?: number
}

const owners = new WeakMap<VuetrexStage, Map<string, SceneDeclaration>>()

/** Scene-wide declarations are exclusive, so ordering cannot silently change ownership. */
abstract class SceneDeclaration extends StageDeclaration {
    private stop?: WatchStopHandle
    private removed = false
    private restore?: () => void
    constructor(stage: VuetrexStage, private readonly kind: string, private readonly defaults: Record<string, unknown>) {
        super(stage)
        this.state = shallowReactive({ ...defaults })
    }
    protected override setDeclarationProp(key: string, value: unknown): void {
        if (!Object.hasOwn(this.defaults, key)) throw new Error(`Unknown ${this.kind} property: ${key}`)
        const fallback = this.defaults[key]
        if (value == null) value = fallback
        if (typeof fallback === 'boolean') value = this.booleanProp(key, value)
        if (typeof fallback === 'number') value = this.numberProp(key, value)
        this.state[key] = value
    }
    syncWithThree(): void {
        if (this.stop || this.removed || !this.parent.value) return
        let map = owners.get(this.stage)
        if (!map) { map = new Map(); owners.set(this.stage, map) }
        if (map.has(this.kind)) throw new Error(`Only one ${this.kind} declaration is allowed per Vuetrex scene`)
        map.set(this.kind, this)
        this.restore = this.capture()
        this.stop = watchSceneEffect(this, () => this.apply(), { flush: 'post' })
    }
    protected abstract capture(): () => void
    protected abstract apply(): void
    protected dispose(): void {}
    onRemoved(): void {
        if (this.removed) return
        this.removed = true
        this.stop?.()
        this.restore?.()
        this.dispose()
        const map = owners.get(this.stage)
        if (map?.get(this.kind) === this) map.delete(this.kind)
    }
}

export class EnvironmentDeclaration extends SceneDeclaration {
    private studio?: Texture
    constructor(stage: VuetrexStage) {
        super(stage, 'vx-environment', { preset: 'studio', texture: undefined, enabled: true, intensity: 0.55, rotation: 0 })
    }
    protected capture(): () => void {
        const scene = this.stage.getScene(), prior = scene.environment
        const intensity = scene.environmentIntensity, rotation = scene.environmentRotation.clone()
        return () => { scene.environment = prior; scene.environmentIntensity = intensity; scene.environmentRotation.copy(rotation) }
    }
    protected apply(): void {
        if (this.state.preset !== 'studio') throw new Error('vx-environment supports the studio preset or a supplied texture')
        const borrowed = toRaw(this.state.texture)
        if (borrowed !== undefined && !(borrowed instanceof Texture)) throw new TypeError('vx-environment.texture must be a Three.js Texture')
        if (this.state.intensity < 0) throw new RangeError('Environment intensity cannot be negative')
        const scene = this.stage.getScene()
        if (this.state.enabled && !borrowed) this.studio ??= createStudioEnvironment()
        scene.environment = this.state.enabled ? borrowed ?? this.studio! : null
        if (borrowed && this.studio) { this.studio.dispose(); this.studio = undefined }
        scene.environmentIntensity = this.state.intensity
        scene.environmentRotation.set(0, this.state.rotation, 0)
    }
    protected dispose(): void { this.studio?.dispose(); this.studio = undefined }
}

export class CameraDeclaration extends SceneDeclaration {
    constructor(stage: VuetrexStage) {
        super(stage, 'vx-camera', { direction: [0, 0.65, 1], fit: 'content', padding: 0.75, duration: 0.6, motion: undefined })
    }
    protected capture(): () => void {
        const prior = this.stage.captureCameraView()
        return () => this.stage.restoreCameraView(prior)
    }
    protected apply(): void {
        const direction = this.state.direction as number[]
        if (this.state.fit !== 'content') throw new Error('vx-camera.fit must be content')
        if (!Array.isArray(direction) || direction.length !== 3 || !Array.from(direction).every(Number.isFinite)
            || !direction.some(n => n !== 0) || direction[1] < 0) throw new TypeError('Camera direction requires three finite numbers, nonzero length, and nonnegative Y')
        if (this.state.padding < 0 || this.state.duration < 0) throw new RangeError('Camera padding and duration cannot be negative')
        this.stage.setCameraView({ direction: [...direction] as [number, number, number], padding: this.state.padding,
            duration: this.state.duration, motion: this.state.motion as VxCameraMotion | undefined })
    }
}

export class FloorDeclaration extends SceneDeclaration {
    constructor(stage: VuetrexStage) {
        super(stage, 'vx-floor', { finish: 'matte', color: 0x3f3f3f, reflection: 0.6, grid: false, captions: false,
            fadeStart: undefined, fadeEnd: undefined })
    }
    protected override setDeclarationProp(key: string, value: unknown): void {
        if ((key === 'fadeStart' || key === 'fadeEnd') && value != null) {
            value = this.numberProp(key, value)
        }
        super.setDeclarationProp(key, value)
    }
    protected capture(): () => void {
        const prior = this.stage.captureFloorStyle()
        return () => this.stage.applyFloorStyle(prior)
    }
    protected apply(): void {
        if (!['matte', 'mirror'].includes(this.state.finish)) throw new Error('vx-floor.finish must be matte or mirror')
        if (this.state.reflection < 0 || this.state.reflection > 1) throw new RangeError('Floor reflection must be between 0 and 1')
        const fadeStart = this.state.fadeStart as number | undefined
        const fadeEnd = this.state.fadeEnd as number | undefined
        if ((fadeStart === undefined) !== (fadeEnd === undefined)) throw new Error('vx-floor fadeStart and fadeEnd must be set together')
        if (fadeStart !== undefined && (fadeStart < 0 || fadeEnd! <= fadeStart)) {
            throw new RangeError('Floor fade requires 0 <= fadeStart < fadeEnd')
        }
        this.stage.applyFloorStyle({ ...this.state })
    }
}

export class LightingDeclaration extends SceneDeclaration {
    constructor(stage: VuetrexStage) {
        super(stage, 'vx-lighting', { ...lightingDefaults })
    }
    protected capture(): () => void {
        const prior = this.stage.captureLightingStyle()
        return () => this.stage.applyLightingStyle(prior)
    }
    protected apply(): void {
        this.stage.applyLightingStyle({ ...this.state })
    }
}

export class ComposerDeclaration extends SceneDeclaration {
    constructor(stage: VuetrexStage) {
        super(stage, 'vx-composer', { preset: undefined, enabled: undefined, quality: undefined,
            maxPixelRatio: undefined, reducedEffects: undefined, output: undefined, bloom: undefined,
            ambientOcclusion: undefined, grading: undefined, vignette: undefined, depthOfField: undefined,
            outlines: undefined, lut: undefined, protectAnnotations: undefined, antialias: undefined })
    }
    protected override setDeclarationProp(key: string, value: unknown): void {
        if (key === 'enabled' && value != null) value = this.booleanProp(key, value)
        super.setDeclarationProp(key, value)
    }
    protected capture(): () => void { return () => this.stage.setComposerDeclaration(undefined) }
    protected apply(): void {
        // Snapshot through the proxy first so Vue tracks both top-level bindings and
        // parameter-only changes inside the authored output/bloom objects.
        const state = { ...this.state }
        for (const key of ['output', 'bloom', 'ambientOcclusion', 'grading', 'vignette', 'depthOfField', 'outlines', 'lut']) {
            const value = state[key]
            if (value && typeof value === 'object') state[key] = { ...value }
        }
        if (state.lut && typeof state.lut === 'object' && 'texture' in state.lut) {
            state.lut = { ...state.lut, texture: toRaw(state.lut.texture) }
        }
        this.stage.setComposerDeclaration({ ...state } as VxComposerOptions)
    }
}

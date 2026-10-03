import type { Camera, Scene, WebGLRenderer } from 'three'
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js'

export type VxComposerPreset = 'technical' | 'studio' | 'luminous' | 'editorial'
export type VxComposerQuality = 'low' | 'balanced' | 'high'
export type VxAntialias = 'auto' | 'off' | 'fxaa'
export type VxBloomMode = 'luminance' | 'selected'
export type VxEffectOption<T> = false | true | Readonly<Partial<T>>

export interface VxBloomOptions {
    mode: VxBloomMode
    strength: number
    radius: number
    threshold: number
}

export interface VxAmbientOcclusionOptions { intensity: number; radius: number }
export interface VxGradingOptions { contrast: number; saturation: number }
export interface VxVignetteOptions { strength: number; offset: number }
/** A factory creates a fresh composer-owned pass for each pipeline realization. */
export interface VxComposerPass {
    readonly key: string
    readonly phase: 'linear' | 'display'
    readonly create: (context: Readonly<{ renderer: WebGLRenderer; scene: Scene; camera: Camera }>) => Pass
}

export interface VxComposerOptions {
    /** Ordered custom passes; each factory must return a fresh owned instance. */
    passes?: readonly VxComposerPass[]
    preset?: VxComposerPreset
    enabled?: boolean
    quality?: VxComposerQuality
    maxPixelRatio?: number
    reducedEffects?: boolean | 'system'
    output?: Readonly<{ exposure?: number }>
    bloom?: VxEffectOption<VxBloomOptions>
    ambientOcclusion?: VxEffectOption<VxAmbientOcclusionOptions>
    grading?: VxEffectOption<VxGradingOptions>
    vignette?: VxEffectOption<VxVignetteOptions>
    /** Re-render owned world annotations after image effects with depth-correct occlusion. */
    protectAnnotations?: boolean
    antialias?: VxAntialias
}

export interface VxNodeEffects {
    bloom?: 'auto' | 'include' | 'exclude'
    bloomGain?: number
}

export interface VxResolvedComposerOptions {
    readonly passes: readonly VxComposerPass[]
    readonly preset: VxComposerPreset
    readonly enabled: boolean
    readonly quality: VxComposerQuality
    readonly maxPixelRatio: number
    readonly reducedEffects: boolean | 'system'
    readonly output: Readonly<{ exposure: number }>
    readonly bloom: false | Readonly<VxBloomOptions>
    readonly ambientOcclusion: false | Readonly<VxAmbientOcclusionOptions>
    readonly grading: false | Readonly<VxGradingOptions>
    readonly vignette: false | Readonly<VxVignetteOptions>
    readonly protectAnnotations: boolean
    readonly antialias: VxAntialias
}

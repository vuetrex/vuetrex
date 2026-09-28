import type { Data3DTexture } from 'three'

export type VxComposerPreset = 'technical' | 'studio' | 'luminous' | 'editorial'
export type VxComposerQuality = 'low' | 'balanced' | 'high'
export type VxToneMapping = 'none' | 'neutral' | 'aces' | 'agx'
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
export interface VxDepthOfFieldOptions {
    /** Camera-space distance, semantic node ID/name, or world-space anchor. */
    focus: number | string | readonly [number, number, number]
    aperture: number
    maxBlur: number
}
export interface VxOutlineOptions {
    color: number | string
    hiddenColor: number | string
    strength: number
    thickness: number
    glow: number
}
export interface VxLutOptions { texture: Data3DTexture; intensity: number }

export interface VxComposerOptions {
    preset?: VxComposerPreset
    enabled?: boolean
    quality?: VxComposerQuality
    maxPixelRatio?: number
    reducedEffects?: boolean | 'system'
    output?: Readonly<{ toneMapping?: VxToneMapping; exposure?: number }>
    bloom?: VxEffectOption<VxBloomOptions>
    ambientOcclusion?: VxEffectOption<VxAmbientOcclusionOptions>
    grading?: VxEffectOption<VxGradingOptions>
    vignette?: VxEffectOption<VxVignetteOptions>
    depthOfField?: VxEffectOption<VxDepthOfFieldOptions>
    outlines?: VxEffectOption<VxOutlineOptions>
    lut?: false | Readonly<Partial<VxLutOptions> & Pick<VxLutOptions, 'texture'>>
    /** Re-render owned world annotations after image effects with depth-correct occlusion. */
    protectAnnotations?: boolean
    antialias?: VxAntialias
}

export interface VxNodeEffects {
    bloom?: 'auto' | 'include' | 'exclude'
    bloomGain?: number
    outline?: 'auto' | 'include' | 'exclude'
}

export interface VxResolvedComposerOptions {
    readonly preset: VxComposerPreset
    readonly enabled: boolean
    readonly quality: VxComposerQuality
    readonly maxPixelRatio: number
    readonly reducedEffects: boolean | 'system'
    readonly output: Readonly<{ toneMapping: VxToneMapping; exposure: number }>
    readonly bloom: false | Readonly<VxBloomOptions>
    readonly ambientOcclusion: false | Readonly<VxAmbientOcclusionOptions>
    readonly grading: false | Readonly<VxGradingOptions>
    readonly vignette: false | Readonly<VxVignetteOptions>
    readonly depthOfField: false | Readonly<VxDepthOfFieldOptions>
    readonly outlines: false | Readonly<VxOutlineOptions>
    readonly lut: false | Readonly<VxLutOptions>
    readonly protectAnnotations: boolean
    readonly antialias: VxAntialias
}

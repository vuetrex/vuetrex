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

export interface VxComposerOptions {
    preset?: VxComposerPreset
    enabled?: boolean
    quality?: VxComposerQuality
    maxPixelRatio?: number
    reducedEffects?: boolean | 'system'
    output?: Readonly<{ toneMapping?: VxToneMapping; exposure?: number }>
    bloom?: VxEffectOption<VxBloomOptions>
    antialias?: VxAntialias
}

export interface VxNodeEffects {
    bloom?: 'auto' | 'include' | 'exclude'
    bloomGain?: number
}

export interface VxResolvedComposerOptions {
    readonly preset: VxComposerPreset
    readonly enabled: boolean
    readonly quality: VxComposerQuality
    readonly maxPixelRatio: number
    readonly reducedEffects: boolean | 'system'
    readonly output: Readonly<{ toneMapping: VxToneMapping; exposure: number }>
    readonly bloom: false | Readonly<VxBloomOptions>
    readonly antialias: VxAntialias
}

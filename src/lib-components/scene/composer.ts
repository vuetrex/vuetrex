import type { VxBloomOptions, VxComposerOptions, VxComposerPreset, VxNodeEffects, VxResolvedComposerOptions, VxToneMapping } from './composer-api.js'
import { Data3DTexture, NoColorSpace } from 'three'
export type * from './composer-api.js'

type ComposerLayer = Readonly<VxComposerOptions> | undefined

const PRESETS: Readonly<Record<VxComposerPreset, VxResolvedComposerOptions>> = Object.freeze({
    technical: profile('technical', 'neutral', false),
    studio: profile('studio', 'neutral', false, { intensity: 0.15, radius: 0.25 }),
    luminous: profile('luminous', 'aces', { mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 }),
    editorial: profile('editorial', 'neutral', false, false, { contrast: 1.05, saturation: 0.95 }, { strength: 0.08, offset: 0.8 }),
})

function profile(preset: VxComposerPreset, toneMapping: VxToneMapping, bloom: false | VxBloomOptions,
    ambientOcclusion: VxResolvedComposerOptions['ambientOcclusion'] = false,
    grading: VxResolvedComposerOptions['grading'] = false,
    vignette: VxResolvedComposerOptions['vignette'] = false): VxResolvedComposerOptions {
    return Object.freeze({ preset, enabled: true, quality: 'balanced', maxPixelRatio: 1.5,
        reducedEffects: 'system', output: Object.freeze({ toneMapping, exposure: 1 }),
        bloom: bloom === false ? false : Object.freeze({ ...bloom }),
        ambientOcclusion: ambientOcclusion === false ? false : Object.freeze({ ...ambientOcclusion }),
        grading: grading === false ? false : Object.freeze({ ...grading }),
        vignette: vignette === false ? false : Object.freeze({ ...vignette }),
        depthOfField: false, outlines: false, lut: false, protectAnnotations: false, antialias: 'auto' })
}

const effectKeys = ['bloom', 'ambientOcclusion', 'grading', 'vignette', 'depthOfField', 'outlines'] as const
const allowed = new Set(['preset', 'enabled', 'quality', 'maxPixelRatio', 'reducedEffects', 'output', ...effectKeys, 'lut', 'protectAnnotations', 'antialias'])
const allowedOutput = new Set(['toneMapping', 'exposure'])
const allowedNested: Record<(typeof effectKeys)[number], ReadonlySet<string>> = {
    bloom: new Set(['mode', 'strength', 'radius', 'threshold']),
    ambientOcclusion: new Set(['intensity', 'radius']),
    grading: new Set(['contrast', 'saturation']),
    vignette: new Set(['strength', 'offset']),
    depthOfField: new Set(['focus', 'aperture', 'maxBlur']),
    outlines: new Set(['color', 'hiddenColor', 'strength', 'thickness', 'glow']),
}

/** Merge authored composer layers. Undefined fields do not contribute; effect false clears prior fields. */
export function mergeComposerOptions(...layers: ComposerLayer[]): VxComposerOptions | undefined {
    let seen = false
    const result: Record<string, unknown> = {}
    for (const layer of layers) {
        if (layer === undefined) continue
        assertObject('composer', layer)
        seen = true
        for (const key of Object.keys(layer)) if (!allowed.has(key)) unsupported(`composer.${key}`)
        for (const [key, value] of Object.entries(layer)) {
            if (value === undefined) continue
            if (key === 'output') {
                assertObject('composer.output', value)
                for (const nested of Object.keys(value)) if (!allowedOutput.has(nested)) unsupported(`composer.output.${nested}`)
                result.output = mergeDefined(result.output as object | undefined, value)
            } else if ((effectKeys as readonly string[]).includes(key)) {
                if (value !== true && value !== false) {
                    assertObject(`composer.${key}`, value)
                    for (const nested of Object.keys(value)) if (!allowedNested[key as keyof typeof allowedNested].has(nested)) unsupported(`composer.${key}.${nested}`)
                    result[key] = mergeDefined(typeof result[key] === 'object' ? result[key] as object : undefined, value)
                } else result[key] = value
            } else if (key === 'lut') {
                if (value !== false) {
                    assertObject('composer.lut', value)
                    for (const nested of Object.keys(value)) if (!['texture', 'intensity'].includes(nested)) unsupported(`composer.lut.${nested}`)
                    result.lut = mergeDefined(typeof result.lut === 'object' ? result.lut as object : undefined, value)
                } else result.lut = false
            } else result[key] = value
        }
    }
    return seen ? result as VxComposerOptions : undefined
}

/** Pure validation and preset expansion. The returned value and nested objects are immutable. */
export function resolveComposerOptions(...layers: ComposerLayer[]): VxResolvedComposerOptions | undefined {
    const merged = mergeComposerOptions(...layers)
    if (!merged) return undefined
    const preset = merged.preset ?? 'technical'
    enumValue('composer.preset', preset, ['technical', 'studio', 'luminous', 'editorial'])
    const base = PRESETS[preset]
    const enabled = booleanValue('composer.enabled', merged.enabled, base.enabled)
    const quality = merged.quality ?? base.quality
    enumValue('composer.quality', quality, ['low', 'balanced', 'high'])
    const qualityCap = quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5
    const maxPixelRatio = bounded('composer.maxPixelRatio', merged.maxPixelRatio, base.maxPixelRatio, 0.5, 3)
    const reducedEffects = merged.reducedEffects ?? base.reducedEffects
    if (reducedEffects !== 'system' && typeof reducedEffects !== 'boolean') fail('composer.reducedEffects', 'must be true, false, or system')
    const output = merged.output ?? {}
    const toneMapping = output.toneMapping ?? base.output.toneMapping
    enumValue('composer.output.toneMapping', toneMapping, ['none', 'neutral', 'aces', 'agx'])
    const exposure = positive('composer.output.exposure', output.exposure, base.output.exposure)
    const antialias = merged.antialias ?? base.antialias
    enumValue('composer.antialias', antialias, ['auto', 'off', 'fxaa'])
    const bloom = resolveBloom(merged.bloom, base.bloom)
    const ambientOcclusion = resolveSimpleEffect('ambientOcclusion', merged.ambientOcclusion, base.ambientOcclusion,
        { intensity: 0.2, radius: 0.25 }, fields => ({ intensity: bounded('composer.ambientOcclusion.intensity', fields.intensity, 0.2, 0, 1), radius: positive('composer.ambientOcclusion.radius', fields.radius, 0.25) }))
    const grading = resolveSimpleEffect('grading', merged.grading, base.grading,
        { contrast: 1, saturation: 1 }, fields => ({ contrast: bounded('composer.grading.contrast', fields.contrast, 1, 0, 2), saturation: bounded('composer.grading.saturation', fields.saturation, 1, 0, 2) }))
    const vignette = resolveSimpleEffect('vignette', merged.vignette, base.vignette,
        { strength: 0.1, offset: 0.8 }, fields => ({ strength: bounded('composer.vignette.strength', fields.strength, 0.1, 0, 0.3), offset: bounded('composer.vignette.offset', fields.offset, 0.8, 0, 1) }))
    const depthOfField = resolveSimpleEffect('depthOfField', merged.depthOfField, base.depthOfField,
        { focus: 10, aperture: 0.0002, maxBlur: 0.008 }, fields => ({ focus: focusValue(fields.focus ?? 10), aperture: bounded('composer.depthOfField.aperture', fields.aperture, 0.0002, 0, 0.1), maxBlur: bounded('composer.depthOfField.maxBlur', fields.maxBlur, 0.008, 0, 0.05) }))
    const outlines = resolveSimpleEffect('outlines', merged.outlines, base.outlines,
        { color: 0xffffff, hiddenColor: 0x190a05, strength: 2, thickness: 1, glow: 0 }, fields => ({ color: colorValue('composer.outlines.color', fields.color, 0xffffff), hiddenColor: colorValue('composer.outlines.hiddenColor', fields.hiddenColor, 0x190a05), strength: bounded('composer.outlines.strength', fields.strength, 2, 0, 10), thickness: bounded('composer.outlines.thickness', fields.thickness, 1, 0, 10), glow: bounded('composer.outlines.glow', fields.glow, 0, 0, 4) }))
    const lut = resolveLut(merged.lut, base.lut)
    const protectAnnotations = booleanValue('composer.protectAnnotations', merged.protectAnnotations, base.protectAnnotations)
    return Object.freeze({ preset, enabled, quality, maxPixelRatio: Math.min(maxPixelRatio, qualityCap), reducedEffects,
        output: Object.freeze({ toneMapping, exposure }), bloom, ambientOcclusion, grading, vignette,
        depthOfField, outlines, lut, protectAnnotations, antialias })
}

function resolveSimpleEffect<T extends object>(name: string, value: false | true | Readonly<Partial<T>> | undefined,
    base: false | Readonly<T>, defaults: T, validate: (fields: Record<string, any>) => T): false | Readonly<T> {
    if (value === false) return false
    if (value === undefined && base === false) return false
    const fields = Object.assign({}, base === false ? defaults : base, value === true || value === undefined ? {} : value)
    return Object.freeze(validate(fields))
}

function resolveLut(value: VxComposerOptions['lut'], base: VxResolvedComposerOptions['lut']): VxResolvedComposerOptions['lut'] {
    if (value === false || (value === undefined && base === false)) return false
    const fields = Object.assign({}, base === false ? {} : base, value)
    if (!(fields.texture instanceof Data3DTexture)) fail('composer.lut.texture', 'must be a Three.js Data3DTexture')
    if (fields.texture.colorSpace !== NoColorSpace) fail('composer.lut.texture.colorSpace', 'must be NoColorSpace linear LUT data')
    return Object.freeze({ texture: fields.texture, intensity: bounded('composer.lut.intensity', fields.intensity, 1, 0, 1) })
}

function focusValue(value: unknown): number | string | readonly [number, number, number] {
    if (typeof value === 'number') return positive('composer.depthOfField.focus', value, 10)
    if (typeof value === 'string' && value.length) return value
    if (Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number' && Number.isFinite(item))) return Object.freeze([...value]) as readonly [number, number, number]
    return fail('composer.depthOfField.focus', 'must be a positive distance, node ID/name, or three-number world anchor')
}

function colorValue(path: string, value: unknown, fallback: number): number | string {
    const result = value ?? fallback
    if (typeof result !== 'number' && typeof result !== 'string') fail(path, 'must be a numeric or string color')
    return result
}

function resolveBloom(value: VxComposerOptions['bloom'], base: VxResolvedComposerOptions['bloom']): VxResolvedComposerOptions['bloom'] {
    if (value === false) return false
    const defaults: VxBloomOptions = base === false
        ? { mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 }
        : { ...base }
    const fields = value === true || value === undefined ? {} : value
    if (value === undefined && base === false) return false
    const mode = fields.mode ?? defaults.mode
    enumValue('composer.bloom.mode', mode, ['luminance', 'selected'])
    const thresholdDefault = fields.mode && fields.threshold === undefined
        ? fields.mode === 'selected' ? 0 : 1
        : defaults.threshold
    return Object.freeze({ mode,
        strength: bounded('composer.bloom.strength', fields.strength, defaults.strength, 0, 2),
        radius: bounded('composer.bloom.radius', fields.radius, defaults.radius, 0, 1),
        threshold: nonnegative('composer.bloom.threshold', fields.threshold, thresholdDefault) })
}

export function resolveNodeEffects(value: unknown): Readonly<VxNodeEffects> | undefined {
    if (value == null) return undefined
    assertObject('effects', value)
    for (const key of Object.keys(value)) if (key !== 'bloom' && key !== 'bloomGain' && key !== 'outline') unsupported(`effects.${key}`)
    const effects = value as VxNodeEffects
    if (effects.bloom !== undefined) enumValue('effects.bloom', effects.bloom, ['auto', 'include', 'exclude'])
    if (effects.outline !== undefined) enumValue('effects.outline', effects.outline, ['auto', 'include', 'exclude'])
    const bloomGain = effects.bloomGain === undefined ? undefined : bounded('effects.bloomGain', effects.bloomGain, 1, 0, 4)
    return Object.freeze(Object.fromEntries(Object.entries({ bloom: effects.bloom, bloomGain, outline: effects.outline })
        .filter(([, field]) => field !== undefined)))
}

function mergeDefined(a: object | undefined, b: object): object {
    return Object.assign({}, a, Object.fromEntries(Object.entries(b).filter(([, value]) => value !== undefined)))
}
function assertObject(path: string, value: unknown): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object')
}
function enumValue(path: string, value: unknown, values: readonly unknown[]): void {
    if (!values.includes(value)) fail(path, `must be one of ${values.join(', ')}`)
}
function booleanValue(path: string, value: unknown, fallback: boolean): boolean {
    if (value === undefined) return fallback
    if (typeof value !== 'boolean') fail(path, 'must be a boolean')
    return value
}
function finite(path: string, value: unknown, fallback: number): number {
    const result = value === undefined ? fallback : value
    if (typeof result !== 'number' || !Number.isFinite(result)) fail(path, 'must be a finite number')
    return result
}
function bounded(path: string, value: unknown, fallback: number, min: number, max: number): number {
    const result = finite(path, value, fallback)
    if (result < min || result > max) fail(path, `must be between ${min} and ${max}`)
    return result
}
function positive(path: string, value: unknown, fallback: number): number {
    const result = finite(path, value, fallback)
    if (result <= 0) fail(path, 'must be positive')
    return result
}
function nonnegative(path: string, value: unknown, fallback: number): number {
    const result = finite(path, value, fallback)
    if (result < 0) fail(path, 'must be nonnegative')
    return result
}
function unsupported(path: string): never { return fail(path, 'is not supported by this composer milestone') }
function fail(path: string, message: string): never { throw new TypeError(`${path} ${message}`) }

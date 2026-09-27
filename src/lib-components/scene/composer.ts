import type { VxBloomOptions, VxComposerOptions, VxComposerPreset, VxNodeEffects, VxResolvedComposerOptions, VxToneMapping } from './composer-api.js'
export type * from './composer-api.js'

type ComposerLayer = Readonly<VxComposerOptions> | undefined

const PRESETS: Readonly<Record<VxComposerPreset, VxResolvedComposerOptions>> = Object.freeze({
    technical: profile('technical', 'neutral', false),
    // AO and grading are deliberately deferred. These profiles retain their documented
    // output treatment without pretending those later passes are active.
    studio: profile('studio', 'neutral', false),
    luminous: profile('luminous', 'aces', { mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 }),
    editorial: profile('editorial', 'neutral', false),
})

function profile(preset: VxComposerPreset, toneMapping: VxToneMapping, bloom: false | VxBloomOptions): VxResolvedComposerOptions {
    return Object.freeze({ preset, enabled: true, quality: 'balanced', maxPixelRatio: 1.5,
        reducedEffects: 'system', output: Object.freeze({ toneMapping, exposure: 1 }),
        bloom: bloom === false ? false : Object.freeze({ ...bloom }), antialias: 'auto' })
}

const allowed = new Set(['preset', 'enabled', 'quality', 'maxPixelRatio', 'reducedEffects', 'output', 'bloom', 'antialias'])
const allowedOutput = new Set(['toneMapping', 'exposure'])
const allowedBloom = new Set(['mode', 'strength', 'radius', 'threshold'])

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
            } else if (key === 'bloom') {
                if (value !== true && value !== false) {
                    assertObject('composer.bloom', value)
                    for (const nested of Object.keys(value)) if (!allowedBloom.has(nested)) unsupported(`composer.bloom.${nested}`)
                    result.bloom = mergeDefined(typeof result.bloom === 'object' ? result.bloom as object : undefined, value)
                } else result.bloom = value
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
    return Object.freeze({ preset, enabled, quality, maxPixelRatio: Math.min(maxPixelRatio, qualityCap), reducedEffects,
        output: Object.freeze({ toneMapping, exposure }), bloom, antialias })
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
    for (const key of Object.keys(value)) if (key !== 'bloom' && key !== 'bloomGain') unsupported(`effects.${key}`)
    const effects = value as VxNodeEffects
    if (effects.bloom !== undefined) enumValue('effects.bloom', effects.bloom, ['auto', 'include', 'exclude'])
    const bloomGain = effects.bloomGain === undefined ? undefined : bounded('effects.bloomGain', effects.bloomGain, 1, 0, 4)
    return Object.freeze(Object.fromEntries(Object.entries({ bloom: effects.bloom, bloomGain })
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

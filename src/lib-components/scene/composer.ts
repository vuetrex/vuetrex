import type { VxBloomOptions, VxComposerOptions, VxComposerPreset, VxNodeEffects, VxResolvedComposerOptions } from './composer-api.js'
export type * from './composer-api.js'

type ComposerLayer = Readonly<VxComposerOptions> | undefined

const PRESETS: Readonly<Record<VxComposerPreset, VxResolvedComposerOptions>> = Object.freeze({
    technical: profile('technical', false),
    studio: profile('studio', false, { intensity: 0.15, radius: 0.25 }),
    luminous: profile('luminous', { mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 }),
    editorial: profile('editorial', false, false, { contrast: 1.05, saturation: 0.95 }, { strength: 0.08, offset: 0.8 }),
})

function profile(preset: VxComposerPreset, bloom: false | VxBloomOptions,
    ambientOcclusion: VxResolvedComposerOptions['ambientOcclusion'] = false,
    grading: VxResolvedComposerOptions['grading'] = false,
    vignette: VxResolvedComposerOptions['vignette'] = false): VxResolvedComposerOptions {
    return Object.freeze({ preset, enabled: true, quality: 'balanced', maxPixelRatio: 1.5,
        reducedEffects: 'system', output: Object.freeze({ exposure: 1 }),
        bloom: bloom === false ? false : Object.freeze({ ...bloom }),
        ambientOcclusion: ambientOcclusion === false ? false : Object.freeze({ ...ambientOcclusion }),
        grading: grading === false ? false : Object.freeze({ ...grading }),
        vignette: vignette === false ? false : Object.freeze({ ...vignette }),
        passes: Object.freeze([]), protectAnnotations: false, antialias: 'auto' })
}

const effectKeys = ['bloom', 'ambientOcclusion', 'grading', 'vignette'] as const
const allowed = new Set(['preset', 'enabled', 'quality', 'maxPixelRatio', 'reducedEffects', 'output', ...effectKeys, 'passes', 'protectAnnotations', 'antialias'])
const allowedOutput = new Set(['exposure'])
const allowedNested: Record<(typeof effectKeys)[number], ReadonlySet<string>> = {
    bloom: new Set(['mode', 'strength', 'radius', 'threshold']),
    ambientOcclusion: new Set(['intensity', 'radius']),
    grading: new Set(['contrast', 'saturation']),
    vignette: new Set(['strength', 'offset']),
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
    const protectAnnotations = booleanValue('composer.protectAnnotations', merged.protectAnnotations, base.protectAnnotations)
    return Object.freeze({ preset, enabled, quality, maxPixelRatio: Math.min(maxPixelRatio, qualityCap), reducedEffects,
        output: Object.freeze({ exposure }), bloom, ambientOcclusion, grading, vignette,
        passes: resolvePasses(merged.passes), protectAnnotations, antialias })
}

function resolveSimpleEffect<T extends object>(name: string, value: false | true | Readonly<Partial<T>> | undefined,
    base: false | Readonly<T>, defaults: T, validate: (fields: Record<string, any>) => T): false | Readonly<T> {
    if (value === false) return false
    if (value === undefined && base === false) return false
    const fields = Object.assign({}, base === false ? defaults : base, value === true || value === undefined ? {} : value)
    return Object.freeze(validate(fields))
}

function resolvePasses(value: VxComposerOptions['passes']) {
    if (value === undefined) return Object.freeze([])
    if (!Array.isArray(value)) fail('composer.passes', 'must be an array')
    const keys = new Set<string>()
    return Object.freeze(value.map(pass => {
        if (!pass || typeof pass.key !== 'string' || !pass.key || keys.has(pass.key)) fail('composer.passes', 'requires unique non-empty keys')
        if (typeof pass.create !== 'function') fail(`composer.passes.${pass.key}`, 'requires a factory')
        enumValue(`composer.passes.${pass.key}.phase`, pass.phase, ['linear', 'display'])
        keys.add(pass.key)
        return Object.freeze({ key: pass.key, phase: pass.phase, create: pass.create })
    }))
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

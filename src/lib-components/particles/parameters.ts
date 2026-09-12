import { unref } from 'vue'
import {
    PARTICLE_PARAMETER,
    type ParticleParameter,
    type ParticleParameterValues,
    type ParticleValue,
} from '@/lib-components/particles/types.js'

export function particleParameter<Value>(name: string, fallback?: Value): ParticleParameter<Value> {
    if (!name.trim()) throw new TypeError('Particle parameter names must not be empty.')
    return Object.freeze({
        [PARTICLE_PARAMETER]: true as const,
        name,
        ...(fallback === undefined ? {} : { fallback }),
    })
}

export function isParticleParameter(value: unknown): value is ParticleParameter<unknown> {
    return Boolean(value && typeof value === 'object' && (value as ParticleParameter)[PARTICLE_PARAMETER] === true)
}

export function resolveParticleValue<Value>(
    value: ParticleValue<Value> | undefined,
    parameters: ParticleParameterValues,
): Value | undefined {
    if (!isParticleParameter(value)) return value
    const resolved = parameters[value.name]
    if (resolved !== undefined) return unref(resolved) as Value
    if ('fallback' in value) return value.fallback as Value
    throw new Error(`Missing required particle parameter '${value.name}'.`)
}


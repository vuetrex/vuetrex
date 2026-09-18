import type { ParticleParameter, ParticleParameterValues, ParticleValue } from '@/lib-components/particles/types.js'
import { graphParameter, isGraphParameter, resolveGraphParameter } from '@/lib-components/graph/parameters.js'

export function particleParameter<Value>(name: string, fallback?: Value): ParticleParameter<Value> {
    return graphParameter(name, fallback)
}

export function isParticleParameter(value: unknown): value is ParticleParameter<unknown> {
    return isGraphParameter(value)
}

export function resolveParticleValue<Value>(
    value: ParticleValue<Value> | undefined,
    parameters: ParticleParameterValues,
): Value | undefined {
    return resolveGraphParameter(value, parameters, 'particle')
}

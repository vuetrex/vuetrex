import { resolveParticleValue } from '@/lib-components/particles/parameters.js'
import type {
    ParticleContext,
    ParticleField,
    ParticleParameterValues,
    ParticleValue,
} from '@/lib-components/particles/types.js'

/** Mark a callback as a particle field while preserving its inferred item type. */
export function particleField<Value, Item = unknown>(
    evaluate: (context: ParticleContext<Item>) => Value,
): ParticleField<Value, Item> {
    return evaluate
}

export function resolveParticleField<Value, Item>(
    field: ParticleField<Value, Item> | undefined,
    context: ParticleContext<Item>,
    parameters: ParticleParameterValues,
): Value | undefined {
    const value = typeof field === 'function'
        ? (field as (context: ParticleContext<Item>) => ParticleValue<Value>)(context)
        : field
    return resolveParticleValue(value, parameters)
}

import { createParticleNode } from '@/lib-components/particles/graph.js'
import type {
    ParticlePath,
    ParticleSource,
    ParticleVector3Like,
    PathParticleOptions,
    PathsParticleOptions,
} from '@/lib-components/particles/types.js'

export function path<Item = unknown>(
    points: readonly ParticleVector3Like[],
    options: PathParticleOptions<Item> = {},
): ParticleSource<Item> {
    if (points.length < 2) throw new TypeError('particles.path() requires at least two points.')
    const { key, ...parameters } = options
    return createParticleNode('path', {}, { points: [...points], ...parameters }, key)
}

export function paths<Item = unknown>(
    definitions: readonly ParticlePath<Item>[],
    options: PathsParticleOptions<Item> = {},
): ParticleSource<Item> {
    if (definitions.length === 0) throw new TypeError('particles.paths() requires at least one path.')
    for (const definition of definitions) {
        if (definition.points.length < 2) throw new TypeError('Every particle path requires at least two points.')
    }
    const { key, ...parameters } = options
    return createParticleNode('paths', {}, { paths: [...definitions], ...parameters }, key)
}


import { createParticleNode } from '@/lib-components/particles/graph.js'
import type {
    CloudParticleOptions,
    CloudsParticleOptions,
    ParticleCloud,
    ParticleSource,
    ParticleTarget,
} from '@/lib-components/particles/types.js'

export function cloud<Item = unknown>(
    target: ParticleTarget,
    options: CloudParticleOptions<Item> = {},
): ParticleSource<Item> {
    const { key, ...parameters } = options
    return createParticleNode('cloud', {}, { target, ...parameters }, key)
}

export function clouds<Item = unknown>(
    definitions: readonly ParticleCloud<Item>[],
    options: CloudsParticleOptions<Item> = {},
): ParticleSource<Item> {
    if (definitions.length === 0) throw new TypeError('particles.clouds() requires at least one target.')
    const { key, ...parameters } = options
    return createParticleNode('clouds', {}, { clouds: [...definitions], ...parameters }, key)
}


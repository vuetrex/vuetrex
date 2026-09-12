import { joinParticleSources } from '@/lib-components/particles/graph.js'
import type { ParticleJoinOptions, ParticleSource } from '@/lib-components/particles/types.js'

export function join<Item = unknown>(
    inputs: readonly ParticleSource<Item>[],
    options: ParticleJoinOptions = {},
): ParticleSource<Item> {
    return joinParticleSources(inputs, options)
}


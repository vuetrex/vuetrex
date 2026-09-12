import { namedParticleSource } from '@/lib-components/particles/graph.js'
import type { ParticleNodeOptions, ParticleSource, ParticleValue } from '@/lib-components/particles/types.js'

export function named<Item = unknown>(
    input: ParticleSource<Item>,
    name: ParticleValue<string>,
    options: ParticleNodeOptions = {},
): ParticleSource<Item> {
    return namedParticleSource(input, name, options)
}


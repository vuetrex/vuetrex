import { appearanceParticleSource } from '@/lib-components/particles/graph.js'
import type { ParticleAppearanceOptions, ParticleSource } from '@/lib-components/particles/types.js'

export function appearance<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleAppearanceOptions<Item> = {},
): ParticleSource<Item> {
    return appearanceParticleSource(input, options)
}


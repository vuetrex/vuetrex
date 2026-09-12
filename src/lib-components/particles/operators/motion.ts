import { motionParticleSource } from '@/lib-components/particles/graph.js'
import type { ParticleMotionOptions, ParticleSource } from '@/lib-components/particles/types.js'

export function motion<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleMotionOptions<Item> = {},
): ParticleSource<Item> {
    return motionParticleSource(input, options)
}


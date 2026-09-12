import { simulateParticleSource } from '@/lib-components/particles/graph.js'
import type { ParticleSimulationOptions, ParticleSource } from '@/lib-components/particles/types.js'

export function simulate<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleSimulationOptions<Item> = {},
): ParticleSource<Item> {
    return simulateParticleSource(input, options)
}


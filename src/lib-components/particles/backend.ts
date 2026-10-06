import * as THREE from 'three'
import { resolveParticleValue } from '@/lib-components/particles/parameters.js'
import { CpuParticleBackend } from '@/lib-components/particles/compiler/cpuBackend.js'
import type {
    CompiledParticleProgram,
    ParticleBackendContext,
} from '@/lib-components/particles/compiler/types.js'
import type { ParticleHit } from '@/lib-components/particles/types.js'

export interface ParticleBackend {
    readonly object: THREE.Object3D
    readonly particleCount: number
    update(timeSeconds: number, deltaSeconds: number): void
    localBounds(target?: THREE.Box3): THREE.Box3
    particleHitAt(index: number, object?: THREE.Object3D): ParticleHit | undefined
    dispose(): void
}

export type ParticleBackendFactory = (
    program: CompiledParticleProgram,
    context: ParticleBackendContext,
) => ParticleBackend

const backends = new Map<string, ParticleBackendFactory>()

/** Register a simulation/render backend, for example an application FBO implementation. */
export function registerParticleBackend(name: string, factory: ParticleBackendFactory): () => void {
    const normalized = name.trim()
    if (!normalized || normalized === 'auto') {
        throw new TypeError("Particle backend names must be non-empty and cannot be 'auto'.")
    }
    if (typeof factory !== 'function') throw new TypeError('Particle backend factory must be a function.')
    backends.set(normalized, factory)
    return () => {
        if (backends.get(normalized) === factory) backends.delete(normalized)
    }
}

export function createParticleBackend(
    program: CompiledParticleProgram,
    context: ParticleBackendContext,
    options: { readonly gpuPaths?: boolean } = {},
): ParticleBackend {
    const requested = new Set(program.emitters.map(emitter =>
        resolveParticleValue(emitter.simulation.backend, context.parameters) ?? 'auto',
    ).filter(name => name !== 'auto'))
    if (requested.size > 1) {
        throw new Error(`A joined particle graph cannot mix backends: ${[...requested].join(', ')}.`)
    }
    // Connector auto mode accelerates eligible paths; explicit backends retain their contract.
    if (requested.size === 0 && options.gpuPaths) return new CpuParticleBackend(program, context, true)
    const name = requested.values().next().value ?? 'cpu'
    const factory = backends.get(name)
    if (!factory) {
        throw new Error(
            `Particle backend '${name}' is not registered. `
            + `Register it with registerParticleBackend('${name}', factory) before mounting <vx-particles>.`,
        )
    }
    return factory(program, context)
}

registerParticleBackend('cpu', (program, context) => new CpuParticleBackend(program, context))

export type {
    CompiledParticleEmitter,
    CompiledParticleProgram,
    ParticleBackendContext,
    ResolvedParticleTarget,
} from '@/lib-components/particles/compiler/types.js'


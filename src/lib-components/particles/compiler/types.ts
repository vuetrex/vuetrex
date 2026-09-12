import type * as THREE from 'three'
import type {
    CloudParticleOptions,
    CloudsParticleOptions,
    ParticleAppearanceOptions,
    ParticleCloud,
    ParticleMotionOptions,
    ParticlePath,
    ParticleSimulationOptions,
    ParticleVector3Like,
    PathParticleOptions,
    PathsParticleOptions,
} from '@/lib-components/particles/types.js'

export interface CompiledPathEmitter {
    readonly kind: 'path'
    readonly key: string
    readonly emitterIndex: number
    readonly path: ParticlePath<any>
    readonly options: Readonly<PathParticleOptions<any> | PathsParticleOptions<any>>
    readonly appearance: Readonly<ParticleAppearanceOptions<any>>
    readonly motion: Readonly<ParticleMotionOptions<any>>
    readonly simulation: Readonly<ParticleSimulationOptions<any>>
    readonly names: readonly string[]
}

export interface CompiledCloudEmitter {
    readonly kind: 'cloud'
    readonly key: string
    readonly emitterIndex: number
    readonly cloud: ParticleCloud<any>
    readonly options: Readonly<CloudParticleOptions<any> | CloudsParticleOptions<any>>
    readonly appearance: Readonly<ParticleAppearanceOptions<any>>
    readonly motion: Readonly<ParticleMotionOptions<any>>
    readonly simulation: Readonly<ParticleSimulationOptions<any>>
    readonly names: readonly string[]
}

export type CompiledParticleEmitter = CompiledPathEmitter | CompiledCloudEmitter

export interface CompiledParticleProgram {
    readonly emitters: readonly CompiledParticleEmitter[]
}

export interface ResolvedParticleTarget {
    readonly center: THREE.Vector3
    readonly radius: THREE.Vector3
}

/** Internal helper accepted by the CPU backend and custom backend implementations. */
export interface ParticleBackendContext {
    readonly parameters: Readonly<Record<string, unknown>>
    readonly pixelRatio: number
    resolveTarget(target: string | ParticleVector3Like): ResolvedParticleTarget
}

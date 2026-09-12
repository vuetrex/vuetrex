import { particleField } from '@/lib-components/particles/fields.js'
import { defineParticles } from '@/lib-components/particles/modules.js'
import { appearance } from '@/lib-components/particles/operators/appearance.js'
import { join } from '@/lib-components/particles/operators/join.js'
import { motion } from '@/lib-components/particles/operators/motion.js'
import { named } from '@/lib-components/particles/operators/named.js'
import { simulate } from '@/lib-components/particles/operators/simulate.js'
import { particleParameter } from '@/lib-components/particles/parameters.js'
import { cloud, clouds } from '@/lib-components/particles/sources/cloud.js'
import { path, paths } from '@/lib-components/particles/sources/path.js'

/** Functional particle constructors and operators. Every returned source is also fluent. */
export const particles = Object.freeze({
    path,
    paths,
    cloud,
    clouds,
    appearance,
    motion,
    simulate,
    named,
    join,
    field: particleField,
    param: particleParameter,
})

export { ParticleNode } from '@/lib-components/particles/ParticleNode.js'
export type { ParticleAnchor, ParticleDiagnostics } from '@/lib-components/particles/ParticleNode.js'
export { defineParticles, defineParticleOutputs } from '@/lib-components/particles/modules.js'
export { particleField, resolveParticleField } from '@/lib-components/particles/fields.js'
export { particleParameter, isParticleParameter, resolveParticleValue } from '@/lib-components/particles/parameters.js'
export { isParticleSource, particleGraphSignature } from '@/lib-components/particles/graph.js'
export {
    registerParticleBackend,
    type ParticleBackend,
    type ParticleBackendFactory,
    type ParticleBackendContext,
    type CompiledParticleEmitter,
    type CompiledParticleProgram,
    type ResolvedParticleTarget,
} from '@/lib-components/particles/backend.js'
export type {
    CloudParticleOptions,
    CloudsParticleOptions,
    ParticleAppearanceOptions,
    ParticleAttractorForce,
    ParticleBackendName,
    ParticleChain,
    ParticleCloud,
    ParticleColor,
    ParticleContext,
    ParticleCount,
    ParticleFactory,
    ParticleField,
    ParticleForce,
    ParticleGraphNode,
    ParticleGravityForce,
    ParticleHit,
    ParticleJoinOptions,
    ParticleMotionOptions,
    ParticleNodeOptions,
    ParticleOrbitOptions,
    ParticleOutputMap,
    ParticleOutputs,
    ParticleOutputsFactory,
    ParticleParameter,
    ParticleParameterValues,
    ParticlePath,
    ParticlePipeOperator,
    ParticleSimulationOptions,
    ParticleSource,
    ParticleTarget,
    ParticleValue,
    ParticleVector3Like,
    ParticleVector3Object,
    ParticleVector3Tuple,
    ParticleVortexForce,
    PathParticleOptions,
    PathsParticleOptions,
} from '@/lib-components/particles/types.js'

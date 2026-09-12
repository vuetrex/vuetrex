import { resolveParticleValue } from '@/lib-components/particles/parameters.js'
import type {
    CompiledParticleEmitter,
    CompiledParticleProgram,
} from '@/lib-components/particles/compiler/types.js'
import type {
    ParticleAppearanceOptions,
    ParticleCloud,
    ParticleMotionOptions,
    ParticleParameterValues,
    ParticlePath,
    ParticleSimulationOptions,
    ParticleSource,
} from '@/lib-components/particles/types.js'

interface CompileState {
    readonly appearance: ParticleAppearanceOptions<any>
    readonly motion: ParticleMotionOptions<any>
    readonly simulation: ParticleSimulationOptions<any>
    readonly names: readonly string[]
}

const emptyState: CompileState = {
    appearance: Object.freeze({}),
    motion: Object.freeze({}),
    simulation: Object.freeze({}),
    names: Object.freeze([]),
}

export function compileParticles(
    source: ParticleSource,
    parameters: ParticleParameterValues = {},
): CompiledParticleProgram {
    const emitters: CompiledParticleEmitter[] = []
    const visiting = new WeakSet<ParticleSource>()

    const visit = (node: ParticleSource, state: CompileState): void => {
        if (visiting.has(node)) throw new Error(`Cyclic particle graph detected at '${node.kind}'.`)
        visiting.add(node)
        try {
            const input = node.inputs.particles
            switch (node.kind) {
                case 'path': {
                    const options = node.parameters as any
                    const path: ParticlePath<any> = Object.freeze({
                        points: Object.freeze([...(options.points ?? [])]),
                        item: options.item,
                        key: node.key,
                        closed: options.closed,
                    })
                    emitters.push(makeEmitter('path', path, options, node.key, state, emitters.length))
                    break
                }
                case 'paths': {
                    const options = node.parameters as any
                    for (const path of options.paths as readonly ParticlePath<any>[]) {
                        emitters.push(makeEmitter('path', path, options, path.key ?? node.key, state, emitters.length))
                    }
                    break
                }
                case 'cloud': {
                    const options = node.parameters as any
                    const cloud: ParticleCloud<any> = Object.freeze({
                        target: options.target,
                        item: options.item,
                        key: node.key,
                        radius: options.radius,
                    })
                    emitters.push(makeEmitter('cloud', cloud, options, node.key, state, emitters.length))
                    break
                }
                case 'clouds': {
                    const options = node.parameters as any
                    for (const cloud of options.clouds as readonly ParticleCloud<any>[]) {
                        emitters.push(makeEmitter('cloud', cloud, options, cloud.key ?? node.key, state, emitters.length))
                    }
                    break
                }
                case 'appearance':
                    visitOne(input, {
                        ...state,
                        appearance: Object.freeze({ ...node.parameters, ...state.appearance }),
                    })
                    break
                case 'motion':
                    visitOne(input, {
                        ...state,
                        motion: Object.freeze({ ...node.parameters, ...state.motion }),
                    })
                    break
                case 'simulate':
                    visitOne(input, {
                        ...state,
                        simulation: Object.freeze({ ...node.parameters, ...state.simulation }),
                    })
                    break
                case 'named': {
                    const name = resolveParticleValue((node.parameters as any).name, parameters)
                    visitOne(input, { ...state, names: Object.freeze([...state.names, String(name)]) })
                    break
                }
                case 'join':
                    visitMany(input, state)
                    break
                case 'module':
                    visitOne(input, state)
                    break
                default:
                    throw new Error(`Unsupported particle node kind '${node.kind}'.`)
            }
        } finally {
            visiting.delete(node)
        }
    }

    const visitOne = (input: unknown, state: CompileState): void => {
        if (!input || Array.isArray(input)) throw new Error('Particle operator requires exactly one particle input.')
        visit(input as ParticleSource, state)
    }
    const visitMany = (input: unknown, state: CompileState): void => {
        if (!Array.isArray(input)) throw new Error('Particle join requires a particle input list.')
        input.forEach(item => visit(item, state))
    }

    visit(source, emptyState)
    return Object.freeze({ emitters: Object.freeze(emitters) })
}

function makeEmitter(
    kind: 'path',
    domain: ParticlePath<any>,
    options: any,
    key: string | undefined,
    state: CompileState,
    emitterIndex: number,
): CompiledParticleEmitter
function makeEmitter(
    kind: 'cloud',
    domain: ParticleCloud<any>,
    options: any,
    key: string | undefined,
    state: CompileState,
    emitterIndex: number,
): CompiledParticleEmitter
function makeEmitter(
    kind: 'path' | 'cloud',
    domain: ParticlePath<any> | ParticleCloud<any>,
    options: any,
    key: string | undefined,
    state: CompileState,
    emitterIndex: number,
): CompiledParticleEmitter {
    const base = {
        kind,
        key: key || `${kind}-${emitterIndex}`,
        emitterIndex,
        options: Object.freeze({ ...options }),
        appearance: state.appearance,
        motion: state.motion,
        simulation: state.simulation,
        names: state.names,
    }
    return Object.freeze(kind === 'path'
        ? { ...base, path: domain as ParticlePath<any> }
        : { ...base, cloud: domain as ParticleCloud<any> }) as CompiledParticleEmitter
}

import * as THREE from 'three'
import { isParticleParameter } from '@/lib-components/particles/parameters.js'
import {
    PARTICLE_GRAPH_NODE,
    type ParticleAppearanceOptions,
    type ParticleChain,
    type ParticleGraphNode,
    type ParticleInput,
    type ParticleJoinOptions,
    type ParticleMotionOptions,
    type ParticleNodeOptions,
    type ParticlePipeOperator,
    type ParticleSimulationOptions,
    type ParticleSource,
    type ParticleValue,
} from '@/lib-components/particles/types.js'

const functionIds = new WeakMap<Function, number>()
let functionSequence = 0

class ParticleSourceMethods<Item = unknown> implements ParticleChain<Item> {
    appearance(options: ParticleAppearanceOptions<Item> = {}): ParticleSource<Item> {
        return appearanceParticleSource(this as unknown as ParticleSource<Item>, options)
    }

    motion(options: ParticleMotionOptions<Item> = {}): ParticleSource<Item> {
        return motionParticleSource(this as unknown as ParticleSource<Item>, options)
    }

    simulate(options: ParticleSimulationOptions<Item> = {}): ParticleSource<Item> {
        return simulateParticleSource(this as unknown as ParticleSource<Item>, options)
    }

    named(name: ParticleValue<string>, options: ParticleNodeOptions = {}): ParticleSource<Item> {
        return namedParticleSource(this as unknown as ParticleSource<Item>, name, options)
    }

    join(
        source: ParticleSource<Item> | readonly ParticleSource<Item>[],
        options: ParticleJoinOptions = {},
    ): ParticleSource<Item> {
        const others = Array.isArray(source) ? source : [source]
        return joinParticleSources([this as unknown as ParticleSource<Item>, ...others], options)
    }

    pipe<Output = Item>(operator: ParticlePipeOperator<Item, Output>): ParticleSource<Output> {
        if (typeof operator !== 'function') throw new TypeError('ParticleSource.pipe() requires an operator function.')
        const result = operator(this as unknown as ParticleSource<Item>)
        if (!isParticleSource(result)) {
            throw new TypeError('ParticleSource.pipe() operator must return a ParticleSource.')
        }
        return result
    }
}

const particleSourcePrototype = Object.freeze(ParticleSourceMethods.prototype)

export function isParticleSource(value: unknown): value is ParticleSource<any> {
    return Boolean(value && typeof value === 'object' && (value as ParticleGraphNode)[PARTICLE_GRAPH_NODE] === true)
}

export function createParticleNode<Parameters extends object, Item = unknown>(
    kind: string,
    inputs: Record<string, ParticleInput>,
    parameters: Parameters,
    key?: string,
): ParticleGraphNode<Parameters, Item> {
    for (const [inputName, input] of Object.entries(inputs)) {
        if (input === undefined) continue
        const sources = Array.isArray(input) ? input : [input]
        if (sources.some(source => !isParticleSource(source))) {
            throw new TypeError(`Particle node '${kind}' received an invalid '${inputName}' input.`)
        }
    }
    const node = Object.assign(Object.create(particleSourcePrototype), {
        [PARTICLE_GRAPH_NODE]: true as const,
        kind,
        ...(key ? { key } : {}),
        inputs: Object.freeze({ ...inputs }),
        parameters: Object.freeze({ ...parameters }),
    }) as ParticleGraphNode<Parameters, Item>
    return Object.freeze(node)
}

export function appearanceParticleSource<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleAppearanceOptions<Item> = {},
): ParticleSource<Item> {
    const { key, ...parameters } = options
    return createParticleNode<typeof parameters, Item>('appearance', { particles: input }, parameters, key)
}

export function motionParticleSource<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleMotionOptions<Item> = {},
): ParticleSource<Item> {
    const { key, ...parameters } = options
    return createParticleNode<typeof parameters, Item>('motion', { particles: input }, parameters, key)
}

export function simulateParticleSource<Item = unknown>(
    input: ParticleSource<Item>,
    options: ParticleSimulationOptions<Item> = {},
): ParticleSource<Item> {
    const { key, ...parameters } = options
    return createParticleNode<typeof parameters, Item>('simulate', { particles: input }, parameters, key)
}

export function namedParticleSource<Item = unknown>(
    input: ParticleSource<Item>,
    name: ParticleValue<string>,
    options: ParticleNodeOptions = {},
): ParticleSource<Item> {
    return createParticleNode<{ name: ParticleValue<string> }, Item>(
        'named',
        { particles: input },
        { name },
        options.key,
    )
}

export function joinParticleSources<Item = unknown>(
    inputs: readonly ParticleSource<Item>[],
    options: ParticleJoinOptions = {},
): ParticleSource<Item> {
    const { key, operation = 'combine' } = options
    if (operation !== 'combine') throw new Error(`Unsupported particle join operation: ${String(operation)}.`)
    return createParticleNode<{ operation: 'combine' }, Item>(
        'join',
        { particles: [...inputs] },
        { operation },
        key,
    )
}

function valueSignature(value: unknown, visiting: WeakSet<object>): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'function') {
        let id = functionIds.get(value)
        if (id === undefined) {
            id = ++functionSequence
            functionIds.set(value, id)
        }
        return `function:${value.name || 'anonymous'}:${id}`
    }
    if (Array.isArray(value)) return `[${value.map(item => valueSignature(item, visiting)).join(',')}]`
    if (typeof value !== 'object') return String(value)
    if (isParticleParameter(value)) return `parameter:${value.name}:${valueSignature(value.fallback, visiting)}`
    if (visiting.has(value)) return '[cycle]'
    visiting.add(value)
    try {
        if ((value as THREE.Vector2).isVector2) return `v2:${(value as THREE.Vector2).toArray().join(',')}`
        if ((value as THREE.Vector3).isVector3) return `v3:${(value as THREE.Vector3).toArray().join(',')}`
        if ((value as THREE.Vector4).isVector4) return `v4:${(value as THREE.Vector4).toArray().join(',')}`
        if (isParticleSource(value)) return particleGraphSignature(value, visiting)
        const record = value as Record<string, unknown>
        return `{${Object.keys(record).sort().map(key => `${key}:${valueSignature(record[key], visiting)}`).join(',')}}`
    } finally {
        visiting.delete(value)
    }
}

export function particleGraphSignature(source: ParticleSource<any>, visiting = new WeakSet<object>()): string {
    if (visiting.has(source)) throw new Error(`Cyclic particle graph detected at '${source.kind}'.`)
    visiting.add(source)
    try {
        const inputs = Object.keys(source.inputs).sort().map(name => {
            const input = source.inputs[name]
            if (Array.isArray(input)) {
                return `${name}:[${input.map(item => particleGraphSignature(item, visiting)).join('|')}]`
            }
            return `${name}:${input ? particleGraphSignature(input as ParticleSource, visiting) : 'none'}`
        })
        return `${source.kind}${source.key ? `#${source.key}` : ''}(${valueSignature(source.parameters, visiting)})[${inputs.join(',')}]`
    } finally {
        visiting.delete(source)
    }
}


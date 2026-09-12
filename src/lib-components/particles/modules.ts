import { createParticleNode, isParticleSource } from '@/lib-components/particles/graph.js'
import type {
    ParticleFactory,
    ParticleOutputMap,
    ParticleOutputs,
    ParticleOutputsFactory,
    ParticleSource,
} from '@/lib-components/particles/types.js'

const MAX_CONSTRUCTION_DEPTH = 128
let moduleSequence = 0

export function defineParticles<Parameters, Item = unknown>(
    build: (parameters: Readonly<Parameters>) => ParticleSource<Item>,
): ParticleFactory<Parameters, Item>
export function defineParticles<Parameters, Item = unknown>(
    name: string,
    build: (parameters: Readonly<Parameters>) => ParticleSource<Item>,
): ParticleFactory<Parameters, Item>
export function defineParticles<Parameters, Item = unknown>(
    nameOrBuild: string | ((parameters: Readonly<Parameters>) => ParticleSource<Item>),
    maybeBuild?: (parameters: Readonly<Parameters>) => ParticleSource<Item>,
): ParticleFactory<Parameters, Item> {
    const build = typeof nameOrBuild === 'function' ? nameOrBuild : maybeBuild
    if (!build) throw new TypeError('defineParticles() requires a builder function.')
    const moduleName = typeof nameOrBuild === 'string'
        ? nameOrBuild
        : build.name || `particle-module-${++moduleSequence}`
    let constructionDepth = 0

    const factory = ((parameters: Readonly<Parameters>) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Particle module '${moduleName}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive particle factories must terminate with a finite depth.',
            )
        }
        try {
            const source = build(parameters)
            if (!isParticleSource(source)) {
                throw new TypeError(`Particle module '${moduleName}' did not return a ParticleSource.`)
            }
            return createParticleNode('module', { particles: source }, { name: moduleName }, moduleName)
        } finally {
            constructionDepth--
        }
    }) as ParticleFactory<Parameters, Item>

    Object.defineProperty(factory, 'particleModuleName', { value: moduleName, enumerable: true })
    return factory
}

export function defineParticleOutputs<Parameters, Outputs extends ParticleOutputMap>(
    name: string,
    build: (parameters: Readonly<Parameters>) => Outputs,
): ParticleOutputsFactory<Parameters, Outputs> {
    if (!name.trim()) throw new TypeError('Particle output module names must not be empty.')
    let constructionDepth = 0
    const factory = ((parameters: Readonly<Parameters>) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Particle output module '${name}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive particle factories must terminate with a finite depth.',
            )
        }
        let built: Outputs
        try {
            built = build(parameters)
        } finally {
            constructionDepth--
        }
        if (!built || typeof built !== 'object' || Array.isArray(built)) {
            throw new TypeError(`Particle output module '${name}' did not return a named output map.`)
        }
        const names = Object.keys(built)
        if (names.length === 0) throw new TypeError(`Particle output module '${name}' must return at least one output.`)
        if (names.includes('output')) throw new TypeError(`Particle output module '${name}' reserves the output name 'output'.`)
        const wrapped: ParticleOutputMap = {}
        for (const outputName of names) {
            const source = built[outputName]
            if (!isParticleSource(source)) {
                throw new TypeError(`Particle output '${name}.${outputName}' is not a ParticleSource.`)
            }
            wrapped[outputName] = createParticleNode(
                'module',
                { particles: source },
                { name, output: outputName },
                `${name}.${outputName}`,
            )
        }
        Object.defineProperty(wrapped, 'output', {
            enumerable: false,
            value(outputName: string) {
                const source = wrapped[outputName]
                if (!source) throw new Error(`Unknown particle output '${name}.${outputName}'.`)
                return source
            },
        })
        return Object.freeze(wrapped) as ParticleOutputs<Outputs>
    }) as ParticleOutputsFactory<Parameters, Outputs>
    Object.defineProperty(factory, 'particleModuleName', { value: name, enumerable: true })
    return factory
}

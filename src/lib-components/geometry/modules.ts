import { createGeometryNode, isGeometrySource } from '@/lib-components/geometry/graph.js'
import type {
    GeometryFactory,
    GeometryOutputMap,
    GeometryOutputs,
    GeometryOutputsFactory,
    GeometrySource,
} from '@/lib-components/geometry/types.js'

const MAX_CONSTRUCTION_DEPTH = 128
let moduleSequence = 0

export function defineGeometry<Parameters, Item = unknown>(
    build: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item>
export function defineGeometry<Parameters, Item = unknown>(
    name: string,
    build: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item>
export function defineGeometry<Parameters, Item = unknown>(
    nameOrBuild: string | ((parameters: Readonly<Parameters>) => GeometrySource<Item>),
    maybeBuild?: (parameters: Readonly<Parameters>) => GeometrySource<Item>,
): GeometryFactory<Parameters, Item> {
    const build = typeof nameOrBuild === 'function' ? nameOrBuild : maybeBuild
    if (!build) throw new TypeError('defineGeometry() requires a builder function.')
    const moduleName = typeof nameOrBuild === 'string'
        ? nameOrBuild
        : build.name || `geometry-module-${++moduleSequence}`
    let constructionDepth = 0

    const factory = ((parameters: Readonly<Parameters>) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Geometry module '${moduleName}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive geometry factories must terminate with a finite depth.',
            )
        }
        try {
            const source = build(parameters)
            if (!isGeometrySource(source)) {
                throw new TypeError(`Geometry module '${moduleName}' did not return a GeometrySource.`)
            }
            return createGeometryNode(
                'module',
                { geometry: source },
                { name: moduleName },
                moduleName,
            )
        } finally {
            constructionDepth--
        }
    }) as GeometryFactory<Parameters, Item>

    Object.defineProperty(factory, 'geometryModuleName', {
        value: moduleName,
        enumerable: true,
    })
    return factory
}

export function defineGeometryOutputs<Parameters, Outputs extends GeometryOutputMap>(
    name: string,
    build: (parameters: Readonly<Parameters>) => Outputs,
): GeometryOutputsFactory<Parameters, Outputs> {
    if (!name.trim()) throw new TypeError('Geometry output module names must not be empty.')
    let constructionDepth = 0

    const factory = ((parameters: Readonly<Parameters>) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Geometry output module '${name}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive geometry factories must terminate with a finite depth.',
            )
        }
        let built: Outputs
        try {
            built = build(parameters)
        } finally {
            constructionDepth--
        }
        if (!built || typeof built !== 'object' || Array.isArray(built)) {
            throw new TypeError(`Geometry output module '${name}' did not return a named output map.`)
        }
        const outputNames = Object.keys(built)
        if (outputNames.length === 0) {
            throw new TypeError(`Geometry output module '${name}' must return at least one output.`)
        }
        if (outputNames.includes('output')) {
            throw new TypeError(`Geometry output module '${name}' reserves the output name 'output'.`)
        }
        const wrapped: GeometryOutputMap = {}
        for (const outputName of outputNames) {
            const source = built[outputName]
            if (!isGeometrySource(source)) {
                throw new TypeError(`Geometry output '${name}.${outputName}' is not a GeometrySource.`)
            }
            wrapped[outputName] = createGeometryNode(
                'module',
                { geometry: source },
                { name, output: outputName },
                `${name}.${outputName}`,
            )
        }
        Object.defineProperty(wrapped, 'output', {
            enumerable: false,
            value(outputName: string) {
                const source = wrapped[outputName]
                if (!source) throw new Error(`Unknown geometry output '${name}.${outputName}'.`)
                return source
            },
        })
        return Object.freeze(wrapped) as GeometryOutputs<Outputs>
    }) as GeometryOutputsFactory<Parameters, Outputs>

    Object.defineProperty(factory, 'geometryModuleName', {
        value: name,
        enumerable: true,
    })
    return factory
}

import { createConnectorNode, isConnectorSource } from '@/lib-components/connectors/graph.js'
import type {
    ConnectorFactory,
    ConnectorOutputMap,
    ConnectorOutputs,
    ConnectorOutputsFactory,
    ConnectorModuleInstanceOptions,
    ConnectorSource,
} from '@/lib-components/connectors/types.js'

const MAX_CONSTRUCTION_DEPTH = 128
let moduleSequence = 0

export function defineConnectors<Parameters, Item = unknown>(
    build: (parameters: Readonly<Parameters>) => ConnectorSource<Item>,
): ConnectorFactory<Parameters, Item>
export function defineConnectors<Parameters, Item = unknown>(
    name: string,
    build: (parameters: Readonly<Parameters>) => ConnectorSource<Item>,
): ConnectorFactory<Parameters, Item>
export function defineConnectors<Parameters, Item = unknown>(
    nameOrBuild: string | ((parameters: Readonly<Parameters>) => ConnectorSource<Item>),
    maybeBuild?: (parameters: Readonly<Parameters>) => ConnectorSource<Item>,
): ConnectorFactory<Parameters, Item> {
    const build = typeof nameOrBuild === 'function' ? nameOrBuild : maybeBuild
    if (!build) throw new TypeError('defineConnectors() requires a builder function.')
    const moduleName = typeof nameOrBuild === 'string'
        ? nameOrBuild
        : build.name || `connector-module-${++moduleSequence}`
    let constructionDepth = 0

    const factory = ((parameters: Readonly<Parameters>, options: ConnectorModuleInstanceOptions = {}) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Connector module '${moduleName}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive connector factories must terminate with a finite depth.',
            )
        }
        try {
            const source = build(parameters)
            if (!isConnectorSource(source)) {
                throw new TypeError(`Connector module '${moduleName}' did not return a ConnectorSource.`)
            }
            const scope = options.scope?.trim()
            if (options.scope !== undefined && !scope) throw new TypeError('Connector module scope must not be empty.')
            return createConnectorNode('module', { connectors: source }, {
                name: moduleName,
                ...(scope ? { scope } : {}),
            }, scope ? `${moduleName}@${scope}` : moduleName)
        } finally {
            constructionDepth--
        }
    }) as ConnectorFactory<Parameters, Item>

    Object.defineProperty(factory, 'connectorModuleName', { value: moduleName, enumerable: true })
    return factory
}

export function defineConnectorOutputs<Parameters, Outputs extends ConnectorOutputMap>(
    name: string,
    build: (parameters: Readonly<Parameters>) => Outputs,
): ConnectorOutputsFactory<Parameters, Outputs> {
    if (!name.trim()) throw new TypeError('Connector output module names must not be empty.')
    let constructionDepth = 0
    const factory = ((parameters: Readonly<Parameters>, options: ConnectorModuleInstanceOptions = {}) => {
        constructionDepth++
        if (constructionDepth > MAX_CONSTRUCTION_DEPTH) {
            constructionDepth--
            throw new Error(
                `Connector output module '${name}' exceeded ${MAX_CONSTRUCTION_DEPTH} nested calls. `
                + 'Recursive connector factories must terminate with a finite depth.',
            )
        }
        let built: Outputs
        try {
            built = build(parameters)
        } finally {
            constructionDepth--
        }
        if (!built || typeof built !== 'object' || Array.isArray(built)) {
            throw new TypeError(`Connector output module '${name}' did not return a named output map.`)
        }
        const outputNames = Object.keys(built)
        if (outputNames.length === 0) throw new TypeError(`Connector output module '${name}' must return an output.`)
        if (outputNames.includes('output')) {
            throw new TypeError(`Connector output module '${name}' reserves the output name 'output'.`)
        }
        const wrapped: ConnectorOutputMap = {}
        const scope = options.scope?.trim()
        if (options.scope !== undefined && !scope) throw new TypeError('Connector module scope must not be empty.')
        for (const outputName of outputNames) {
            const source = built[outputName]
            if (!isConnectorSource(source)) {
                throw new TypeError(`Connector output '${name}.${outputName}' is not a ConnectorSource.`)
            }
            wrapped[outputName] = createConnectorNode(
                'module',
                { connectors: source },
                { name, output: outputName, ...(scope ? { scope } : {}) },
                scope ? `${name}.${outputName}@${scope}` : `${name}.${outputName}`,
            )
        }
        Object.defineProperty(wrapped, 'output', {
            enumerable: false,
            value(outputName: string) {
                const source = wrapped[outputName]
                if (!source) throw new Error(`Unknown connector output '${name}.${outputName}'.`)
                return source
            },
        })
        return Object.freeze(wrapped) as ConnectorOutputs<Outputs>
    }) as ConnectorOutputsFactory<Parameters, Outputs>

    Object.defineProperty(factory, 'connectorModuleName', { value: name, enumerable: true })
    return factory
}

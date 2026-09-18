import * as THREE from 'three'
import { isConnectorParameter } from '@/lib-components/connectors/parameters.js'
import {
    CONNECTOR_GRAPH_NODE,
    type ConnectorBundleOptions,
    type ConnectorBusesMapping,
    type ConnectorChain,
    type ConnectorEdgeOptions,
    type ConnectorEdgesMapping,
    type ConnectorEndpoint,
    type ConnectorFlowFactory,
    type ConnectorNetworkFlowFactory,
    type ConnectorGeometryFactory,
    type ConnectorNetworkGeometryFactory,
    type ConnectorFactoryOptions,
    type ConnectorGraphNode,
    type ConnectorInput,
    type ConnectorItemEndpoint,
    type ConnectorItemKey,
    type ConnectorJoinOptions,
    type ConnectorMarkerOptions,
    type ConnectorNodeOptions,
    type ConnectorPipeOperator,
    type ConnectorProfileName,
    type ConnectorRoutingOptions,
    type ConnectorSource,
    type ConnectorStrokeOptions,
    type ConnectorField,
    type ConnectorVector3Like,
    type ConnectorMappingContext,
} from '@/lib-components/connectors/types.js'

const GEOMETRY_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/geometry-node')
const PARTICLE_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/particle-node')
const functionIds = new WeakMap<Function, number>()
let functionSequence = 0

export interface ConnectorSourceRecord<Item = unknown> {
    readonly key: string
    readonly item: Item
    readonly from: ConnectorEndpoint
    readonly to: readonly ConnectorEndpoint[]
    readonly directed: boolean
    readonly weight?: number
    readonly capacity?: number
    readonly kind?: string
    readonly metadata: Readonly<Record<string, unknown>>
}

class ConnectorSourceMethods<Item = unknown> implements ConnectorChain<Item> {
    profile(profile: ConnectorField<ConnectorProfileName, Item>): ConnectorSource<Item> {
        return profileConnectorSource(this as unknown as ConnectorSource<Item>, profile)
    }

    route(options: ConnectorRoutingOptions<Item> = {}): ConnectorSource<Item> {
        return routeConnectorSource(this as unknown as ConnectorSource<Item>, options)
    }

    bundle(options: ConnectorBundleOptions<Item> = {}): ConnectorSource<Item> {
        return bundleConnectorSource(this as unknown as ConnectorSource<Item>, options)
    }

    stroke(options: ConnectorStrokeOptions<Item> = {}): ConnectorSource<Item> {
        return strokeConnectorSource(this as unknown as ConnectorSource<Item>, options)
    }

    marker(options: ConnectorMarkerOptions<Item>): ConnectorSource<Item> {
        return markerConnectorSource(this as unknown as ConnectorSource<Item>, options)
    }

    flow(factory: ConnectorFlowFactory<Item>, options?: ConnectorFactoryOptions & { scope?: 'traversal' }): ConnectorSource<Item>
    flow(factory: ConnectorNetworkFlowFactory<Item>, options: ConnectorFactoryOptions & { scope: 'network' }): ConnectorSource<Item>
    flow(factory: ConnectorFlowFactory<Item> | ConnectorNetworkFlowFactory<Item>, options: ConnectorFactoryOptions = {}): ConnectorSource<Item> {
        return flowConnectorSource(this as unknown as ConnectorSource<Item>, factory, options)
    }

    geometry(factory: ConnectorGeometryFactory<Item>, options?: ConnectorFactoryOptions & { scope?: 'traversal' }): ConnectorSource<Item>
    geometry(factory: ConnectorNetworkGeometryFactory<Item>, options: ConnectorFactoryOptions & { scope: 'network' }): ConnectorSource<Item>
    geometry(factory: ConnectorGeometryFactory<Item> | ConnectorNetworkGeometryFactory<Item>, options: ConnectorFactoryOptions = {}): ConnectorSource<Item> {
        return geometryConnectorSource(this as unknown as ConnectorSource<Item>, factory, options)
    }

    visible(visible: ConnectorField<boolean, Item>): ConnectorSource<Item> {
        return visibleConnectorSource(this as unknown as ConnectorSource<Item>, visible)
    }

    named(name: ConnectorField<string, Item>, options: ConnectorNodeOptions = {}): ConnectorSource<Item> {
        return namedConnectorSource(this as unknown as ConnectorSource<Item>, name, options)
    }

    join(
        source: ConnectorSource<Item> | readonly ConnectorSource<Item>[],
        options: ConnectorJoinOptions = {},
    ): ConnectorSource<Item> {
        const others = Array.isArray(source) ? source : [source]
        return joinConnectorSources([this as unknown as ConnectorSource<Item>, ...others], options)
    }

    overlay(source: ConnectorSource<Item> | readonly ConnectorSource<Item>[], options: ConnectorNodeOptions = {}): ConnectorSource<Item> {
        const others = Array.isArray(source) ? source : [source]
        return joinConnectorSources([this as unknown as ConnectorSource<Item>, ...others], {
            ...options,
            operation: 'overlay',
        })
    }

    pipe<Output = Item>(operator: ConnectorPipeOperator<Item, Output>): ConnectorSource<Output> {
        if (typeof operator !== 'function') throw new TypeError('ConnectorSource.pipe() requires an operator function.')
        const result = operator(this as unknown as ConnectorSource<Item>)
        if (!isConnectorSource(result)) {
            throw new TypeError('ConnectorSource.pipe() operator must return a ConnectorSource.')
        }
        return result
    }
}

const connectorSourcePrototype = Object.freeze(ConnectorSourceMethods.prototype)

export function isConnectorSource(value: unknown): value is ConnectorSource<any> {
    return Boolean(value && typeof value === 'object'
        && (value as ConnectorGraphNode)[CONNECTOR_GRAPH_NODE] === true)
}

export function createConnectorNode<Parameters extends object, Item = unknown>(
    kind: string,
    inputs: Record<string, ConnectorInput>,
    parameters: Parameters,
    key?: string,
): ConnectorGraphNode<Parameters, Item> {
    if (!kind.trim()) throw new TypeError('Connector node kinds must not be empty.')
    for (const [inputName, input] of Object.entries(inputs)) {
        if (input === undefined) continue
        const sources = Array.isArray(input) ? input : [input]
        if (sources.some(source => !isConnectorSource(source))) {
            throw new TypeError(`Connector node '${kind}' received an invalid '${inputName}' input.`)
        }
    }
    const frozenInputs = Object.fromEntries(Object.entries(inputs).map(([name, input]) => [
        name,
        Array.isArray(input) ? Object.freeze([...input]) : input,
    ]))
    const node = Object.assign(Object.create(connectorSourcePrototype), {
        [CONNECTOR_GRAPH_NODE]: true as const,
        kind,
        ...(key ? { key } : {}),
        inputs: Object.freeze(frozenInputs),
        parameters: freezePlainValue({ ...parameters }),
    }) as ConnectorGraphNode<Parameters, Item>
    return Object.freeze(node)
}

function freezePlainValue<Value>(value: Value): Value {
    if (Array.isArray(value)) return Object.freeze(value.map(freezePlainValue)) as Value
    if (!value || typeof value !== 'object') return value
    if (Object.isFrozen(value)) return value
    if (isConnectorSource(value) || isConnectorParameter(value)) return value
    if (Object.getPrototypeOf(value) !== Object.prototype) return value
    const frozen = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, freezePlainValue(nested)]))
    return Object.freeze(frozen) as Value
}

export function edge<Item = unknown>(
    from: ConnectorEndpoint,
    to: ConnectorEndpoint,
    options: ConnectorEdgeOptions<Item> = {},
): ConnectorSource<Item> {
    assertEndpoint(from, 'from')
    assertEndpoint(to, 'to')
    const key = normalizedKey(options.key ?? `${endpointSignature(from)}->${endpointSignature(to)}`, 'edge')
    const record = makeRecord(key, options.item as Item, from, [to], options)
    return createConnectorNode('edge', {}, { records: Object.freeze([record]) }, key)
}

/** Identity source for conditional composition and empty joins. */
export function empty<Item = unknown>(options: ConnectorNodeOptions = {}): ConnectorSource<Item> {
    return createConnectorNode('empty', {}, {}, options.key)
}

export function edges<Item>(
    items: readonly Item[],
    mapping: ConnectorEdgesMapping<Item>,
): ConnectorSource<Item> {
    if (!mapping || mapping.from === undefined || mapping.to === undefined) {
        throw new TypeError('connectors.edges() requires from and to mappings.')
    }
    const records = items.map((item, index) => {
        const key = keyForItem(item, index, mapping.keyBy)
        const context = mappingContext(item, key, index)
        const from = mappedEndpoint(mapping.from, context)
        const to = mappedEndpoint(mapping.to, context)
        assertEndpoint(from, `from for '${key}'`)
        assertEndpoint(to, `to for '${key}'`)
        return makeRecord(key, item, from, [to], {
            directed: mappedValue(mapping.directed, context),
            weight: mappedValue(mapping.weight, context),
            capacity: mappedValue(mapping.capacity, context),
            kind: mappedValue(mapping.kind, context),
            metadata: mappedValue(mapping.metadata, context),
        })
    })
    assertUniqueRecordKeys(records, 'connectors.edges()')
    return createConnectorNode('edges', {}, { records: Object.freeze(records) })
}

export function bus<Item = unknown>(
    from: ConnectorEndpoint,
    to: readonly ConnectorEndpoint[],
    options: ConnectorEdgeOptions<Item> = {},
): ConnectorSource<Item> {
    assertEndpoint(from, 'from')
    if (!to.length) throw new TypeError('connectors.bus() requires at least one target.')
    to.forEach((endpoint, index) => assertEndpoint(endpoint, `target ${index}`))
    const key = normalizedKey(
        options.key ?? `${endpointSignature(from)}=>${to.map(endpointSignature).join(',')}`,
        'bus',
    )
    const record = makeRecord(key, options.item as Item, from, to, options)
    return createConnectorNode('bus', {}, { records: Object.freeze([record]) }, key)
}

export function buses<Item>(
    items: readonly Item[],
    mapping: ConnectorBusesMapping<Item>,
): ConnectorSource<Item> {
    if (!mapping || mapping.from === undefined || mapping.to === undefined) {
        throw new TypeError('connectors.buses() requires from and to mappings.')
    }
    const records = items.map((item, index) => {
        const key = keyForItem(item, index, mapping.keyBy)
        const context = mappingContext(item, key, index)
        const from = mappedEndpoint(mapping.from, context)
        const targets = typeof mapping.to === 'function' ? mapping.to(context) : mapping.to
        assertEndpoint(from, `from for '${key}'`)
        if (!targets.length) throw new TypeError(`Connector bus '${key}' requires at least one target.`)
        targets.forEach((endpoint, targetIndex) => assertEndpoint(endpoint, `target ${targetIndex} for '${key}'`))
        return makeRecord(key, item, from, targets, {
            directed: mappedValue(mapping.directed, context),
            weight: mappedValue(mapping.weight, context),
            capacity: mappedValue(mapping.capacity, context),
            kind: mappedValue(mapping.kind, context),
            metadata: mappedValue(mapping.metadata, context),
        })
    })
    assertUniqueRecordKeys(records, 'connectors.buses()')
    return createConnectorNode('buses', {}, { records: Object.freeze(records) })
}

export function profileConnectorSource<Item>(
    input: ConnectorSource<Item>,
    profile: ConnectorField<ConnectorProfileName, Item>,
): ConnectorSource<Item> {
    if (profile === 'ground') {
        return strokeConnectorSource(routeConnectorSource(input, {
            strategy: 'orthogonal', surface: 'ground', elevation: 0, lane: 'auto', obstacles: 'stage-nodes',
        }), { key: 'shaft', width: 0.012, opacity: 0.78, markerEnd: 'arrow' })
    }
    if (profile === 'air') {
        return strokeConnectorSource(routeConnectorSource(input, {
            strategy: 'bezier', surface: 'air', elevation: 0.35, lane: 'auto', obstacles: 'none',
        }), { key: 'shaft', width: 0.014, opacity: 0.95, markerEnd: 'arrow' })
    }
    return createConnectorNode('profile', { connectors: input }, { profile })
}

export function routeConnectorSource<Item>(
    input: ConnectorSource<Item>,
    options: ConnectorRoutingOptions<Item> = {},
): ConnectorSource<Item> {
    const { replace, ...parameters } = options
    return createConnectorNode('route', { connectors: input }, {
        ...parameters,
        replace: replace === true,
    })
}

export function bundleConnectorSource<Item>(
    input: ConnectorSource<Item>,
    options: ConnectorBundleOptions<Item> = {},
): ConnectorSource<Item> {
    return createConnectorNode('bundle', { connectors: input }, { ...options })
}

export function strokeConnectorSource<Item>(
    input: ConnectorSource<Item>,
    options: ConnectorStrokeOptions<Item> = {},
): ConnectorSource<Item> {
    return createConnectorNode('stroke', { connectors: input }, { ...options })
}

export function markerConnectorSource<Item>(
    input: ConnectorSource<Item>,
    options: ConnectorMarkerOptions<Item>,
): ConnectorSource<Item> {
    if (!options || (!options.start && !options.end && !options.junction && !options.repeat)) {
        throw new TypeError('connectors.marker() requires at least one geometry source.')
    }
    return createConnectorNode('marker', { connectors: input }, { ...options })
}

export function flowConnectorSource<Item>(
    input: ConnectorSource<Item>,
    factory: ConnectorFlowFactory<Item> | ConnectorNetworkFlowFactory<Item>,
    options: ConnectorFactoryOptions = {},
): ConnectorSource<Item> {
    if (typeof factory !== 'function') throw new TypeError('connectors.flow() requires a particle factory.')
    return createConnectorNode('flow', { connectors: input }, {
        factory,
        scope: options.scope ?? 'traversal',
        layerKey: normalizedKey(options.key ?? 'flow', 'flow layer'),
    })
}

export function geometryConnectorSource<Item>(
    input: ConnectorSource<Item>,
    factory: ConnectorGeometryFactory<Item> | ConnectorNetworkGeometryFactory<Item>,
    options: ConnectorFactoryOptions = {},
): ConnectorSource<Item> {
    if (typeof factory !== 'function') throw new TypeError('connectors.geometry() requires a geometry factory.')
    return createConnectorNode('geometry', { connectors: input }, {
        factory,
        scope: options.scope ?? 'traversal',
        layerKey: normalizedKey(options.key ?? 'geometry', 'geometry layer'),
    })
}

export function visibleConnectorSource<Item>(
    input: ConnectorSource<Item>,
    visible: ConnectorField<boolean, Item>,
): ConnectorSource<Item> {
    return createConnectorNode('visible', { connectors: input }, { visible })
}

export function namedConnectorSource<Item>(
    input: ConnectorSource<Item>,
    name: ConnectorField<string, Item>,
    options: ConnectorNodeOptions = {},
): ConnectorSource<Item> {
    return createConnectorNode('named', { connectors: input }, { name }, options.key)
}

export function joinConnectorSources<Item>(
    sources: readonly ConnectorSource<Item>[],
    options: ConnectorJoinOptions = {},
): ConnectorSource<Item> {
    if (sources.some(source => !isConnectorSource(source))) {
        throw new TypeError('connectors.join() received a value that is not a ConnectorSource.')
    }
    const { key, operation = 'auto' } = options
    if (!['auto', 'combine', 'overlay'].includes(operation)) {
        throw new Error(`Unsupported connector join operation: ${String(operation)}.`)
    }
    return createConnectorNode('join', { connectors: [...sources] }, { operation }, key)
}

export function pipeConnectorSource<Input, Output>(
    source: ConnectorSource<Input>,
    operator: ConnectorPipeOperator<Input, Output>,
): ConnectorSource<Output> {
    return source.pipe(operator)
}

function makeRecord<Item>(
    key: string,
    item: Item,
    from: ConnectorEndpoint,
    to: readonly ConnectorEndpoint[],
    options: Omit<ConnectorEdgeOptions<Item>, 'key' | 'item'>,
): ConnectorSourceRecord<Item> {
    return Object.freeze({
        key,
        item,
        from: freezeEndpoint(from),
        to: Object.freeze(to.map(freezeEndpoint)),
        directed: options.directed ?? true,
        ...(options.weight === undefined ? {} : { weight: options.weight }),
        ...(options.capacity === undefined ? {} : { capacity: options.capacity }),
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        metadata: Object.freeze({ ...(options.metadata ?? {}) }),
    })
}

function keyForItem<Item>(item: Item, index: number, keyBy?: ConnectorItemKey<Item>): string {
    let value: unknown
    if (typeof keyBy === 'function') value = keyBy(mappingContext(item, String(index), index))
    else if (keyBy !== undefined) value = (item as any)?.[keyBy as any]
    else value = item && typeof item === 'object' && 'id' in item
        ? (item as Record<string, unknown>).id
        : undefined
    if (value === undefined || value === null || value === '') {
        throw new TypeError('Connector collections require keyBy unless every item has a non-empty id.')
    }
    return normalizedKey(String(value), `item ${index}`)
}

function mappedEndpoint<Item>(
    mapping: ConnectorItemEndpoint<Item>,
    context: ConnectorMappingContext<Item>,
): ConnectorEndpoint {
    return typeof mapping === 'function' ? mapping(context) : mapping
}

function mappedValue<Item, Value>(
    mapping: Value | ((context: ConnectorMappingContext<Item>) => Value) | undefined,
    context: ConnectorMappingContext<Item>,
): Value | undefined {
    return typeof mapping === 'function'
        ? (mapping as (context: ConnectorMappingContext<Item>) => Value)(context)
        : mapping
}

function mappingContext<Item>(item: Item, key: string, index: number): ConnectorMappingContext<Item> {
    return Object.freeze({ item, key, index })
}

function normalizedKey(key: string, label: string): string {
    const normalized = String(key).trim()
    if (!normalized) throw new TypeError(`Connector ${label} key must not be empty.`)
    return normalized
}

function assertUniqueRecordKeys(records: readonly ConnectorSourceRecord[], label: string): void {
    const keys = new Set<string>()
    for (const record of records) {
        if (keys.has(record.key)) throw new Error(`${label} received duplicate key '${record.key}'.`)
        keys.add(record.key)
    }
}

function assertEndpoint(endpoint: ConnectorEndpoint, label: string): void {
    if (typeof endpoint === 'string') {
        if (!endpoint.trim()) throw new TypeError(`Connector ${label} endpoint must not be empty.`)
        return
    }
    if (!endpoint || typeof endpoint !== 'object') {
        throw new TypeError(`Connector ${label} endpoint is invalid.`)
    }
    if ('node' in endpoint) {
        if (!String(endpoint.node).trim()) throw new TypeError(`Connector ${label} node must not be empty.`)
        return
    }
    if ('position' in endpoint) return
    throw new TypeError(`Connector ${label} endpoint is invalid.`)
}

function freezeEndpoint(endpoint: ConnectorEndpoint): ConnectorEndpoint {
    if (typeof endpoint === 'string') return endpoint
    if ('node' in endpoint) {
        const port = endpoint.port && typeof endpoint.port === 'object'
            ? Object.freeze({ ...endpoint.port })
            : endpoint.port
        return Object.freeze({ node: endpoint.node, ...(port === undefined ? {} : { port }) })
    }
    const point = vectorTuple(endpoint.position)
    const space = endpoint.space && endpoint.space !== 'world'
        ? Object.freeze({ node: endpoint.space.node })
        : endpoint.space
    return Object.freeze({ position: point, ...(space === undefined ? {} : { space }) })
}

function vectorTuple(value: ConnectorVector3Like): readonly [number, number, number] {
    return Object.freeze([Number(value[0]), Number(value[1]), Number(value[2])])
}

function endpointSignature(endpoint: ConnectorEndpoint): string {
    if (typeof endpoint === 'string') return endpoint
    if ('node' in endpoint) return `${endpoint.node}:${valueSignature(endpoint.port, new WeakSet())}`
    return `${valueSignature(endpoint.position, new WeakSet())}@${valueSignature(endpoint.space, new WeakSet())}`
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
    if (isConnectorParameter(value)) {
        return `parameter:${value.name}:${valueSignature(value.fallback, visiting)}`
    }
    if (visiting.has(value)) return '[cycle]'
    visiting.add(value)
    try {
        if ((value as THREE.Vector2).isVector2) return `v2:${(value as THREE.Vector2).toArray().join(',')}`
        if ((value as THREE.Vector3).isVector3) return `v3:${(value as THREE.Vector3).toArray().join(',')}`
        if ((value as THREE.Vector4).isVector4) return `v4:${(value as THREE.Vector4).toArray().join(',')}`
        const tagged = value as Record<PropertyKey, unknown>
        if (tagged[CONNECTOR_GRAPH_NODE] === true) return connectorGraphSignature(value as ConnectorSource, visiting)
        if (tagged[GEOMETRY_GRAPH_NODE] === true) return `geometry:${genericGraphSignature(value as any, visiting)}`
        if (tagged[PARTICLE_GRAPH_NODE] === true) return `particles:${genericGraphSignature(value as any, visiting)}`
        const record = value as Record<string, unknown>
        return `{${Object.keys(record).sort().map(key => `${key}:${valueSignature(record[key], visiting)}`).join(',')}}`
    } finally {
        visiting.delete(value)
    }
}

function genericGraphSignature(source: any, visiting: WeakSet<object>): string {
    const inputs = Object.keys(source.inputs ?? {}).sort().map(name => {
        const input = source.inputs[name]
        if (Array.isArray(input)) return `${name}:[${input.map(item => genericGraphSignature(item, visiting)).join('|')}]`
        return `${name}:${input ? genericGraphSignature(input, visiting) : 'none'}`
    })
    return `${source.kind}${source.key ? `#${source.key}` : ''}(${valueSignature(source.parameters, visiting)})[${inputs.join(',')}]`
}

export function connectorGraphSignature(
    source: ConnectorSource<any>,
    visiting = new WeakSet<object>(),
): string {
    if (visiting.has(source)) throw new Error(`Cyclic connector graph detected at '${source.kind}'.`)
    visiting.add(source)
    try {
        const inputs = Object.keys(source.inputs).sort().map(name => {
            const input = source.inputs[name]
            if (Array.isArray(input)) {
                return `${name}:[${input.map(item => connectorGraphSignature(item, visiting)).join('|')}]`
            }
            return `${name}:${input ? connectorGraphSignature(input as ConnectorSource, visiting) : 'none'}`
        })
        return `${source.kind}${source.key ? `#${source.key}` : ''}(${valueSignature(source.parameters, visiting)})[${inputs.join(',')}]`
    } finally {
        visiting.delete(source)
    }
}

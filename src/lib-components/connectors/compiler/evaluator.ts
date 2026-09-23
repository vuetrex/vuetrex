import { resolveConnectorField } from '@/lib-components/connectors/fields.js'
import type { ConnectorSourceRecord } from '@/lib-components/connectors/graph.js'
import { connectorGraphSignature, isConnectorSource } from '@/lib-components/connectors/graph.js'
import type {
    ConnectorBundleOptions,
    ConnectorContext,
    ConnectorField,
    ConnectorFlowFactory,
    ConnectorNetworkFlowFactory,
    ConnectorGeometryFactory,
    ConnectorNetworkGeometryFactory,
    ConnectorMarkerOptions,
    ConnectorParameterValues,
    ConnectorProfileName,
    ConnectorRoutingOptions,
    ConnectorSource,
    ConnectorStrokeOptions,
} from '@/lib-components/connectors/types.js'
import type {
    AuthoredConnectorPlan,
    AuthoredConnectorRecord,
    ResolvedConnectorMarkerOptions,
    ResolvedConnectorFactoryLayer,
    ResolvedConnectorRoutingOptions,
    ResolvedConnectorStrokeOptions,
} from '@/lib-components/connectors/compiler/types.js'

interface CompileState {
    readonly profile?: ConnectorField<ConnectorProfileName, any>
    readonly routes: readonly ConnectorRoutingOptions<any>[]
    readonly bundle?: ConnectorBundleOptions<any>
    readonly strokes: readonly ConnectorStrokeOptions<any>[]
    readonly markers: readonly ConnectorMarkerOptions<any>[]
    readonly flows: readonly ResolvedConnectorFactoryLayer<ConnectorFlowFactory<any> | ConnectorNetworkFlowFactory<any>>[]
    readonly geometries: readonly ResolvedConnectorFactoryLayer<ConnectorGeometryFactory<any> | ConnectorNetworkGeometryFactory<any>>[]
    readonly visibility: readonly ConnectorField<boolean, any>[]
    readonly names: readonly ConnectorField<string, any>[]
    readonly scopes: readonly string[]
}

const emptyState: CompileState = Object.freeze({
    routes: Object.freeze([]),
    strokes: Object.freeze([]),
    markers: Object.freeze([]),
    flows: Object.freeze([]),
    geometries: Object.freeze([]),
    visibility: Object.freeze([]),
    names: Object.freeze([]),
    scopes: Object.freeze([]),
})

export function compileConnectors(
    source: ConnectorSource,
    parameters: ConnectorParameterValues = {},
): AuthoredConnectorPlan {
    if (!isConnectorSource(source)) throw new TypeError('compileConnectors() requires a ConnectorSource.')
    const records: AuthoredConnectorRecord[] = []
    const warnings: string[] = []
    const visiting = new WeakSet<ConnectorSource>()

    const visit = (node: ConnectorSource, state: CompileState): void => {
        if (visiting.has(node)) throw new Error(`Cyclic connector graph detected at '${node.kind}'.`)
        visiting.add(node)
        try {
            const input = node.inputs.connectors
            switch (node.kind) {
                case 'empty':
                    break
                case 'edge':
                case 'edges':
                case 'bus':
                case 'buses': {
                    const sourceRecords = (node.parameters as any).records as readonly ConnectorSourceRecord[]
                    const topology = node.kind === 'bus' || node.kind === 'buses' ? 'bus' : 'edge'
                    sourceRecords.forEach(sourceRecord => {
                        const scopedKey = state.scopes.length ? `${state.scopes.join('/')}/${sourceRecord.key}` : sourceRecord.key
                        records.push(resolveRecord(
                            scopedKey === sourceRecord.key ? sourceRecord : Object.freeze({ ...sourceRecord, key: scopedKey }),
                            topology,
                            records.length,
                            state,
                            parameters,
                        ))
                    })
                    break
                }
                case 'profile':
                    visitOne(input, { ...state, profile: state.profile ?? (node.parameters as any).profile })
                    break
                case 'route': {
                    visitOne(input, {
                        ...state,
                        routes: [...state.routes, node.parameters as ConnectorRoutingOptions],
                    })
                    break
                }
                case 'bundle':
                    visitOne(input, { ...state, bundle: state.bundle ?? node.parameters as ConnectorBundleOptions })
                    break
                case 'stroke':
                    visitOne(input, { ...state, strokes: [...state.strokes, node.parameters as ConnectorStrokeOptions] })
                    break
                case 'marker':
                    visitOne(input, { ...state, markers: [...state.markers, node.parameters as ConnectorMarkerOptions] })
                    break
                case 'flow':
                    visitOne(input, { ...state, flows: [...state.flows, Object.freeze({
                        key: (node.parameters as any).layerKey,
                        scope: (node.parameters as any).scope,
                        factory: (node.parameters as any).factory,
                    })] })
                    break
                case 'geometry':
                    visitOne(input, { ...state, geometries: [...state.geometries, Object.freeze({
                        key: (node.parameters as any).layerKey,
                        scope: (node.parameters as any).scope,
                        factory: (node.parameters as any).factory,
                    })] })
                    break
                case 'visible':
                    visitOne(input, { ...state, visibility: [...state.visibility, (node.parameters as any).visible] })
                    break
                case 'named':
                    visitOne(input, { ...state, names: [...state.names, (node.parameters as any).name] })
                    break
                case 'join': {
                    const start = records.length
                    visitMany(input, state)
                    const operation = (node.parameters as any).operation ?? 'auto'
                    if (operation !== 'combine') {
                        const joined = records.splice(start)
                        records.push(...mergeOverlayRecords(joined, operation === 'overlay'))
                    }
                    break
                }
                case 'module': {
                    const scope = (node.parameters as any).scope as string | undefined
                    visitOne(input, scope ? { ...state, scopes: [...state.scopes, scope] } : state)
                    break
                }
                default:
                    throw new Error(`Unsupported connector node kind '${node.kind}'.`)
            }
        } finally {
            visiting.delete(node)
        }
    }

    const visitOne = (input: unknown, state: CompileState): void => {
        if (!input || Array.isArray(input)) throw new Error('Connector operator requires exactly one connector input.')
        visit(input as ConnectorSource, state)
    }

    const visitMany = (input: unknown, state: CompileState): void => {
        if (!Array.isArray(input)) throw new Error('Connector join requires a connector input list.')
        input.forEach(item => visit(item, state))
    }

    visit(source, emptyState)
    const keys = new Set<string>()
    for (const record of records) {
        if (keys.has(record.key)) throw new Error(`Compiled connector graph contains duplicate key '${record.key}'.`)
        keys.add(record.key)
    }
    return Object.freeze({
        records: Object.freeze(records),
        warnings: Object.freeze([...new Set(warnings)]),
    })
}

function resolveRecord(
    source: ConnectorSourceRecord,
    topology: 'edge' | 'bus',
    index: number,
    state: CompileState,
    parameters: ConnectorParameterValues,
): AuthoredConnectorRecord {
    const context: ConnectorContext<any> = Object.freeze({
        key: source.key,
        index,
        item: source.item,
        from: source.from,
        to: source.to,
    })
    const profile = resolveConnectorField(state.profile, context, parameters) ?? 'ground'
    const routeOptions = mergeRouteLayers(state.routes)
    const routing = resolveRouting(profile, routeOptions, context, parameters)
    const strokes = resolveStrokeLayers(state.strokes, context, parameters, profile)
    const markers = resolveMarkerLayers(state.markers, context, parameters)
    const bundleValue = resolveConnectorField(state.bundle?.keyBy, context, parameters)
    const bundleKey = bundleValue === undefined || bundleValue === null || bundleValue === ''
        ? undefined
        : String(bundleValue)
    const visible = state.visibility.every(field => resolveConnectorField(field, context, parameters) ?? true)
    const names = [...state.names].reverse().map(field => String(resolveConnectorField(field, context, parameters) ?? ''))
        .filter(Boolean)

    const topologySignature = stableValue({
        key: source.key,
        topology,
        from: source.from,
        to: source.to,
        bundleKey,
    })
    const routeSignature = stableValue(routing)
    const decorationSignature = stableValue({
        strokes,
        markers,
        flow: state.flows,
        geometry: state.geometries,
        visible,
        names,
    })
    return Object.freeze({
        ...source,
        index,
        topology,
        profile,
        routing,
        routingExplicit: Object.freeze(Object.keys(routeOptions ?? {}).filter(field => field !== 'replace' && (routeOptions as any)[field] !== undefined)),
        ...(bundleKey === undefined ? {} : { bundleKey }),
        bundleWidth: resolveConnectorField(state.bundle?.width, context, parameters),
        bundleColor: resolveConnectorField(state.bundle?.color, context, parameters),
        strokes: Object.freeze(strokes),
        markers: Object.freeze(markers),
        flows: Object.freeze(resolveFactoryLayers(state.flows)),
        geometries: Object.freeze(resolveFactoryLayers(state.geometries)),
        visible,
        names: Object.freeze(names),
        topologySignature,
        routeSignature,
        decorationSignature,
    })
}

function mergeRouteLayers(layers: readonly ConnectorRoutingOptions<any>[]): ConnectorRoutingOptions<any> | undefined {
    if (!layers.length) return undefined
    let merged: ConnectorRoutingOptions<any> = {}
    for (const layer of [...layers].reverse()) {
        const { replace, ...values } = layer
        if (replace === true) merged = {}
        merged = { ...merged, ...values }
    }
    return merged
}

function resolveStrokeLayers(
    layers: readonly ConnectorStrokeOptions<any>[],
    context: ConnectorContext<any>,
    parameters: ConnectorParameterValues,
    profile: ConnectorProfileName,
): readonly ResolvedConnectorStrokeOptions[] {
    if (!layers.length) return Object.freeze([defaultStroke(profile)])
    const resolved = new Map<string, ConnectorStrokeOptions<any>>()
    for (const layer of [...layers].reverse()) {
        const key = layer.key?.trim() || 'shaft'
        const { key: _key, replace, ...values } = layer
        resolved.set(key, replace ? values : { ...(resolved.get(key) ?? {}), ...values })
    }
    return Object.freeze([...resolved].map(([key, values]) => resolveStroke(key, values, context, parameters)))
}

function resolveMarkerLayers(
    layers: readonly ConnectorMarkerOptions<any>[],
    context: ConnectorContext<any>,
    parameters: ConnectorParameterValues,
): readonly ResolvedConnectorMarkerOptions[] {
    const resolved = new Map<string, ConnectorMarkerOptions<any>>()
    for (const layer of [...layers].reverse()) {
        const key = layer.key?.trim() || 'markers'
        const { key: _key, replace, ...values } = layer
        resolved.set(key, replace ? values : { ...(resolved.get(key) ?? {}), ...values })
    }
    return Object.freeze([...resolved].map(([key, values]) => resolveMarker(key, values, context, parameters)))
}

function resolveFactoryLayers<Factory>(
    layers: readonly ResolvedConnectorFactoryLayer<Factory>[],
): readonly ResolvedConnectorFactoryLayer<Factory>[] {
    const keyed = new Map<string, ResolvedConnectorFactoryLayer<Factory>>()
    for (const layer of [...layers].reverse()) keyed.set(layer.key, layer)
    return [...keyed.values()]
}

function mergeOverlayRecords(
    input: readonly AuthoredConnectorRecord[],
    requireMatch: boolean,
): AuthoredConnectorRecord[] {
    const records = new Map<string, AuthoredConnectorRecord>()
    for (const next of input) {
        const current = records.get(next.key)
        if (!current) {
            records.set(next.key, next)
            continue
        }
        const sameRelationship = current.topologySignature === next.topologySignature
        if (!sameRelationship) {
            if (requireMatch) throw new Error(`Connector overlay key '${next.key}' refers to different relationships.`)
            throw new Error(`Compiled connector graph contains duplicate key '${next.key}'. Use explicit module scopes for independent relationships.`)
        }
        records.set(next.key, Object.freeze({
            ...current,
            ...mergeOverlayRouting(current, next),
            strokes: mergeStrokeLayers(current.strokes, next.strokes),
            markers: mergeResolvedLayers(current.markers, next.markers),
            flows: mergeResolvedLayers(current.flows, next.flows),
            geometries: mergeResolvedLayers(current.geometries, next.geometries),
            visible: current.visible && next.visible,
            names: Object.freeze([...new Set([...current.names, ...next.names])]),
            decorationSignature: stableValue([
                current.decorationSignature,
                next.decorationSignature,
            ]),
        }))
    }
    return [...records.values()]
}

function mergeResolvedLayers<Layer extends { readonly key: string }>(
    first: readonly Layer[],
    second: readonly Layer[],
): readonly Layer[] {
    const keyed = new Map<string, Layer>()
    first.forEach(layer => keyed.set(layer.key, layer))
    second.forEach(layer => keyed.set(layer.key, layer))
    return Object.freeze([...keyed.values()])
}

function mergeStrokeLayers(
    first: readonly ResolvedConnectorStrokeOptions[],
    second: readonly ResolvedConnectorStrokeOptions[],
): readonly ResolvedConnectorStrokeOptions[] {
    const keyed = new Map<string, ResolvedConnectorStrokeOptions>()
    first.forEach(layer => keyed.set(layer.key, layer))
    for (const layer of second) {
        const current = keyed.get(layer.key)
        if (!current || current.implicit) {
            keyed.set(layer.key, layer)
            continue
        }
        if (layer.implicit) continue
        const updates = Object.fromEntries(layer.explicit.map(field => [field, (layer as any)[field]]))
        keyed.set(layer.key, Object.freeze({
            ...current,
            ...updates,
            explicit: Object.freeze([...new Set([...current.explicit, ...layer.explicit])]),
            implicit: false,
        }))
    }
    return Object.freeze([...keyed.values()])
}

function mergeOverlayRouting(
    current: AuthoredConnectorRecord,
    next: AuthoredConnectorRecord,
): Pick<AuthoredConnectorRecord, 'routing' | 'routingExplicit' | 'routeSignature'> {
    if (!next.routingExplicit.length) return {
        routing: current.routing,
        routingExplicit: current.routingExplicit,
        routeSignature: current.routeSignature,
    }
    const updates = Object.fromEntries(next.routingExplicit.map(field => [field, (next.routing as any)[field]]))
    const routing = Object.freeze({ ...current.routing, ...updates })
    return {
        routing,
        routingExplicit: Object.freeze([...new Set([...current.routingExplicit, ...next.routingExplicit])]),
        routeSignature: stableValue(routing),
    }
}

function resolveRouting(
    profile: ConnectorProfileName,
    options: ConnectorRoutingOptions<any> | undefined,
    context: ConnectorContext<any>,
    parameters: ConnectorParameterValues,
): ResolvedConnectorRoutingOptions {
    const defaults = profile === 'air'
        ? { strategy: 'bezier', surface: 'air', elevation: 0.35, lane: 'auto', obstacles: 'none' } as const
        : { strategy: 'orthogonal', surface: 'ground', elevation: 0, lane: 'auto', obstacles: 'stage-nodes' } as const
    const strategy = resolveConnectorField(options?.strategy, context, parameters) ?? defaults.strategy
    const clearance = resolveConnectorField(options?.clearance, context, parameters)
    const obstacleSource = options?.obstacles ?? defaults.obstacles
    const obstacles = obstacleSource === 'none' || obstacleSource === 'stage-nodes'
        ? obstacleSource
        : resolveConnectorField(obstacleSource, context, parameters) ?? []
    const rawWaypoints = resolveConnectorField(options?.waypoints, context, parameters) ?? []
    return Object.freeze({
        strategy,
        surface: resolveConnectorField(options?.surface, context, parameters) ?? defaults.surface,
        fromPort: resolveConnectorField(options?.fromPort, context, parameters) ?? 'auto',
        toPort: resolveConnectorField(options?.toPort, context, parameters) ?? 'auto',
        ...(clearance === undefined ? {} : { clearance: Math.max(0, finite(clearance, 0)) }),
        elevation: Math.max(0, finite(resolveConnectorField(options?.elevation, context, parameters), defaults.elevation)),
        lane: resolveConnectorField(options?.lane, context, parameters) ?? defaults.lane,
        waypoints: Object.freeze([...rawWaypoints]),
        obstacles: Array.isArray(obstacles) ? Object.freeze([...obstacles]) : obstacles,
    })
}

function resolveStroke(
    key: string,
    options: ConnectorStrokeOptions<any>,
    context: ConnectorContext<any>,
    parameters: ConnectorParameterValues,
): ResolvedConnectorStrokeOptions {
    const dash = resolveConnectorField(options.dash, context, parameters) ?? false
    return Object.freeze({
        key,
        explicit: Object.freeze(Object.keys(options).filter(field => !['key', 'replace'].includes(field) && (options as any)[field] !== undefined)),
        implicit: false,
        color: resolveConnectorField(options.color, context, parameters),
        width: resolveConnectorField(options.width, context, parameters),
        opacity: clamp(resolveConnectorField(options.opacity, context, parameters) ?? 1, 0, 1),
        dash: dash === false ? false : Object.freeze([
            Math.max(0.000001, finite(dash[0], 0.08)),
            Math.max(0, finite(dash[1], 0.04)),
        ]) as readonly [number, number],
        offset: finite(resolveConnectorField(options.offset, context, parameters), 0),
        markerStart: resolveConnectorField(options.markerStart, context, parameters) ?? false,
        markerEnd: resolveConnectorField(options.markerEnd, context, parameters) ?? 'arrow',
        depthTest: resolveConnectorField(options.depthTest, context, parameters) ?? true,
    })
}

function defaultStroke(profile: ConnectorProfileName): ResolvedConnectorStrokeOptions {
    return Object.freeze({
        key: 'shaft',
        explicit: Object.freeze([]),
        implicit: true,
        width: profile === 'air' ? 0.014 : 0.012,
        opacity: profile === 'air' ? 0.95 : 0.78,
        dash: false,
        offset: 0,
        markerStart: false,
        markerEnd: 'arrow',
        depthTest: true,
    })
}

function resolveMarker(
    key: string,
    options: ConnectorMarkerOptions<any>,
    context: ConnectorContext<any>,
    parameters: ConnectorParameterValues,
): ResolvedConnectorMarkerOptions {
    return Object.freeze({
        key,
        explicit: Object.freeze(Object.keys(options).filter(field => !['key', 'replace'].includes(field) && (options as any)[field] !== undefined)),
        start: options.start,
        end: options.end,
        junction: options.junction,
        repeat: options.repeat,
        scale: Math.max(0, finite(resolveConnectorField(options.scale, context, parameters), 1)),
        color: resolveConnectorField(options.color, context, parameters),
        inset: Math.max(0, finite(resolveConnectorField(options.inset, context, parameters), 0)),
        align: options.align ?? 'tangent',
    })
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

const functionIds = new WeakMap<Function, number>()
let functionSequence = 0

export function stableValue(value: unknown, visiting = new WeakSet<object>()): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (typeof value === 'function') {
        let id = functionIds.get(value)
        if (!id) {
            id = ++functionSequence
            functionIds.set(value, id)
        }
        return `function:${value.name || 'anonymous'}:${id}`
    }
    if (Array.isArray(value)) return `[${value.map(item => stableValue(item, visiting)).join(',')}]`
    if (typeof value !== 'object') return String(value)
    if (isConnectorSource(value)) return connectorGraphSignature(value)
    if (visiting.has(value)) return '[cycle]'
    visiting.add(value)
    try {
        const vector = value as { isVector3?: boolean, toArray?: () => number[] }
        if (vector.isVector3 && vector.toArray) return `v3:${vector.toArray().join(',')}`
        const record = value as Record<string, unknown>
        return `{${Object.keys(record).sort().map(key => `${key}:${stableValue(record[key], visiting)}`).join(',')}}`
    } finally {
        visiting.delete(value)
    }
}

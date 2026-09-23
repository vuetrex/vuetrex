import { edge } from './graph.js'
import { compileConnectors, stableValue } from './compiler/evaluator.js'
import type { AuthoredConnectorPlan } from './compiler/types.js'
import type { ConnectorSource } from './types.js'

export type * from './template-api.js'
import type { ConnectorPresentation, ConnectorAppearances, ConnectorEdgeDeclarationRecord } from './template-api.js'

export const presentationKeys = ['appearance', 'routeStrategy', 'clearance', 'elevation', 'strokeColor', 'strokeWidth', 'strokeOpacity', 'markerStart', 'markerEnd'] as const
export function mergePresentation(...layers: (ConnectorPresentation | undefined)[]): ConnectorPresentation {
    return Object.assign({}, ...layers.filter(Boolean).map(layer => Object.fromEntries(
        Object.entries(layer!).filter(([key, value]) => presentationKeys.includes(key as typeof presentationKeys[number]) && value !== undefined && value !== null))))
}
export function namedPresentation(styles: ConnectorAppearances, name?: string): ConnectorPresentation | undefined {
    if (!name) return undefined
    if (!Object.hasOwn(styles, name)) throw new Error(`Unknown Vuetrex connector appearance: ${name}`)
    return styles[name]
}
export function lowerEdge(record: ConnectorEdgeDeclarationRecord, ownerId?: string): ConnectorSource {
    if (!record.key) throw new Error('vx-edge requires a stable Vue key.')
    if (ownerId && record.from !== undefined && record.from !== ownerId) throw new Error('Local vx-edge from must equal its direct spatial parent ID.')
    const from = ownerId ?? record.from
    if (!from || !record.to) throw new Error('vx-edge requires from and to (local edges inherit from their explicit parent ID).')
    const endpoint = (node: string, port?: string) => port ? { node, port: { name: port } } : node
    return edge(endpoint(from, record.fromPort), endpoint(record.to, record.toPort), { key: record.key })
}
/** Apply template defaults only to fields not explicitly authored by the graph. */
export function presentPlan(plan: AuthoredConnectorPlan, style: ConnectorPresentation): AuthoredConnectorPlan {
    const route = Object.fromEntries(Object.entries({ strategy: style.routeStrategy, clearance: style.clearance, elevation: style.elevation }).filter(([, v]) => v !== undefined))
    const stroke = Object.fromEntries(Object.entries({ color: style.strokeColor, width: style.strokeWidth, opacity: style.strokeOpacity, markerStart: style.markerStart, markerEnd: style.markerEnd }).filter(([, v]) => v !== undefined))
    if (!Object.keys(route).length && !Object.keys(stroke).length) return plan
    return Object.freeze({ ...plan, records: Object.freeze(plan.records.map(record => {
        const routing = Object.freeze({ ...record.routing, ...Object.fromEntries(Object.entries(route).filter(([key]) => !record.routingExplicit.includes(key))) })
        const strokes = Object.freeze(record.strokes.map(layer => Object.freeze({ ...layer,
            ...Object.fromEntries(Object.entries(stroke).filter(([key]) => !layer.explicit.includes(key))) })))
        return Object.freeze({ ...record, routing, strokes, routeSignature: stableValue(routing),
            decorationSignature: stableValue([record.decorationSignature, strokes]) })
    })) })
}
export function compileEdge(record: ConnectorEdgeDeclarationRecord, ownerId?: string, defaults: ConnectorPresentation = {}): AuthoredConnectorPlan {
    return presentPlan(compileConnectors(lowerEdge(record, ownerId)), mergePresentation(defaults, record))
}

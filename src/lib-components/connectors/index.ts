import { connectorField } from '@/lib-components/connectors/fields.js'
import {
    bus,
    buses,
    bundleConnectorSource,
    edge,
    edges,
    empty,
    flowConnectorSource,
    geometryConnectorSource,
    joinConnectorSources,
    markerConnectorSource,
    namedConnectorSource,
    pipeConnectorSource,
    profileConnectorSource,
    routeConnectorSource,
    strokeConnectorSource,
    visibleConnectorSource,
} from '@/lib-components/connectors/graph.js'
import { connectorParameter } from '@/lib-components/connectors/parameters.js'

/** Functional connector constructors and operators. Every returned source is also fluent. */
export const connectors = Object.freeze({
    edge,
    edges,
    empty,
    bus,
    buses,
    profile: profileConnectorSource,
    route: routeConnectorSource,
    bundle: bundleConnectorSource,
    stroke: strokeConnectorSource,
    marker: markerConnectorSource,
    flow: flowConnectorSource,
    geometry: geometryConnectorSource,
    visible: visibleConnectorSource,
    named: namedConnectorSource,
    join: joinConnectorSources,
    pipe: pipeConnectorSource,
    field: connectorField,
    param: connectorParameter,
})

export { compileConnectors } from '@/lib-components/connectors/compiler/evaluator.js'
export type {
    AuthoredConnectorPlan,
    AuthoredConnectorRecord,
    ConnectorDecorationRecord,
    ConnectorFlowRecord,
    ConnectorGeometryRecord,
    ConnectorRouteRun,
    ConnectorRouteJunction,
    ConnectorTerminalTraversal,
    ResolvedConnectorEndpoint,
    ResolvedConnectorMarkerOptions,
    ResolvedConnectorNetwork,
    ResolvedConnectorRoutingOptions,
    ResolvedConnectorStrokeOptions,
} from '@/lib-components/connectors/compiler/types.js'
export { registerConnectorAppearance } from '@/lib-components/connectors/appearance.js'
export {
    connectorStrategy,
    registerConnectorStrategy,
} from '@/lib-components/connectors/strategies/index.js'
export {
    connectorGraphSignature,
    createConnectorNode,
    isConnectorSource,
} from '@/lib-components/connectors/graph.js'
export {
    connectorField,
    resolveConnectorField,
} from '@/lib-components/connectors/fields.js'
export {
    connectorParameter,
    isConnectorParameter,
    resolveConnectorParameter,
} from '@/lib-components/connectors/parameters.js'
export {
    defineConnectors,
    defineConnectorOutputs,
} from '@/lib-components/connectors/modules.js'
export {
    describeConnectorGraph,
    connectorGraphToDot,
    inspectConnectors,
} from '@/lib-components/connectors/diagnostics.js'
export type * from '@/lib-components/connectors/types.js'

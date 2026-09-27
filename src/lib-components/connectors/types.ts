import type * as THREE from 'three'
import type { GeometrySource } from '@/lib-components/geometry/types.js'
import type { ParticleSource } from '@/lib-components/particles/types.js'
import {
    GRAPH_PARAMETER,
    type GraphFieldContext,
    type GraphParameter,
    type GraphParameterValues,
} from '@/lib-components/graph/parameters.js'

export const CONNECTOR_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/connector-node')
export const CONNECTOR_PARAMETER = GRAPH_PARAMETER

export type ConnectorVector3Tuple = readonly [number, number, number]
/** Public spatial values are immutable tuples. Three.js vectors are compiler/runtime-only. */
export type ConnectorVector3Like = ConnectorVector3Tuple

export type ConnectorPortName = 'auto' | 'center' | 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

/** Normalized coordinates within an endpoint's current world bounds. */
export interface ConnectorPortCoordinates {
    x?: number
    y?: number
    z?: number
}

export type ConnectorPort =
    | ConnectorPortName
    | ConnectorPortCoordinates
    | Readonly<{ name: string }>

export type ConnectorEndpoint =
    | string
    | Readonly<{ node: string; port?: ConnectorPort }>
    | Readonly<{
        position: ConnectorVector3Like
        space?: 'world' | Readonly<{ node: string }>
    }>

export interface ConnectorPortDefinition {
    readonly position: ConnectorVector3Like
    readonly normal: ConnectorVector3Like
}

export type ConnectorParameter<Value = unknown> = GraphParameter<Value>

export type ConnectorParameterValues = GraphParameterValues

export interface ConnectorContext<Item = unknown> extends GraphFieldContext<Item> {
    readonly from: ConnectorEndpoint
    readonly to: readonly ConnectorEndpoint[]
}

export type ConnectorField<Value, Item = unknown> =
    | Value
    | ConnectorParameter<Value>
    | ((context: ConnectorContext<Item>) => Value | ConnectorParameter<Value>)

export type ConnectorStrategyName = 'direct' | 'orthogonal' | 'bezier' | 'spline' | 'manual' | (string & {})
export type ConnectorRoutingSurfaceName = 'ground' | 'air' | (string & {})
export type ConnectorProfileName = 'ground' | 'air' | (string & {})
export type ConnectorLane = number | 'auto'

export interface ConnectorWaypoint {
    readonly position: ConnectorVector3Like
    readonly space?: 'world' | Readonly<{ node: string }>
}

export type ConnectorObstacleRef =
    | string
    | Readonly<{ node: string; clearance?: number }>
    | Readonly<{ min: ConnectorVector3Like; max: ConnectorVector3Like }>

export type ConnectorObstacleSource<Item = unknown> =
    | 'none'
    | 'stage-nodes'
    | ConnectorField<readonly ConnectorObstacleRef[], Item>

export interface ConnectorRoutingOptions<Item = unknown> {
    strategy?: ConnectorField<ConnectorStrategyName, Item>
    surface?: ConnectorField<ConnectorRoutingSurfaceName, Item>
    fromPort?: ConnectorField<ConnectorPort, Item>
    toPort?: ConnectorField<ConnectorPort, Item>
    clearance?: ConnectorField<number, Item>
    elevation?: ConnectorField<number, Item>
    lane?: ConnectorField<ConnectorLane, Item>
    waypoints?: ConnectorField<readonly (ConnectorWaypoint | ConnectorVector3Like)[], Item>
    obstacles?: ConnectorObstacleSource<Item>
    /** Reset inherited routing before applying this layer. */
    replace?: boolean
}

export interface ConnectorStrategyEndpoint {
    readonly point: ConnectorVector3Tuple
    readonly normal: ConnectorVector3Tuple
    readonly bounds?: Readonly<{ min: ConnectorVector3Tuple; max: ConnectorVector3Tuple }>
}

export interface ConnectorStrategyContext {
    readonly from: ConnectorStrategyEndpoint
    readonly to: ConnectorStrategyEndpoint
    readonly clearance: number
    readonly laneDistance: number
    readonly elevation: number
    readonly waypoints: readonly ConnectorVector3Tuple[]
    readonly obstacles: readonly Readonly<{ min: ConnectorVector3Tuple; max: ConnectorVector3Tuple }>[]
    readonly scale: number
}

export interface ConnectorStrategyResult {
    readonly points: readonly ConnectorVector3Tuple[]
}

export interface ConnectorStrategy {
    resolve(context: ConnectorStrategyContext): ConnectorStrategyResult
}

export type BuiltinConnectorMarker = 'arrow' | 'dot' | 'diamond' | 'none'

export interface ConnectorStrokeOptions<Item = unknown> {
    /** Stable presentation-layer identity. Defaults to `shaft`. */
    key?: string
    /** Replace the layer instead of merging with an inherited layer of the same key. */
    replace?: boolean
    color?: ConnectorField<THREE.ColorRepresentation, Item>
    width?: ConnectorField<number, Item>
    opacity?: ConnectorField<number, Item>
    dash?: ConnectorField<readonly [length: number, gap: number] | false, Item>
    offset?: ConnectorField<number, Item>
    markerStart?: ConnectorField<BuiltinConnectorMarker | false, Item>
    markerEnd?: ConnectorField<BuiltinConnectorMarker | false, Item>
    depthTest?: ConnectorField<boolean, Item>
    /** Image-effect membership for this realized stroke; it never changes routing. */
    effects?: import('../scene/composer.js').VxNodeEffects
}

export interface ConnectorMarkerOptions<Item = unknown> {
    /** Stable presentation-layer identity. Defaults to `markers`. */
    key?: string
    replace?: boolean
    start?: GeometrySource | false
    end?: GeometrySource | false
    junction?: GeometrySource | false
    repeat?: GeometrySource | false
    scale?: ConnectorField<number, Item>
    color?: ConnectorField<THREE.ColorRepresentation, Item>
    inset?: ConnectorField<number, Item>
    align?: 'tangent' | 'none'
}

export interface ConnectorBundleOptions<Item = unknown> {
    keyBy?: ConnectorField<string | number | undefined, Item>
    width?: ConnectorField<number, Item>
    color?: ConnectorField<THREE.ColorRepresentation, Item>
}

export interface ConnectorNodeOptions {
    key?: string
}

export interface ConnectorEdgeOptions<Item = unknown> extends ConnectorNodeOptions {
    item?: Item
    directed?: boolean
    weight?: number
    capacity?: number
    kind?: string
    metadata?: Readonly<Record<string, unknown>>
}

export type ConnectorMappingContext<Item> = GraphFieldContext<Item>
export type ConnectorItemKey<Item> = keyof Item | string | ((context: ConnectorMappingContext<Item>) => string | number)
export type ConnectorItemEndpoint<Item> = ConnectorEndpoint | ((context: ConnectorMappingContext<Item>) => ConnectorEndpoint)

export interface ConnectorEdgesMapping<Item> {
    keyBy?: ConnectorItemKey<Item>
    from: ConnectorItemEndpoint<Item>
    to: ConnectorItemEndpoint<Item>
    directed?: boolean | ((context: ConnectorMappingContext<Item>) => boolean)
    weight?: number | ((context: ConnectorMappingContext<Item>) => number)
    capacity?: number | ((context: ConnectorMappingContext<Item>) => number)
    kind?: string | ((context: ConnectorMappingContext<Item>) => string)
    metadata?: Readonly<Record<string, unknown>> | ((context: ConnectorMappingContext<Item>) => Readonly<Record<string, unknown>>)
}

export interface ConnectorBusesMapping<Item> extends Omit<ConnectorEdgesMapping<Item>, 'to'> {
    to: readonly ConnectorEndpoint[] | ((context: ConnectorMappingContext<Item>) => readonly ConnectorEndpoint[])
}

export interface ConnectorJoinOptions extends ConnectorNodeOptions {
    operation?: 'auto' | 'combine' | 'overlay'
}

export interface ResolvedConnectorRunContext {
    readonly key: string
    readonly role: 'route' | 'source' | 'trunk' | 'branch'
    readonly memberKeys: readonly string[]
    readonly points: readonly ConnectorVector3Tuple[]
    readonly fromJunctionKey: string
    readonly toJunctionKey: string
}

export interface ResolvedConnectorJunctionContext {
    readonly key: string
    readonly kind: 'terminal' | 'junction'
    readonly point: ConnectorVector3Tuple
    readonly memberKeys: readonly string[]
}

export interface ResolvedConnectorTraversalContext<Item = unknown> extends GraphFieldContext<Item> {
    readonly scope: 'traversal'
    readonly ownerId: string
    readonly networkKey: string
    readonly memberKey: string
    readonly targetIndex: number
    readonly topology: 'edge' | 'bus'
    readonly from: ConnectorEndpoint
    readonly to: ConnectorEndpoint
    readonly runKeys: readonly string[]
    readonly points: readonly ConnectorVector3Tuple[]
    readonly cumulativeLengths: readonly number[]
    readonly totalLength: number
    readonly scale: number
    readonly sourceName?: string
}

export interface ResolvedConnectorNetworkContext<Item = unknown> extends GraphFieldContext<Item> {
    readonly scope: 'network'
    readonly ownerId: string
    readonly topology: 'edge' | 'bus' | 'bundle'
    readonly memberKeys: readonly string[]
    readonly items: readonly Item[]
    readonly runs: readonly ResolvedConnectorRunContext[]
    readonly junctions: readonly ResolvedConnectorJunctionContext[]
    readonly traversals: readonly ResolvedConnectorTraversalContext<Item>[]
    readonly totalLength: number
    readonly scale: number
    readonly sourceName?: string
}

export interface ConnectorFactoryOptions extends ConnectorNodeOptions {
    scope?: 'traversal' | 'network'
}

export type ConnectorFlowFactory<Item = unknown> = (
    route: ResolvedConnectorTraversalContext<Item>,
) => ParticleSource<Item>

export type ConnectorNetworkFlowFactory<Item = unknown> = (
    network: ResolvedConnectorNetworkContext<Item>,
) => ParticleSource<Item>

export type ConnectorGeometryFactory<Item = unknown> = (
    route: ResolvedConnectorTraversalContext<Item>,
) => GeometrySource<Item>

export type ConnectorNetworkGeometryFactory<Item = unknown> = (
    network: ResolvedConnectorNetworkContext<Item>,
) => GeometrySource<Item>

export type ConnectorPipeOperator<Input = unknown, Output = Input> = (
    source: ConnectorSource<Input>,
) => ConnectorSource<Output>

/** Immutable fluent operations shared by every authored connector source. */
export interface ConnectorChain<Item = unknown> {
    profile(profile: ConnectorField<ConnectorProfileName, Item>): ConnectorSource<Item>
    route(options?: ConnectorRoutingOptions<Item>): ConnectorSource<Item>
    bundle(options?: ConnectorBundleOptions<Item>): ConnectorSource<Item>
    stroke(options?: ConnectorStrokeOptions<Item>): ConnectorSource<Item>
    marker(options: ConnectorMarkerOptions<Item>): ConnectorSource<Item>
    flow(factory: ConnectorFlowFactory<Item>, options?: ConnectorFactoryOptions & { scope?: 'traversal' }): ConnectorSource<Item>
    flow(factory: ConnectorNetworkFlowFactory<Item>, options: ConnectorFactoryOptions & { scope: 'network' }): ConnectorSource<Item>
    geometry(factory: ConnectorGeometryFactory<Item>, options?: ConnectorFactoryOptions & { scope?: 'traversal' }): ConnectorSource<Item>
    geometry(factory: ConnectorNetworkGeometryFactory<Item>, options: ConnectorFactoryOptions & { scope: 'network' }): ConnectorSource<Item>
    visible(visible: ConnectorField<boolean, Item>): ConnectorSource<Item>
    named(name: ConnectorField<string, Item>, options?: ConnectorNodeOptions): ConnectorSource<Item>
    join(
        source: ConnectorSource<Item> | readonly ConnectorSource<Item>[],
        options?: ConnectorJoinOptions,
    ): ConnectorSource<Item>
    overlay(source: ConnectorSource<Item> | readonly ConnectorSource<Item>[], options?: ConnectorNodeOptions): ConnectorSource<Item>
    pipe<Output = Item>(operator: ConnectorPipeOperator<Item, Output>): ConnectorSource<Output>
}

export type ConnectorInput = ConnectorSource<any> | readonly ConnectorSource<any>[] | undefined

export interface ConnectorGraphNode<Parameters extends object = Record<string, unknown>, Item = unknown>
    extends ConnectorChain<Item> {
    readonly [CONNECTOR_GRAPH_NODE]: true
    readonly kind: string
    readonly key?: string
    readonly inputs: Readonly<Record<string, ConnectorInput>>
    readonly parameters: Readonly<Parameters>
    readonly __connectorItem?: Item
}

export type ConnectorSource<Item = unknown> = ConnectorGraphNode<object, Item>

export interface ConnectorFactory<Parameters, Item = unknown> {
    (parameters: Readonly<Parameters>, options?: ConnectorModuleInstanceOptions): ConnectorSource<Item>
    readonly connectorModuleName: string
}

export type ConnectorOutputMap = Record<string, ConnectorSource<any>>
export type ConnectorOutputs<Outputs extends ConnectorOutputMap> = Readonly<Outputs> & {
    output<Name extends keyof Outputs>(name: Name): Outputs[Name]
}

export interface ConnectorOutputsFactory<Parameters, Outputs extends ConnectorOutputMap> {
    (parameters: Readonly<Parameters>, options?: ConnectorModuleInstanceOptions): ConnectorOutputs<Outputs>
    readonly connectorModuleName: string
}

export interface ConnectorModuleInstanceOptions {
    /** Explicit namespace for semantic keys emitted by this reusable instance. */
    scope?: string
}

export type ConnectorHit<Item = unknown> = ConnectorEdgeHit<Item> | ConnectorBundleHit

export interface ConnectorEdgeHit<Item = unknown> {
    readonly handle?: import('./declarations.js').ConnectorHandle
    readonly kind: 'edge'
    readonly key: string
    readonly item: Item
    readonly part: 'stroke' | 'marker-start' | 'marker-end' | 'junction' | 'particle' | 'geometry'
    readonly point: ConnectorVector3Tuple
    readonly pathPosition?: number
    readonly sourceName?: string
}

export interface ConnectorBundleHit {
    readonly handle?: import('./declarations.js').ConnectorHandle
    readonly kind: 'bundle'
    readonly key: string
    readonly part: 'bundle'
    readonly memberKeys: readonly string[]
    readonly point: ConnectorVector3Tuple
    readonly pathPosition?: number
    readonly sourceName?: string
}

export interface ConnectorAppearanceRecord {
    readonly id: string
    readonly ownerId: string
    readonly key: string
    readonly sourceName?: string
    readonly interactive: boolean
    readonly signature: string
}

/** Stage-owned realization backend. Route resolution always happens before this boundary. */
export interface ConnectorAppearanceBackend<Record extends ConnectorAppearanceRecord = ConnectorAppearanceRecord> {
    reconcile(records: readonly Record[]): void
    update?(timeSeconds: number, deltaSeconds: number): void
    hitAt?(object: THREE.Object3D, instanceId?: number, intersection?: THREE.Intersection): ConnectorHit | undefined
    dispose(): void
}

export type ConnectorAppearanceBackendFactory = (
    stage: object,
) => ConnectorAppearanceBackend

export interface ConnectorGraphNodeDescription {
    readonly kind: string
    readonly key?: string
    readonly inputs: readonly ConnectorGraphNodeDescription[]
}

export interface ConnectorGraphDescription {
    readonly nodeCount: number
    readonly kinds: Readonly<Record<string, number>>
    readonly root: ConnectorGraphNodeDescription
}

export interface ConnectorInspection {
    readonly graph: ConnectorGraphDescription
    readonly recordCount: number
    readonly edgeCount: number
    readonly busCount: number
    readonly names: readonly string[]
    readonly warnings: readonly string[]
}

export interface ConnectorRuntimeDiagnostics {
    readonly ownerCount: number
    readonly authoredCount: number
    readonly resolvedCount: number
    readonly unresolvedCount: number
    readonly edgeCount: number
    readonly busCount: number
    readonly bundledCount: number
    readonly segmentCount: number
    readonly pointCount: number
    readonly strokeCount: number
    readonly particleEmitterCount: number
    readonly geometryRecordCount: number
    readonly routeBuildCount: number
    readonly decorationUpdateCount: number
    readonly particleProgramBuildCount: number
    readonly geometryEvaluationCount: number
    readonly owners: readonly Readonly<{
        scope: string
        unresolved: readonly Readonly<{ key: string; reasons: readonly string[] }>[]
        name?: string
        recordKeys: readonly string[]
        unresolvedKeys: readonly string[]
    }>[]
}

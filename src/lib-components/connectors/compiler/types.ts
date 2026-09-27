import type * as THREE from 'three'
import type { GeometrySource } from '@/lib-components/geometry/types.js'
import type { ParticleSource } from '@/lib-components/particles/types.js'
import type {
    BuiltinConnectorMarker,
    ConnectorEndpoint,
    ConnectorFlowFactory,
    ConnectorNetworkFlowFactory,
    ConnectorGeometryFactory,
    ConnectorNetworkGeometryFactory,
    ConnectorLane,
    ConnectorMarkerOptions,
    ConnectorObstacleRef,
    ConnectorPort,
    ConnectorProfileName,
    ConnectorRoutingSurfaceName,
    ConnectorStrategyName,
    ConnectorVector3Like,
    ConnectorWaypoint,
    ConnectorEdgeHit,
} from '@/lib-components/connectors/types.js'

export interface ResolvedConnectorRoutingOptions {
    readonly strategy: ConnectorStrategyName
    readonly surface: ConnectorRoutingSurfaceName
    readonly fromPort: ConnectorPort
    readonly toPort: ConnectorPort
    readonly clearance?: number
    readonly elevation: number
    readonly lane: ConnectorLane
    readonly waypoints: readonly (ConnectorWaypoint | ConnectorVector3Like)[]
    readonly obstacles: 'none' | 'stage-nodes' | readonly ConnectorObstacleRef[]
}

export interface ResolvedConnectorStrokeOptions {
    readonly key: string
    readonly explicit: readonly string[]
    readonly implicit: boolean
    readonly color?: THREE.ColorRepresentation
    readonly width?: number
    readonly opacity: number
    readonly dash: readonly [length: number, gap: number] | false
    readonly offset: number
    readonly markerStart: BuiltinConnectorMarker | false
    readonly markerEnd: BuiltinConnectorMarker | false
    readonly depthTest: boolean
    readonly effects?: import('../../scene/composer.js').VxNodeEffects
}

export interface ResolvedConnectorMarkerOptions {
    readonly key: string
    readonly explicit: readonly string[]
    readonly start?: GeometrySource | false
    readonly end?: GeometrySource | false
    readonly junction?: GeometrySource | false
    readonly repeat?: GeometrySource | false
    readonly scale: number
    readonly color?: THREE.ColorRepresentation
    readonly inset: number
    readonly align: 'tangent' | 'none'
}

export interface ResolvedConnectorFactoryLayer<Factory> {
    readonly key: string
    readonly scope: 'traversal' | 'network'
    readonly factory: Factory
}

export interface AuthoredConnectorRecord<Item = unknown> {
    readonly key: string
    readonly index: number
    readonly item: Item
    readonly topology: 'edge' | 'bus'
    readonly from: ConnectorEndpoint
    readonly to: readonly ConnectorEndpoint[]
    readonly directed: boolean
    readonly weight?: number
    readonly capacity?: number
    readonly kind?: string
    readonly metadata: Readonly<Record<string, unknown>>
    readonly profile: ConnectorProfileName
    readonly routing: ResolvedConnectorRoutingOptions
    readonly routingExplicit: readonly string[]
    readonly bundleKey?: string
    readonly bundleWidth?: number
    readonly bundleColor?: THREE.ColorRepresentation
    readonly strokes: readonly ResolvedConnectorStrokeOptions[]
    readonly markers: readonly ResolvedConnectorMarkerOptions[]
    readonly flows: readonly ResolvedConnectorFactoryLayer<ConnectorFlowFactory<Item> | ConnectorNetworkFlowFactory<Item>>[]
    readonly geometries: readonly ResolvedConnectorFactoryLayer<ConnectorGeometryFactory<Item> | ConnectorNetworkGeometryFactory<Item>>[]
    readonly visible: boolean
    readonly names: readonly string[]
    readonly topologySignature: string
    readonly routeSignature: string
    readonly decorationSignature: string
}

export interface AuthoredConnectorPlan {
    readonly records: readonly AuthoredConnectorRecord[]
    readonly warnings: readonly string[]
}

export interface ResolvedConnectorEndpoint {
    readonly reference: ConnectorEndpoint
    readonly point: THREE.Vector3
    readonly normal: THREE.Vector3
    readonly bounds?: THREE.Box3
    readonly nodeId?: string
    readonly revision: string
}

export interface ConnectorRuntimeStrategyContext {
    readonly from: ResolvedConnectorEndpoint
    readonly to: ResolvedConnectorEndpoint
    readonly clearance: number
    readonly laneDistance: number
    readonly elevation: number
    readonly waypoints: readonly THREE.Vector3[]
    readonly obstacles: readonly THREE.Box3[]
    readonly scale: number
}

export interface ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext): { readonly points: readonly THREE.Vector3[] }
}

export interface ConnectorRouteRun {
    readonly key: string
    readonly role: 'route' | 'source' | 'trunk' | 'branch'
    readonly memberKeys: readonly string[]
    readonly points: readonly THREE.Vector3[]
    readonly fromJunctionKey: string
    readonly toJunctionKey: string
}

export interface ConnectorRouteJunction {
    readonly key: string
    readonly kind: 'terminal' | 'junction'
    readonly point: THREE.Vector3
    readonly memberKeys: readonly string[]
}

export interface ConnectorTerminalTraversal<Item = unknown> {
    readonly key: string
    readonly memberKey: string
    readonly index: number
    readonly item: Item
    readonly targetIndex: number
    readonly runKeys: readonly string[]
    readonly points: readonly THREE.Vector3[]
    readonly cumulativeLengths: readonly number[]
    readonly totalLength: number
}

export interface ResolvedConnectorNetwork<Item = unknown> {
    readonly ownerId: string
    readonly key: string
    readonly item: Item
    readonly items: readonly Item[]
    readonly topology: 'edge' | 'bus' | 'bundle'
    readonly memberKeys: readonly string[]
    readonly fromReference: ConnectorEndpoint
    readonly toReferences: readonly ConnectorEndpoint[]
    readonly from: ResolvedConnectorEndpoint
    readonly to: readonly ResolvedConnectorEndpoint[]
    readonly runs: readonly ConnectorRouteRun[]
    readonly junctions: readonly ConnectorRouteJunction[]
    readonly traversals: readonly ConnectorTerminalTraversal<Item>[]
    readonly totalLength: number
    readonly scale: number
    readonly routeSignature: string
    readonly sourceName?: string
}

export interface ConnectorDecorationRecord<Item = unknown> {
    readonly id: string
    readonly ownerId: string
    readonly key: string
    readonly item: Item
    readonly network: ResolvedConnectorNetwork<Item>
    readonly layerIndex: number
    readonly layerKey: string
    readonly style: ResolvedConnectorStrokeOptions
    readonly interactive: boolean
    readonly sourceName?: string
    readonly bundleMemberKeys?: readonly string[]
    readonly signature: string
}

export interface ConnectorFlowRecord<Item = unknown> {
    readonly id: string
    readonly ownerId: string
    readonly key: string
    readonly item: Item
    readonly network: ResolvedConnectorNetwork<Item>
    readonly traversal?: ConnectorTerminalTraversal<Item>
    readonly source: ParticleSource<Item>
    readonly interactive: boolean
    readonly sourceName?: string
    readonly signature: string
}

export interface ConnectorGeometryRecord<Item = unknown> {
    readonly id: string
    readonly ownerId: string
    readonly key: string
    readonly item: Item
    readonly network: ResolvedConnectorNetwork<Item>
    readonly traversal?: ConnectorTerminalTraversal<Item>
    readonly source: GeometrySource<Item>
    readonly interactive: boolean
    readonly sourceName?: string
    readonly part: ConnectorEdgeHit['part']
    readonly signature: string
    readonly marker?: ConnectorMarkerOptions<Item>
}

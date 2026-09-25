import type * as THREE from 'three'
import type { BuiltinConnectorMarker, ConnectorPortName, ConnectorSource, ConnectorStrategyName, ConnectorVector3Tuple } from './types.js'

export interface ConnectorPresentation {
    appearance?: string
    routeStrategy?: ConnectorStrategyName
    clearance?: number
    elevation?: number
    strokeColor?: THREE.ColorRepresentation
    strokeWidth?: number
    strokeOpacity?: number
    markerStart?: BuiltinConnectorMarker | false
    markerEnd?: BuiltinConnectorMarker | false
}
export interface ConnectorHostProps extends ConnectorPresentation {
    graph?: ConnectorSource
    parameters?: import('./types.js').ConnectorParameterValues
    scope?: string
    interactive?: boolean
}
/** A template endpoint. Literal strings use node or node.port; bound objects allow dots in either name. */
export type ConnectorTemplateEndpoint = string | Readonly<{ node: string; port?: Readonly<{ name: string }> }>
export interface ConnectorEdgeDeclarationRecord extends ConnectorPresentation {
    key: string
    from?: ConnectorTemplateEndpoint
    to: ConnectorTemplateEndpoint
    interactive?: boolean
}
export interface ConnectorPortDeclarationRecord {
    name: string
    position?: ConnectorVector3Tuple
    normal?: ConnectorVector3Tuple
    face?: Exclude<ConnectorPortName, 'auto' | 'center'>
    at?: readonly [number, number]
    override?: boolean
    disabled?: boolean
    direction?: 'in' | 'out' | 'bidirectional'
}
export interface ConnectorHandle { readonly scope: string; readonly key: string }
export type ConnectorAppearances = Readonly<Record<string, ConnectorPresentation>>

import { Element3d } from '@/lib-components/three/element3d.js';
import { Segment } from '@/lib-components/three/connectors/path.js';
import * as THREE from 'three';

export type ConnectorPortName = 'auto' | 'center' | 'left' | 'right' | 'front' | 'back' | 'top' | 'bottom'

/** Normalized coordinates within an endpoint's world-space bounds. */
export interface ConnectorPortCoordinates {
    x?: number
    y?: number
    z?: number
}

export type ConnectorPort = ConnectorPortName | ConnectorPortCoordinates
export type ConnectorLane = number | 'auto'

export interface ConnectorRouteOptions {
    fromPort?: ConnectorPort
    toPort?: ConnectorPort
    /** Height above the endpoint ports, in world units. */
    elevation?: number
    /** Parallel-route lane index. `auto` separates parallel registrations. */
    lane?: ConnectorLane
    /** Endpoint clearance. `true` uses the stage default; a number is world units. */
    avoid?: boolean | number
}

export interface BusRouteOptions extends ConnectorRouteOptions {
    side?: ConnectorPortName
}

export interface ConnectorStrategy {
    calculatePath(el1: Element3d, el2: Element3d, type?: string, options?: ConnectorRouteOptions): Segment[];
    getPoints(el1: Element3d, el2: Element3d, options?: ConnectorRouteOptions): THREE.Vector3[];
}

export interface ConnectorRenderer {
    update(segments: Segment[], timer: number, tick: number): void;
    dispose(): void;
}

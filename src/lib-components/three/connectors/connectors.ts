import {VuetrexStage} from '../stage.js';
import {
    BezierStrategy,
    calculateBusSegments,
    ConnectorPath,
    DirectStrategy,
    OrthogonalStrategy,
    Segment,
    SplineStrategy,
} from '@/lib-components/three/connectors/path.js';
import {Element3d} from '@/lib-components/three/element3d.js';
import type {
    BusRouteOptions,
    ConnectorRenderer,
    ConnectorRouteOptions,
    ConnectorStrategy,
} from '@/lib-components/three/connectors/types.js';
import {ParticleRenderer} from '@/lib-components/three/connectors/ParticleRenderer.js';
import {LineRenderer} from '@/lib-components/three/connectors/LineRenderer.js';
import * as THREE from 'three';

export interface ConnectionRecord {
    id: string
    from: string
    to: string
    layout: string
    type: string
    options: ConnectorRouteOptions
}

export interface BusConnectionRecord {
    id: string
    from: string
    to: string[]
    type: string
    options: BusRouteOptions
}

interface ActiveConnection {
    record: ConnectionRecord
    fromEl: Element3d
    toEl: Element3d
}

interface ActiveBusConnection {
    record: BusConnectionRecord
    fromEl: Element3d
    toEls: Element3d[]
}

let imperativeConnectionSequence = 0

/**
 * Returns the world scale of the closest Object3D that encloses both endpoints.
 * Individual mesh/hover scale is deliberately excluded: connector thickness and
 * particle behavior follow the diagram container, not transient endpoint effects.
 */
export function enclosingConnectionScale(el1: Element3d, el2: Element3d): number {
    const fromAncestors = new Set<THREE.Object3D>()
    let current = el1.mesh?.parent ?? null
    while (current) {
        fromAncestors.add(current)
        current = current.parent
    }

    current = el2.mesh?.parent ?? null
    while (current && !fromAncestors.has(current)) current = current.parent
    if (!current) return 1

    current.updateWorldMatrix(true, false)
    const worldScale = current.getWorldScale(new THREE.Vector3())
    const volumeScale = Math.abs(worldScale.x * worldScale.y * worldScale.z)
    return Number.isFinite(volumeScale) && volumeScale > 0 ? Math.cbrt(volumeScale) : 1
}

/**
 * Connection registry and renderer coordinator.
 *
 * Registrations are keyed independently from endpoint pairs, so reactive updates
 * replace their own record and parallel connections remain distinct. Segments
 * retain that registration id for targeted rebuild/removal.
 */
export class Connectors {
    stage: VuetrexStage;
    private connections = new Map<string, ConnectionRecord>()
    private activeConnections = new Map<string, ActiveConnection>()
    private busConnections = new Map<string, BusConnectionRecord>()
    private activeBusConnections = new Map<string, ActiveBusConnection>()

    private segments: ConnectorPath = new ConnectorPath();
    private renderers: Map<string, ConnectorRenderer> = new Map();
    private strategies: Map<string, ConnectorStrategy> = new Map();

    constructor(stage: VuetrexStage) {
        this.stage = stage;
    }

    mount() {
        this.renderers.set('particles', new ParticleRenderer(this.stage));
        this.renderers.set('line', new LineRenderer(this.stage));

        this.strategies.set('orthogonal', new OrthogonalStrategy());
        const directStrategy = new DirectStrategy()
        this.strategies.set('direct', directStrategy);
        this.strategies.set('straight', directStrategy); // backwards-compatible alias
        this.strategies.set('bezier', new BezierStrategy());
        this.strategies.set('spline', new SplineStrategy());

        this.stage.registerAnimation(this.animate());
    }

    register(
        from: string,
        to: string,
        layout: string = 'orthogonal',
        type: string = 'particles',
        registrationId?: string,
        options: ConnectorRouteOptions = {},
    ): string {
        const id = registrationId ?? `imperative:${++imperativeConnectionSequence}`
        this.busConnections.delete(id)
        this.connections.set(id, { id, from, to, layout, type, options })
        return id
    }

    registerBus(
        from: string,
        to: readonly string[],
        type: string = 'line',
        registrationId?: string,
        options: BusRouteOptions = {},
    ): string {
        const id = registrationId ?? `imperative-bus:${++imperativeConnectionSequence}`
        this.connections.delete(id)
        this.busConnections.set(id, { id, from, to: [...to], type, options })
        return id
    }

    unregister(registrationId: string): void {
        this.connections.delete(registrationId)
        this.activeConnections.delete(registrationId)
        this.busConnections.delete(registrationId)
        this.activeBusConnections.delete(registrationId)
        this.segments.removeConnection(registrationId)
    }

    unregisterPair(el1: Element3d, el2: Element3d): void {
        const fromName = el1.node.id
        const toName = el2.node.id
        for (const [id, record] of [...this.connections]) {
            const sameDirection = record.from === fromName && record.to === toName
            const reverseDirection = record.from === toName && record.to === fromName
            if (sameDirection || reverseDirection) this.unregister(id)
        }
        for (const [id, record] of [...this.busConnections]) {
            if (record.from === fromName && record.to.includes(toName)) this.unregister(id)
        }
    }

    private automaticLane(record: ConnectionRecord): number {
        if (record.options.lane !== undefined && record.options.lane !== 'auto') return record.options.lane
        const peers = [...this.connections.values()].filter(candidate =>
            candidate.from === record.from && candidate.to === record.to,
        )
        if (peers.length <= 1) return 0
        const index = peers.findIndex(candidate => candidate.id === record.id)
        return index - (peers.length - 1) / 2
    }

    private rebuild(record: ConnectionRecord, fromEl: Element3d, toEl: Element3d): void {
        const strategy = this.strategies.get(record.layout) || this.strategies.get('orthogonal')!;
        this.segments.setStrategy(strategy);
        this.segments.removeConnection(record.id)
        this.segments.connect(
            fromEl,
            toEl,
            record.type,
            record.id,
            enclosingConnectionScale(fromEl, toEl),
            { ...record.options, lane: this.automaticLane(record) },
        );
        this.activeConnections.set(record.id, { record, fromEl, toEl })
    }

    private rebuildBus(record: BusConnectionRecord, fromEl: Element3d, toEls: Element3d[]): void {
        this.segments.removeConnection(record.id)
        const scale = toEls.reduce(
            (smallest, target) => Math.min(smallest, enclosingConnectionScale(fromEl, target)),
            Number.POSITIVE_INFINITY,
        )
        this.segments.add(
            calculateBusSegments(fromEl, toEls, record.type, record.options),
            record.id,
            Number.isFinite(scale) ? scale : 1,
        )
        this.activeBusConnections.set(record.id, { record, fromEl, toEls })
    }

    reconcileConnections() {
        for (const activeId of [...this.activeConnections.keys()]) {
            if (!this.connections.has(activeId)) {
                this.activeConnections.delete(activeId)
                this.segments.removeConnection(activeId)
            }
        }
        for (const activeId of [...this.activeBusConnections.keys()]) {
            if (!this.busConnections.has(activeId)) {
                this.activeBusConnections.delete(activeId)
                this.segments.removeConnection(activeId)
            }
        }

        for (const record of this.connections.values()) {
            const fromEl = this.stage.getById(record.from)
            const toEl = this.stage.getById(record.to)

            if (!fromEl || !toEl) {
                this.activeConnections.delete(record.id)
                this.segments.removeConnection(record.id)
                continue
            }

            this.rebuild(record, fromEl, toEl)
        }

        for (const record of this.busConnections.values()) {
            const fromEl = this.stage.getById(record.from)
            const toEls = record.to.map(id => this.stage.getById(id)).filter((value): value is Element3d => Boolean(value))
            if (!fromEl || !toEls.length) {
                this.activeBusConnections.delete(record.id)
                this.segments.removeConnection(record.id)
                continue
            }
            this.rebuildBus(record, fromEl, toEls)
        }

        this.segments.updateLen()
    }

    private isEndpointWithin(endpoint: Element3d, container: Element3d): boolean {
        if (endpoint === container) return true
        const containerObject = container.mesh
        let current = endpoint.mesh?.parent ?? null
        while (current) {
            if (current === containerObject) return true
            current = current.parent
        }
        return false
    }

    /** Rebuild every connection affected by an endpoint or enclosing group change. */
    update(el: Element3d) {
        for (const active of [...this.activeConnections.values()]) {
            if (this.isEndpointWithin(active.fromEl, el) || this.isEndpointWithin(active.toEl, el)) {
                this.rebuild(active.record, active.fromEl, active.toEl)
            }
        }
        for (const active of [...this.activeBusConnections.values()]) {
            if (this.isEndpointWithin(active.fromEl, el)
                || active.toEls.some(endpoint => this.isEndpointWithin(endpoint, el))) {
                this.rebuildBus(active.record, active.fromEl, active.toEls)
            }
        }
        this.segments.updateLen()
    }

    /** Remove live segments for a disappearing element while retaining declarations. */
    remove(el: Element3d): Segment[] {
        const removed: Segment[] = []
        for (const [id, active] of [...this.activeConnections]) {
            if (this.isEndpointWithin(active.fromEl, el) || this.isEndpointWithin(active.toEl, el)) {
                removed.push(...this.segments.removeConnection(id))
                this.activeConnections.delete(id)
            }
        }
        for (const [id, active] of [...this.activeBusConnections]) {
            if (this.isEndpointWithin(active.fromEl, el)
                || active.toEls.some(endpoint => this.isEndpointWithin(endpoint, el))) {
                removed.push(...this.segments.removeConnection(id))
                this.activeBusConnections.delete(id)
            }
        }
        return removed
    }

    get registrationCount(): number { return this.connections.size + this.busConnections.size }
    get activeConnectionCount(): number { return this.activeConnections.size + this.activeBusConnections.size }
    get segmentCount(): number { return this.segments.size() }

    getSegments(): readonly Segment[] {
        return this.segments.values()
    }

    getConnectionPorts(): Array<{ id: string, role: 'from' | 'to', point: THREE.Vector3 }> {
        const ports: Array<{ id: string, role: 'from' | 'to', point: THREE.Vector3 }> = []
        const seenSources = new Set<string>()
        for (const segment of this.segments.values()) {
            if (!seenSources.has(segment.connectionId)
                && (segment.routePart === 'source' || segment.routePart === 'route')) {
                seenSources.add(segment.connectionId)
                ports.push({ id: segment.connectionId, role: 'from', point: segment.startPoint() })
            }
            if (segment.terminal) {
                ports.push({ id: segment.connectionId, role: 'to', point: segment.endPoint() })
            }
        }
        return ports
    }

    clear() {
        this.renderers.forEach(r => r.dispose());
        this.renderers.clear();
        this.connections.clear()
        this.activeConnections.clear()
        this.busConnections.clear()
        this.activeBusConnections.clear()
        this.segments.clear();
    }

    private animate(): (timer: number, tick: number) => void {
        return (timer, tick) => {
            const segmentsByRenderer = new Map<string, Segment[]>();
            for (const segment of this.segments.values()) {
                const type = segment.type || 'particles';
                if (!segmentsByRenderer.has(type)) segmentsByRenderer.set(type, []);
                segmentsByRenderer.get(type)!.push(segment);
            }

            this.renderers.forEach((renderer, name) => {
                renderer.update(segmentsByRenderer.get(name) || [], timer, tick);
            });
        }
    }
}

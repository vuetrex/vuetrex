import {VuetrexStage} from '../stage.js';
import {Segment, ConnectorPath, DirectStrategy, OrthogonalStrategy} from '@/lib-components/three/connectors/path.js';
import {Element3d} from '@/lib-components/three/element3d.js';
import {ConnectorRenderer, ConnectorStrategy} from '@/lib-components/three/connectors/types.js';
import {ParticleRenderer} from '@/lib-components/three/connectors/ParticleRenderer.js';
import {LineRenderer} from '@/lib-components/three/connectors/LineRenderer.js';
import * as THREE from 'three';

export interface ConnectionRecord {
    id: string
    from: string
    to: string
    layout: string
    type: string
}

interface ActiveConnection {
    record: ConnectionRecord
    fromEl: Element3d
    toEl: Element3d
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

        this.stage.registerAnimation(this.animate());
    }

    register(
        from: string,
        to: string,
        layout: string = 'orthogonal',
        type: string = 'particles',
        registrationId?: string,
    ): string {
        const id = registrationId ?? `imperative:${++imperativeConnectionSequence}`
        this.connections.set(id, { id, from, to, layout, type })
        return id
    }

    unregister(registrationId: string): void {
        this.connections.delete(registrationId)
        this.activeConnections.delete(registrationId)
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
        );
        this.activeConnections.set(record.id, { record, fromEl, toEl })
    }

    reconcileConnections() {
        for (const activeId of [...this.activeConnections.keys()]) {
            if (!this.connections.has(activeId)) {
                this.activeConnections.delete(activeId)
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
        return removed
    }

    get registrationCount(): number { return this.connections.size }
    get activeConnectionCount(): number { return this.activeConnections.size }
    get segmentCount(): number { return this.segments.size() }

    getSegments(): readonly Segment[] {
        return this.segments.values()
    }

    clear() {
        this.renderers.forEach(r => r.dispose());
        this.renderers.clear();
        this.connections.clear()
        this.activeConnections.clear()
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

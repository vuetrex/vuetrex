import {Element3d} from '@/lib-components/three/element3d.js';
import {ConnectorStrategy} from '@/lib-components/three/connectors/types.js';
import {Box3, Vector3} from 'three';

export class Segment {
    horizontal: boolean
    mid: number
    s: number
    t: number
    len: number
    sEl: Element3d
    tEl: Element3d
    type: string
    connectionId: string
    scale: number
    elevation: number
    startX: number
    startZ: number
    endX: number
    endZ: number
    layout: string
    endInset: number
    constructor(horizontal: boolean, mid: number, s: number, t: number, sEl: Element3d, tEl: Element3d, type: string = 'particles', connectionId: string = '', scale: number = 1, elevation: number = -0.05, layout: string = 'orthogonal') {
        this.horizontal = horizontal;
        this.mid = mid
        this.s = s
        this.t = t
        this.startX = horizontal ? s : mid
        this.startZ = horizontal ? mid : s
        this.endX = horizontal ? t : mid
        this.endZ = horizontal ? mid : t
        this.len = Math.hypot(this.endX - this.startX, this.endZ - this.startZ);
        this.sEl = sEl;
        this.tEl = tEl;
        this.type = type;
        this.connectionId = connectionId;
        this.scale = scale;
        this.elevation = elevation;
        this.layout = layout;
        this.endInset = 0;
    }

    static between(start: Vector3, end: Vector3, sEl: Element3d, tEl: Element3d, type: string = 'particles', layout: string = 'direct'): Segment {
        const segment = new Segment(true, start.z, start.x, end.x, sEl, tEl, type, '', 1, -0.05, layout)
        segment.startX = start.x
        segment.startZ = start.z
        segment.endX = end.x
        segment.endZ = end.z
        segment.len = Math.hypot(end.x - start.x, end.z - start.z)
        return segment
    }
}

export class OrthogonalStrategy implements ConnectorStrategy {
    calculatePath(el1: Element3d, el2: Element3d, type: string = 'particles'): Segment[] {
        const segments: Segment[] = [];
        const distance = el1.node.stage.boxDistance;
        const snap = (a:number) => Math.round(a/distance)*distance;

        const p1 = el1.getWorldPosition();
        const p2 = el2.getWorldPosition();

        const sx = snap(p1.x)
        const sy = snap(p1.z)
        const tx = snap(p2.x)
        const ty = snap(p2.z)

        if( Math.abs(sy-ty) < 0.01 ) {
            //single horizontal line
            segments.push(new Segment(true, sy, sx, tx, el1, el2, type))
        } else if( Math.abs(sx-tx) < 0.01 ) {
            //single vertical line
            segments.push(new Segment(false, sx, sy, ty, el1, el2, type))
        } else if (Math.abs(ty-sy) / 2 > Math.abs(tx-sx)) {
            //zig-zag vertical (along Z)
            let midx = snap(( sx + tx ) / 2 );
            if (midx % 1 === 0.5) midx += 1.0; //offset to avoid hitting things
            segments.push(new Segment(true, sy, sx, midx, el1, el2, type))
            segments.push(new Segment(false, midx, sy, ty, el1, el2, type))
            segments.push(new Segment(true, ty, midx, tx, el1, el2, type))
        } else {
            //zig-zag horizontal (along X)
            let midy = snap(( sy + ty ) / 2)+0.25; //offset down to allow space for caption text
            if (midy % 1 === 0.5) midy += 1.0; //offset to avoid hitting things
            segments.push(new Segment(false, sx, sy, midy, el1, el2, type))
            segments.push(new Segment(true, midy, sx, tx, el1, el2, type))
            segments.push(new Segment(false, tx, midy, ty, el1, el2, type))
        }
        return segments;
    }

    getPoints(el1: Element3d, el2: Element3d): Vector3[] {
        const p1 = el1.getWorldPosition();
        const p2 = el2.getWorldPosition();
        const segments = this.calculatePath(el1, el2);
        if (segments.length === 0) return [p1, p2];

        const points: Vector3[] = [p1];
        for (const seg of segments) {
            if (seg.horizontal) {
                points.push(new Vector3(seg.t, p1.y, seg.mid));
            } else {
                points.push(new Vector3(seg.mid, p1.y, seg.t));
            }
        }
        return points;
    }
}

export class DirectStrategy implements ConnectorStrategy {
    calculatePath(el1: Element3d, el2: Element3d, type: string = 'particles'): Segment[] {
        const p1 = el1.getWorldPosition();
        const p2 = el2.getWorldPosition();
        return [Segment.between(p1, p2, el1, el2, type)];
    }

    getPoints(el1: Element3d, el2: Element3d): Vector3[] {
        return [el1.getWorldPosition(), el2.getWorldPosition()];
    }
}

/** @deprecated Use DirectStrategy. Retained for the public `straight` layout alias. */
export class StraightStrategy extends DirectStrategy {}

export class BezierStrategy implements ConnectorStrategy {
    calculatePath(el1: Element3d, el2: Element3d, type: string = 'particles'): Segment[] {
        // Fallback to straight line for now, but placeholder for Catmull-Rom or similar
        const p1 = el1.getWorldPosition();
        const p2 = el2.getWorldPosition();
        return [Segment.between(p1, p2, el1, el2, type, 'bezier')];
    }

    getPoints(el1: Element3d, el2: Element3d): Vector3[] {
        return [el1.getWorldPosition(), el2.getWorldPosition()];
    }
}

export class ConnectorPath {
    private segments: Segment[] = [];
    private totalLength: number = 0;
    private strategy: ConnectorStrategy = new OrthogonalStrategy();

    constructor() {
    }

    setStrategy(strategy: ConnectorStrategy) {
        this.strategy = strategy;
    }

    /** Distance from the target centre to the source-facing edge of its XZ bounds. */
    private targetInset(segment: Segment, scale: number): number {
        const target = segment.tEl.mesh
        if (!target || segment.len <= 0) return 0.3 * scale

        const bounds = new Box3().setFromObject(target)
        const x = segment.endX
        const z = segment.endZ
        if (bounds.isEmpty() || x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) {
            return 0.3 * scale
        }

        // Trace backwards from the target centre along the connector. Using
        // XZ bounds keeps the calculation valid even when endpoints sit at
        // different Y elevations.
        const reverseX = (segment.startX - segment.endX) / segment.len
        const reverseZ = (segment.startZ - segment.endZ) / segment.len
        const distances: number[] = []
        if (Math.abs(reverseX) > 1e-9) {
            distances.push((reverseX > 0 ? bounds.max.x - x : x - bounds.min.x) / Math.abs(reverseX))
        }
        if (Math.abs(reverseZ) > 1e-9) {
            distances.push((reverseZ > 0 ? bounds.max.z - z : z - bounds.min.z) / Math.abs(reverseZ))
        }
        const inset = Math.min(...distances.filter(distance => distance >= 0 && Number.isFinite(distance)))
        return Number.isFinite(inset) ? inset + 0.02 * scale : 0.3 * scale
    }

    connect(el1: Element3d, el2: Element3d, type: string = 'particles', connectionId: string = '', scale: number = 1) {
        const newSegments = this.strategy.calculatePath(el1, el2, type);
        const endpointElevation = Math.min(el1.getWorldPosition().y, el2.getWorldPosition().y)
        const elevation = Math.max(-0.025, endpointElevation) + 0.005 * scale
        newSegments.forEach(segment => {
            segment.connectionId = connectionId
            segment.scale = scale
            segment.elevation = elevation
            if (segment.layout === 'direct') segment.endInset = this.targetInset(segment, scale)
        })
        this.segments.push(...newSegments);
        this.updateLen();
    }

    clear() {
        this.segments.splice(0, this.segments.length);
    }

    size() {
        return this.segments.length;
    }

    totaLength() {
        return this.totalLength;
    }

    updateLen() {
        let totalLen = 0;
        for (const seg of this.segments) {
            totalLen += seg.len;
        }
        this.totalLength = totalLen;
    }

    remove(el: Element3d) : Segment[] {
        const removed = this.segments.filter(s => s.sEl === el || s.tEl === el);
        this.segments = this.segments.filter(s => s.sEl !== el && s.tEl !== el);
        this.updateLen();
        return removed;
    }

    removePair(el1: Element3d, el2: Element3d) : Segment[] {
        const removed = this.segments.filter(s =>
            (s.sEl === el1 && s.tEl === el2) || (s.sEl === el2 && s.tEl === el1)
        );
        this.segments = this.segments.filter(s =>
            !((s.sEl === el1 && s.tEl === el2) || (s.sEl === el2 && s.tEl === el1))
        );
        this.updateLen();
        return removed;
    }

    getSegment(idx: number) : Segment {
        return this.segments[idx];
    }

    values(): readonly Segment[] {
        return this.segments
    }

    setSegments(segments: readonly Segment[]): void {
        this.segments = [...segments]
        this.updateLen()
    }

    removeConnection(connectionId: string): Segment[] {
        const removed = this.segments.filter(s => s.connectionId === connectionId)
        this.segments = this.segments.filter(s => s.connectionId !== connectionId)
        this.updateLen()
        return removed
    }

    /**
     * Sample a position and direction by distance along the polyline.
     * Distance wraps around [0,totalLen).
     */
    sample(distance: number): { x: number; y: number, s: Segment | null } {
        if (this.segments.length === 0) {
            return { x: 0, y: 0, s: null };
        }
        const totalLen = this.totalLength;
        if (totalLen <= 0) return { x: 0, y: 0, s: this.segments[0] ?? null };

        // Wrap into [0, totalLen)
        let d = ((distance % totalLen) + totalLen) % totalLen;

        for (const seg of this.segments) {
            if (d <= seg.len) {
                const t = seg.len === 0 ? 0 : d / seg.len;
                return {
                    x: seg.startX + (seg.endX - seg.startX) * t,
                    y: seg.startZ + (seg.endZ - seg.startZ) * t,
                    s: seg,
                };
            }
            d -= seg.len;
        }

        const last = this.segments[this.segments.length - 1];
        return last.horizontal ? { x: last.t, y: last.mid, s: last  } : { x: last.mid, y: last.t, s: last };
    }

}

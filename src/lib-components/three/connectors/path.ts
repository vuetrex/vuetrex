import { Element3d } from '@/lib-components/three/element3d.js'
import type {
    BusRouteOptions,
    ConnectorPort,
    ConnectorPortName,
    ConnectorRouteOptions,
    ConnectorStrategy,
} from '@/lib-components/three/connectors/types.js'
import * as THREE from 'three'

const EPSILON = 1e-7

export interface ResolvedPort {
    point: THREE.Vector3
    normal: THREE.Vector3
    bounds: THREE.Box3
}

function clamp01(value: number | undefined): number {
    return Math.max(0, Math.min(1, value ?? 0.5))
}

function endpointBounds(element: Element3d): THREE.Box3 {
    const object = element.mesh
    if (!object) {
        const center = element.getWorldPosition()
        return new THREE.Box3(center.clone(), center.clone())
    }
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    if (!bounds.isEmpty()) return bounds
    const center = element.getWorldPosition()
    return new THREE.Box3(center.clone(), center.clone())
}

function automaticPort(bounds: THREE.Box3, toward: THREE.Vector3): ConnectorPortName {
    const center = bounds.getCenter(new THREE.Vector3())
    const delta = toward.clone().sub(center)
    if (Math.abs(delta.x) >= Math.abs(delta.z)) return delta.x >= 0 ? 'right' : 'left'
    return delta.z >= 0 ? 'front' : 'back'
}

/** Resolve a named or normalized port against current world-space bounds. */
export function resolvePort(
    element: Element3d,
    port: ConnectorPort | undefined,
    toward: THREE.Vector3,
): ResolvedPort {
    const bounds = endpointBounds(element)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())

    if (port && typeof port === 'object') {
        const normalized = new THREE.Vector3(clamp01(port.x), clamp01(port.y), clamp01(port.z))
        const point = bounds.min.clone().add(size.multiply(normalized))
        const normal = point.clone().sub(center)
        if (normal.lengthSq() <= EPSILON) normal.copy(toward).sub(center)
        if (normal.lengthSq() <= EPSILON) normal.set(1, 0, 0)
        normal.normalize()
        return { point, normal, bounds }
    }

    const namedPort = !port || port === 'auto' ? automaticPort(bounds, toward) : port
    const point = center.clone()
    const normal = new THREE.Vector3()
    if (namedPort === 'left') { point.x = bounds.min.x; normal.set(-1, 0, 0) }
    else if (namedPort === 'right') { point.x = bounds.max.x; normal.set(1, 0, 0) }
    else if (namedPort === 'front') { point.z = bounds.max.z; normal.set(0, 0, 1) }
    else if (namedPort === 'back') { point.z = bounds.min.z; normal.set(0, 0, -1) }
    else if (namedPort === 'top') { point.y = bounds.max.y; normal.set(0, 1, 0) }
    else if (namedPort === 'bottom') { point.y = bounds.min.y; normal.set(0, -1, 0) }
    else {
        normal.copy(toward).sub(center)
        if (normal.lengthSq() <= EPSILON) normal.set(1, 0, 0)
        normal.normalize()
    }
    return { point, normal, bounds }
}

function endpointPair(el1: Element3d, el2: Element3d, options: ConnectorRouteOptions = {}) {
    const fromCenter = endpointBounds(el1).getCenter(new THREE.Vector3())
    const toCenter = endpointBounds(el2).getCenter(new THREE.Vector3())
    const coincident = fromCenter.distanceToSquared(toCenter) <= EPSILON
    const fromToward = coincident ? toCenter.clone().add(new THREE.Vector3(1, 0, 0)) : toCenter
    const toToward = coincident ? fromCenter.clone().add(new THREE.Vector3(-1, 0, 0)) : fromCenter
    return {
        from: resolvePort(el1, options.fromPort, fromToward),
        to: resolvePort(el2, options.toPort, toToward),
    }
}

function avoidDistance(element: Element3d, avoid: ConnectorRouteOptions['avoid']): number {
    if (avoid === false) return 0
    if (typeof avoid === 'number' && Number.isFinite(avoid)) return Math.max(0, avoid)
    return Math.max(0.08, element.node.stage.boxDistance * 0.28)
}

function laneDistance(element: Element3d, lane: ConnectorRouteOptions['lane']): number {
    return typeof lane === 'number' && Number.isFinite(lane)
        ? lane * element.node.stage.boxDistance * 0.34
        : 0
}

function pushDistinct(points: THREE.Vector3[], point: THREE.Vector3): void {
    if (!points.length || points[points.length - 1].distanceToSquared(point) > EPSILON) points.push(point)
}

function routeSegments(
    points: readonly THREE.Vector3[],
    sEl: Element3d,
    tEl: Element3d,
    type: string,
    layout: string,
    routePart = 'route',
): Segment[] {
    const simplified: THREE.Vector3[] = []
    for (const point of points) {
        const current = point.clone()
        if (simplified.length >= 2) {
            const previous = simplified[simplified.length - 1]
            const before = simplified[simplified.length - 2]
            const incoming = previous.clone().sub(before)
            const outgoing = current.clone().sub(previous)
            const cross = incoming.clone().cross(outgoing)
            if (cross.lengthSq() <= EPSILON && incoming.dot(outgoing) > 0) simplified.pop()
        }
        pushDistinct(simplified, current)
    }
    const segments: Segment[] = []
    for (let index = 1; index < simplified.length; index++) {
        if (simplified[index - 1].distanceToSquared(simplified[index]) <= EPSILON) continue
        const segment = Segment.between(simplified[index - 1], simplified[index], sEl, tEl, type, layout)
        segment.terminal = false
        segment.routePart = routePart
        segments.push(segment)
    }
    if (segments.length) segments[segments.length - 1].terminal = true
    return segments
}

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
    startY: number
    startZ: number
    endX: number
    endY: number
    endZ: number
    layout: string
    endInset: number
    terminal = false
    routePart = 'route'

    constructor(
        horizontal: boolean,
        mid: number,
        s: number,
        t: number,
        sEl: Element3d,
        tEl: Element3d,
        type: string = 'particles',
        connectionId: string = '',
        scale: number = 1,
        elevation: number = -0.05,
        layout: string = 'orthogonal',
    ) {
        this.horizontal = horizontal
        this.mid = mid
        this.s = s
        this.t = t
        this.startX = horizontal ? s : mid
        this.startY = elevation
        this.startZ = horizontal ? mid : s
        this.endX = horizontal ? t : mid
        this.endY = elevation
        this.endZ = horizontal ? mid : t
        this.len = Math.hypot(this.endX - this.startX, this.endZ - this.startZ)
        this.sEl = sEl
        this.tEl = tEl
        this.type = type
        this.connectionId = connectionId
        this.scale = scale
        this.elevation = elevation
        this.layout = layout
        this.endInset = 0
    }

    static between(
        start: THREE.Vector3,
        end: THREE.Vector3,
        sEl: Element3d,
        tEl: Element3d,
        type: string = 'particles',
        layout: string = 'direct',
    ): Segment {
        const segment = new Segment(true, start.z, start.x, end.x, sEl, tEl, type, '', 1, start.y, layout)
        segment.startX = start.x
        segment.startY = start.y
        segment.startZ = start.z
        segment.endX = end.x
        segment.endY = end.y
        segment.endZ = end.z
        segment.elevation = (start.y + end.y) / 2
        segment.len = start.distanceTo(end)
        segment.horizontal = Math.abs(end.z - start.z) <= EPSILON
        segment.terminal = true
        return segment
    }

    startPoint(): THREE.Vector3 {
        return new THREE.Vector3(this.startX, this.startY, this.startZ)
    }

    endPoint(): THREE.Vector3 {
        return new THREE.Vector3(this.endX, this.endY, this.endZ)
    }
}

export class OrthogonalStrategy implements ConnectorStrategy {
    calculatePath(
        el1: Element3d,
        el2: Element3d,
        type: string = 'particles',
        options: ConnectorRouteOptions = {},
    ): Segment[] {
        return routeSegments(this.getPoints(el1, el2, options), el1, el2, type, 'orthogonal')
    }

    getPoints(el1: Element3d, el2: Element3d, options: ConnectorRouteOptions = {}): THREE.Vector3[] {
        const { from, to } = endpointPair(el1, el2, options)
        const clearance = avoidDistance(el1, options.avoid)
        const lane = laneDistance(el1, options.lane)
        const routeY = Math.max(from.point.y, to.point.y) + Math.max(0, options.elevation ?? 0)
        const startLead = from.point.clone().addScaledVector(from.normal, clearance)
        const endLead = to.point.clone().addScaledVector(to.normal, clearance)
        startLead.y = routeY
        endLead.y = routeY

        const points: THREE.Vector3[] = []
        pushDistinct(points, from.point.clone())
        pushDistinct(points, startLead)

        const xFacing = Math.abs(from.normal.x) >= Math.abs(from.normal.z)
            && Math.abs(to.normal.x) >= Math.abs(to.normal.z)
        const zFacing = Math.abs(from.normal.z) > Math.abs(from.normal.x)
            && Math.abs(to.normal.z) > Math.abs(to.normal.x)
        if (xFacing) {
            const midX = (startLead.x + endLead.x) / 2 + lane
            pushDistinct(points, new THREE.Vector3(midX, routeY, startLead.z))
            pushDistinct(points, new THREE.Vector3(midX, routeY, endLead.z))
        } else if (zFacing) {
            const midZ = (startLead.z + endLead.z) / 2 + lane
            pushDistinct(points, new THREE.Vector3(startLead.x, routeY, midZ))
            pushDistinct(points, new THREE.Vector3(endLead.x, routeY, midZ))
        } else if (Math.abs(endLead.x - startLead.x) >= Math.abs(endLead.z - startLead.z)) {
            const midX = (startLead.x + endLead.x) / 2 + lane
            pushDistinct(points, new THREE.Vector3(midX, routeY, startLead.z))
            pushDistinct(points, new THREE.Vector3(midX, routeY, endLead.z))
        } else {
            const midZ = (startLead.z + endLead.z) / 2 + lane
            pushDistinct(points, new THREE.Vector3(startLead.x, routeY, midZ))
            pushDistinct(points, new THREE.Vector3(endLead.x, routeY, midZ))
        }

        pushDistinct(points, endLead)
        pushDistinct(points, to.point.clone())
        return points
    }
}

export class DirectStrategy implements ConnectorStrategy {
    calculatePath(
        el1: Element3d,
        el2: Element3d,
        type: string = 'particles',
        options: ConnectorRouteOptions = {},
    ): Segment[] {
        return routeSegments(this.getPoints(el1, el2, options), el1, el2, type, 'direct')
    }

    getPoints(el1: Element3d, el2: Element3d, options: ConnectorRouteOptions = {}): THREE.Vector3[] {
        const { from, to } = endpointPair(el1, el2, options)
        const elevation = Math.max(0, options.elevation ?? 0)
        const lane = laneDistance(el1, options.lane)
        if (elevation <= 0 && Math.abs(lane) <= EPSILON) return [from.point, to.point]

        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(lane)
        const middle = from.point.clone().lerp(to.point, 0.5).add(perpendicular)
        middle.y = Math.max(from.point.y, to.point.y) + elevation
        return [from.point, middle, to.point]
    }
}

/** @deprecated Use DirectStrategy. Retained for the public `straight` layout alias. */
export class StraightStrategy extends DirectStrategy {}

export class BezierStrategy implements ConnectorStrategy {
    calculatePath(
        el1: Element3d,
        el2: Element3d,
        type: string = 'particles',
        options: ConnectorRouteOptions = {},
    ): Segment[] {
        return routeSegments(this.getPoints(el1, el2, options), el1, el2, type, 'bezier')
    }

    getPoints(el1: Element3d, el2: Element3d, options: ConnectorRouteOptions = {}): THREE.Vector3[] {
        const { from, to } = endpointPair(el1, el2, options)
        const distance = from.point.distanceTo(to.point)
        const handle = Math.max(distance * 0.28, avoidDistance(el1, options.avoid))
        const lane = laneDistance(el1, options.lane)
        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(lane)
        const control1 = from.point.clone().addScaledVector(from.normal, handle).add(perpendicular)
        const control2 = to.point.clone().addScaledVector(to.normal, handle).add(perpendicular)
        const baseY = Math.max(from.point.y, to.point.y)
        // Equal cubic controls contribute 75% of their height at t=0.5.
        const controlY = baseY + Math.max(0, options.elevation ?? 0) * 4 / 3
        control1.y = Math.max(control1.y, controlY)
        control2.y = Math.max(control2.y, controlY)
        return new THREE.CubicBezierCurve3(from.point, control1, control2, to.point).getPoints(24)
    }
}

export class SplineStrategy implements ConnectorStrategy {
    calculatePath(
        el1: Element3d,
        el2: Element3d,
        type: string = 'particles',
        options: ConnectorRouteOptions = {},
    ): Segment[] {
        return routeSegments(this.getPoints(el1, el2, options), el1, el2, type, 'spline')
    }

    getPoints(el1: Element3d, el2: Element3d, options: ConnectorRouteOptions = {}): THREE.Vector3[] {
        const { from, to } = endpointPair(el1, el2, options)
        const clearance = Math.max(from.point.distanceTo(to.point) * 0.18, avoidDistance(el1, options.avoid))
        const lane = laneDistance(el1, options.lane)
        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(lane)
        const crest = Math.max(from.point.y, to.point.y) + Math.max(0, options.elevation ?? 0)
        const startLead = from.point.clone().addScaledVector(from.normal, clearance)
        const endLead = to.point.clone().addScaledVector(to.normal, clearance)
        const middle = from.point.clone().lerp(to.point, 0.5).add(perpendicular)
        startLead.y = Math.max(startLead.y, crest)
        middle.y = crest
        endLead.y = Math.max(endLead.y, crest)
        const curve = new THREE.CatmullRomCurve3(
            [from.point, startLead, middle, endLead, to.point],
            false,
            'centripetal',
        )
        return curve.getPoints(30)
    }
}

/** Build one source trunk and one branch per target. */
export function calculateBusSegments(
    source: Element3d,
    targets: readonly Element3d[],
    type: string = 'line',
    options: BusRouteOptions = {},
): Segment[] {
    if (!targets.length) return []
    const targetCenters = targets.map(target => endpointBounds(target).getCenter(new THREE.Vector3()))
    const averageTarget = targetCenters.reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .multiplyScalar(1 / targetCenters.length)
    const sourcePort = resolvePort(source, options.side ?? options.fromPort ?? 'auto', averageTarget)
    const targetPorts = targets.map(target => resolvePort(target, options.toPort ?? 'auto', sourcePort.point))
    const clearance = avoidDistance(source, options.avoid)
    const lane = laneDistance(source, options.lane)
    const routeY = Math.max(sourcePort.point.y, ...targetPorts.map(port => port.point.y))
        + Math.max(0, options.elevation ?? 0)
    const alongX = Math.abs(sourcePort.normal.x) >= Math.abs(sourcePort.normal.z)
    const outward = alongX
        ? (sourcePort.normal.x || (averageTarget.x >= sourcePort.point.x ? 1 : -1))
        : (sourcePort.normal.z || (averageTarget.z >= sourcePort.point.z ? 1 : -1))
    const trunkCoordinate = (alongX ? sourcePort.point.x : sourcePort.point.z)
        + outward * (clearance * 1.6 + Math.abs(lane))

    const sourceJunction = new THREE.Vector3(
        alongX ? trunkCoordinate : sourcePort.point.x,
        routeY,
        alongX ? sourcePort.point.z : trunkCoordinate,
    )
    const targetJunctions = targetPorts.map(port => new THREE.Vector3(
        alongX ? trunkCoordinate : port.point.x,
        routeY,
        alongX ? port.point.z : trunkCoordinate,
    ))
    const allJunctions = [sourceJunction, ...targetJunctions]
    const trunkStart = sourceJunction.clone()
    const trunkEnd = sourceJunction.clone()
    if (alongX) {
        trunkStart.z = Math.min(...allJunctions.map(point => point.z))
        trunkEnd.z = Math.max(...allJunctions.map(point => point.z))
    } else {
        trunkStart.x = Math.min(...allJunctions.map(point => point.x))
        trunkEnd.x = Math.max(...allJunctions.map(point => point.x))
    }

    const segments: Segment[] = []
    const sourceSegments = routeSegments([sourcePort.point, sourceJunction], source, targets[0], type, 'bus', 'source')
    sourceSegments.forEach(segment => { segment.terminal = false })
    segments.push(...sourceSegments)
    const trunkSegments = routeSegments([trunkStart, trunkEnd], source, targets[0], type, 'bus', 'trunk')
    trunkSegments.forEach(segment => { segment.terminal = false })
    segments.push(...trunkSegments)
    targetPorts.forEach((port, index) => {
        segments.push(...routeSegments(
            [targetJunctions[index], port.point],
            source,
            targets[index],
            type,
            'bus',
            'branch',
        ))
    })
    return segments
}

export class ConnectorPath {
    private segments: Segment[] = []
    private totalLength = 0
    private strategy: ConnectorStrategy = new OrthogonalStrategy()

    setStrategy(strategy: ConnectorStrategy) {
        this.strategy = strategy
    }

    connect(
        el1: Element3d,
        el2: Element3d,
        type: string = 'particles',
        connectionId: string = '',
        scale: number = 1,
        options: ConnectorRouteOptions = {},
    ) {
        const newSegments = this.strategy.calculatePath(el1, el2, type, options)
        this.add(newSegments, connectionId, scale)
    }

    add(segments: readonly Segment[], connectionId: string, scale: number): void {
        segments.forEach(segment => {
            segment.connectionId = connectionId
            segment.scale = scale
            segment.elevation = (segment.startY + segment.endY) / 2
            if (segment.terminal) segment.endInset = 0.02 * scale
        })
        this.segments.push(...segments)
        this.updateLen()
    }

    clear() {
        this.segments.splice(0, this.segments.length)
        this.updateLen()
    }

    size() { return this.segments.length }
    totaLength() { return this.totalLength }

    updateLen() {
        this.totalLength = this.segments.reduce((total, segment) => total + segment.len, 0)
    }

    remove(el: Element3d): Segment[] {
        const removed = this.segments.filter(segment => segment.sEl === el || segment.tEl === el)
        this.segments = this.segments.filter(segment => segment.sEl !== el && segment.tEl !== el)
        this.updateLen()
        return removed
    }

    removePair(el1: Element3d, el2: Element3d): Segment[] {
        const matches = (segment: Segment) =>
            (segment.sEl === el1 && segment.tEl === el2) || (segment.sEl === el2 && segment.tEl === el1)
        const removed = this.segments.filter(matches)
        this.segments = this.segments.filter(segment => !matches(segment))
        this.updateLen()
        return removed
    }

    getSegment(index: number): Segment { return this.segments[index] }
    values(): readonly Segment[] { return this.segments }

    setSegments(segments: readonly Segment[]): void {
        this.segments = [...segments]
        this.updateLen()
    }

    removeConnection(connectionId: string): Segment[] {
        const removed = this.segments.filter(segment => segment.connectionId === connectionId)
        this.segments = this.segments.filter(segment => segment.connectionId !== connectionId)
        this.updateLen()
        return removed
    }

    /** Sample a 3D position and segment by distance along the route network. */
    sample(distance: number): { x: number, y: number, height: number, position: THREE.Vector3, s: Segment | null } {
        if (!this.segments.length) {
            const position = new THREE.Vector3()
            return { x: 0, y: 0, height: 0, position, s: null }
        }
        if (this.totalLength <= 0) {
            const segment = this.segments[0]
            const position = segment.startPoint()
            return { x: position.x, y: position.z, height: position.y, position, s: segment }
        }

        let remaining = ((distance % this.totalLength) + this.totalLength) % this.totalLength
        for (const segment of this.segments) {
            if (remaining <= segment.len) {
                const ratio = segment.len === 0 ? 0 : remaining / segment.len
                const position = segment.startPoint().lerp(segment.endPoint(), ratio)
                return { x: position.x, y: position.z, height: position.y, position, s: segment }
            }
            remaining -= segment.len
        }
        const segment = this.segments[this.segments.length - 1]
        const position = segment.endPoint()
        return { x: position.x, y: position.z, height: position.y, position, s: segment }
    }
}

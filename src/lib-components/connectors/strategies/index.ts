import * as THREE from 'three'
import type {
    ConnectorStrategy,
    ConnectorStrategyContext,
    ConnectorStrategyName,
    ConnectorStrategyResult,
} from '@/lib-components/connectors/types.js'
import type {
    ConnectorRuntimeStrategy,
    ConnectorRuntimeStrategyContext,
} from '@/lib-components/connectors/compiler/types.js'

const EPSILON = 1e-8
const registry = new Map<string, ConnectorStrategy>()
const runtimeRegistry = new Map<string, ConnectorRuntimeStrategy>()

function result(points: readonly THREE.Vector3[]): { readonly points: readonly THREE.Vector3[] } {
    const simplified: THREE.Vector3[] = []
    for (const point of points) {
        const current = point.clone()
        if (simplified.length >= 2) {
            const a = simplified[simplified.length - 2]
            const b = simplified[simplified.length - 1]
            const incoming = b.clone().sub(a)
            const outgoing = current.clone().sub(b)
            if (incoming.clone().cross(outgoing).lengthSq() <= EPSILON && incoming.dot(outgoing) >= 0) {
                simplified.pop()
            }
        }
        if (!simplified.length || simplified.at(-1)!.distanceToSquared(current) > EPSILON) simplified.push(current)
    }
    return Object.freeze({ points: Object.freeze(simplified) })
}

class DirectStrategy implements ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext) {
        const { from, to, elevation, laneDistance } = context
        if (elevation <= 0 && Math.abs(laneDistance) <= EPSILON) return result([from.point, to.point])
        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(laneDistance)
        const middle = from.point.clone().lerp(to.point, 0.5).add(perpendicular)
        middle.y = Math.max(from.point.y, to.point.y) + elevation
        return result([from.point, middle, to.point])
    }
}

class OrthogonalStrategy implements ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext) {
        const { from, to, clearance, laneDistance, elevation } = context
        const routeY = Math.max(from.point.y, to.point.y) + elevation
        const startLead = from.point.clone().addScaledVector(from.normal, clearance)
        const endLead = to.point.clone().addScaledVector(to.normal, clearance)
        startLead.y = routeY
        endLead.y = routeY
        const middle = context.obstacles.length
            ? obstacleRoute(startLead, endLead, routeY, context.obstacles, Math.max(clearance, 0.02 * context.scale))
            : basicOrthogonal(startLead, endLead, routeY, from.normal, to.normal, laneDistance)
        return result([from.point, startLead, ...middle, endLead, to.point])
    }
}

class BezierStrategy implements ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext) {
        const { from, to, clearance, laneDistance, elevation } = context
        const distance = from.point.distanceTo(to.point)
        const handle = Math.max(distance * 0.28, clearance)
        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(laneDistance)
        const control1 = from.point.clone().addScaledVector(from.normal, handle).add(perpendicular)
        const control2 = to.point.clone().addScaledVector(to.normal, handle).add(perpendicular)
        const baseY = Math.max(from.point.y, to.point.y)
        const controlY = baseY + elevation * 4 / 3
        control1.y = Math.max(control1.y, controlY)
        control2.y = Math.max(control2.y, controlY)
        return result(new THREE.CubicBezierCurve3(from.point, control1, control2, to.point).getPoints(24))
    }
}

class SplineStrategy implements ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext) {
        const { from, to, clearance, laneDistance, elevation } = context
        const leadDistance = Math.max(from.point.distanceTo(to.point) * 0.18, clearance)
        const delta = to.point.clone().sub(from.point)
        const perpendicular = new THREE.Vector3(-delta.z, 0, delta.x)
        if (perpendicular.lengthSq() > EPSILON) perpendicular.normalize().multiplyScalar(laneDistance)
        const crest = Math.max(from.point.y, to.point.y) + elevation
        const startLead = from.point.clone().addScaledVector(from.normal, leadDistance)
        const endLead = to.point.clone().addScaledVector(to.normal, leadDistance)
        const middle = from.point.clone().lerp(to.point, 0.5).add(perpendicular)
        startLead.y = Math.max(startLead.y, crest)
        middle.y = crest
        endLead.y = Math.max(endLead.y, crest)
        const curve = new THREE.CatmullRomCurve3(
            [from.point, startLead, middle, endLead, to.point],
            false,
            'centripetal',
        )
        return result(curve.getPoints(30))
    }
}

class ManualStrategy implements ConnectorRuntimeStrategy {
    resolve(context: ConnectorRuntimeStrategyContext) {
        return result([context.from.point, ...context.waypoints, context.to.point])
    }
}

export function registerConnectorStrategy(name: string, strategy: ConnectorStrategy): () => void {
    const normalized = name.trim()
    if (!normalized) throw new TypeError('Connector strategy names must not be empty.')
    if (!strategy || typeof strategy.resolve !== 'function') {
        throw new TypeError(`Connector strategy '${normalized}' must implement resolve().`)
    }
    registry.set(normalized, strategy)
    const runtime = runtimeStrategy(strategy)
    runtimeRegistry.set(normalized, runtime)
    return () => {
        if (registry.get(normalized) === strategy) registry.delete(normalized)
        if (runtimeRegistry.get(normalized) === runtime) runtimeRegistry.delete(normalized)
    }
}

export function connectorStrategy(name: ConnectorStrategyName): ConnectorStrategy {
    return registry.get(name) ?? registry.get('orthogonal')!
}

/** Internal immutable-at-mount view used by a stage controller. */
export function connectorStrategySnapshot(): ReadonlyMap<string, ConnectorRuntimeStrategy> {
    return new Map(runtimeRegistry)
}

registerRuntimeStrategy('direct', new DirectStrategy())
registerRuntimeStrategy('orthogonal', new OrthogonalStrategy())
registerRuntimeStrategy('bezier', new BezierStrategy())
registerRuntimeStrategy('spline', new SplineStrategy())
registerRuntimeStrategy('manual', new ManualStrategy())

function registerRuntimeStrategy(name: string, runtime: ConnectorRuntimeStrategy): void {
    runtimeRegistry.set(name, runtime)
    registry.set(name, publicStrategy(runtime))
}

function runtimeStrategy(strategy: ConnectorStrategy): ConnectorRuntimeStrategy {
    return Object.freeze({
        resolve(context: ConnectorRuntimeStrategyContext) {
            const publicResult = strategy.resolve(publicContext(context))
            return Object.freeze({ points: Object.freeze(publicResult.points.map(vector)) })
        },
    })
}

function publicStrategy(strategy: ConnectorRuntimeStrategy): ConnectorStrategy {
    return Object.freeze({
        resolve(context: ConnectorStrategyContext): ConnectorStrategyResult {
            const runtimeResult = strategy.resolve(runtimeContext(context))
            return Object.freeze({ points: Object.freeze(runtimeResult.points.map(tuple)) })
        },
    })
}

function publicContext(context: ConnectorRuntimeStrategyContext): ConnectorStrategyContext {
    const endpoint = (value: ConnectorRuntimeStrategyContext['from']) => Object.freeze({
        point: tuple(value.point),
        normal: tuple(value.normal),
        ...(value.bounds ? { bounds: Object.freeze({ min: tuple(value.bounds.min), max: tuple(value.bounds.max) }) } : {}),
    })
    return Object.freeze({
        from: endpoint(context.from),
        to: endpoint(context.to),
        clearance: context.clearance,
        laneDistance: context.laneDistance,
        elevation: context.elevation,
        waypoints: Object.freeze(context.waypoints.map(tuple)),
        obstacles: Object.freeze(context.obstacles.map(box => Object.freeze({ min: tuple(box.min), max: tuple(box.max) }))),
        scale: context.scale,
    })
}

function runtimeContext(context: ConnectorStrategyContext): ConnectorRuntimeStrategyContext {
    const endpoint = (value: ConnectorStrategyContext['from']) => Object.freeze({
        reference: Object.freeze({ position: value.point }),
        point: vector(value.point),
        normal: vector(value.normal),
        ...(value.bounds ? { bounds: new THREE.Box3(vector(value.bounds.min), vector(value.bounds.max)) } : {}),
        revision: `public:${value.point.join(',')}:${value.normal.join(',')}`,
    })
    return Object.freeze({
        from: endpoint(context.from),
        to: endpoint(context.to),
        clearance: context.clearance,
        laneDistance: context.laneDistance,
        elevation: context.elevation,
        waypoints: Object.freeze(context.waypoints.map(vector)),
        obstacles: Object.freeze(context.obstacles.map(box => new THREE.Box3(vector(box.min), vector(box.max)))),
        scale: context.scale,
    })
}

function tuple(point: THREE.Vector3): readonly [number, number, number] {
    return Object.freeze([point.x, point.y, point.z])
}

function vector(point: readonly [number, number, number]): THREE.Vector3 {
    return new THREE.Vector3(point[0], point[1], point[2])
}

function basicOrthogonal(
    start: THREE.Vector3,
    end: THREE.Vector3,
    y: number,
    fromNormal: THREE.Vector3,
    toNormal: THREE.Vector3,
    lane: number,
): THREE.Vector3[] {
    const xFacing = Math.abs(fromNormal.x) >= Math.abs(fromNormal.z)
        && Math.abs(toNormal.x) >= Math.abs(toNormal.z)
    if (xFacing || Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)) {
        const middleX = (start.x + end.x) / 2 + lane
        return [new THREE.Vector3(middleX, y, start.z), new THREE.Vector3(middleX, y, end.z)]
    }
    const middleZ = (start.z + end.z) / 2 + lane
    return [new THREE.Vector3(start.x, y, middleZ), new THREE.Vector3(end.x, y, middleZ)]
}

interface GridState {
    x: number
    z: number
    direction: number
    cost: number
    estimate: number
    previous?: GridState
}

/** Deterministic bounded Manhattan search used by the ground profile. */
function obstacleRoute(
    start: THREE.Vector3,
    end: THREE.Vector3,
    y: number,
    obstacles: readonly THREE.Box3[],
    requestedCell: number,
): THREE.Vector3[] {
    const cell = Math.max(0.08, requestedCell)
    const minX = Math.floor((Math.min(start.x, end.x, ...obstacles.map(box => box.min.x)) - cell * 3) / cell)
    const maxX = Math.ceil((Math.max(start.x, end.x, ...obstacles.map(box => box.max.x)) + cell * 3) / cell)
    const minZ = Math.floor((Math.min(start.z, end.z, ...obstacles.map(box => box.min.z)) - cell * 3) / cell)
    const maxZ = Math.ceil((Math.max(start.z, end.z, ...obstacles.map(box => box.max.z)) + cell * 3) / cell)
    const startCell = { x: Math.round(start.x / cell), z: Math.round(start.z / cell) }
    const endCell = { x: Math.round(end.x / cell), z: Math.round(end.z / cell) }
    const blocked = (x: number, z: number) => obstacles.some(box =>
        x * cell >= box.min.x && x * cell <= box.max.x
        && z * cell >= box.min.z && z * cell <= box.max.z)
    const key = (x: number, z: number, direction: number) => `${x}:${z}:${direction}`
    const open: GridState[] = [{ ...startCell, direction: -1, cost: 0, estimate: 0 }]
    const best = new Map<string, number>()
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
    let resolved: GridState | undefined
    let iterations = 0

    while (open.length && iterations++ < 12000) {
        open.sort((a, b) => a.estimate - b.estimate || a.cost - b.cost || a.x - b.x || a.z - b.z)
        const current = open.shift()!
        if (current.x === endCell.x && current.z === endCell.z) {
            resolved = current
            break
        }
        directions.forEach(([dx, dz], direction) => {
            const x = current.x + dx
            const z = current.z + dz
            if (x < minX || x > maxX || z < minZ || z > maxZ) return
            if (blocked(x, z) && !(x === endCell.x && z === endCell.z)) return
            const cost = current.cost + 1 + (current.direction >= 0 && current.direction !== direction ? 0.35 : 0)
            const stateKey = key(x, z, direction)
            if ((best.get(stateKey) ?? Number.POSITIVE_INFINITY) <= cost) return
            best.set(stateKey, cost)
            const distance = Math.abs(endCell.x - x) + Math.abs(endCell.z - z)
            open.push({ x, z, direction, cost, estimate: cost + distance, previous: current })
        })
    }

    if (!resolved) return basicOrthogonal(start, end, y, new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), 0)
    const cells: GridState[] = []
    for (let current: GridState | undefined = resolved; current?.previous; current = current.previous) cells.push(current)
    cells.reverse()
    return cells.map(state => new THREE.Vector3(state.x * cell, y, state.z * cell))
}

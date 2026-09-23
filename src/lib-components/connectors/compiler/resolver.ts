import * as THREE from 'three'
import type { Node } from '@/lib-components/nodes/Node.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { enclosingElementsScale } from '@/lib-components/connectors/runtime/scale.js'
import { resolvePort, declaredPortDefinition } from '@/lib-components/connectors/compiler/ports.js'
import { stableValue } from '@/lib-components/connectors/compiler/evaluator.js'
import type {
    AuthoredConnectorRecord,
    ConnectorRouteJunction,
    ConnectorRouteRun,
    ConnectorTerminalTraversal,
    ResolvedConnectorEndpoint,
    ResolvedConnectorNetwork,
} from '@/lib-components/connectors/compiler/types.js'
import type {
    ConnectorEndpoint,
    ConnectorObstacleRef,
    ConnectorPort,
    ConnectorPortDefinition,
    ConnectorVector3Like,
    ConnectorWaypoint,
} from '@/lib-components/connectors/types.js'
import type { ConnectorRuntimeStrategy } from '@/lib-components/connectors/compiler/types.js'

const EPSILON = 1e-8

export interface ConnectorResolveResult<Item = unknown> {
    readonly network?: ResolvedConnectorNetwork<Item>
    readonly missing: readonly string[]
}

export function resolveConnectorRecord<Item>(
    stage: VuetrexStage,
    ownerId: string,
    record: AuthoredConnectorRecord<Item>,
    automaticLane: number,
    strategy: ConnectorRuntimeStrategy,
): ConnectorResolveResult<Item> {
    const fromHint = endpointCenter(stage, record.from)
    const targetHints = record.to.map(target => endpointCenter(stage, target))
    const missing: string[] = []
    if (!fromHint) missing.push(endpointLabel(record.from))
    targetHints.forEach((hint, index) => {
        if (!hint) missing.push(endpointLabel(record.to[index]))
    })
    if (!fromHint || targetHints.some(hint => !hint)) {
        return Object.freeze({ missing: Object.freeze([...new Set(missing)]) })
    }

    const averageTarget = targetHints.reduce((sum, target) => sum.add(target!.point), new THREE.Vector3())
        .multiplyScalar(1 / targetHints.length)
    const coincident = averageTarget.distanceToSquared(fromHint.point) <= EPSILON
    const fromToward = coincident
        ? averageTarget.clone().add(new THREE.Vector3(1, 0, 0))
        : averageTarget
    const from = resolveEndpoint(stage, record.from, record.routing.fromPort, fromToward)
    if (!from) return Object.freeze({ missing: Object.freeze([unresolvedEndpoint(stage, record.from, record.routing.fromPort)]) })
    const targets: ResolvedConnectorEndpoint[] = []
    for (const [index, target] of record.to.entries()) {
        const targetToward = targetHints[index]!.point.distanceToSquared(fromHint.point) <= EPSILON
            ? fromHint.point.clone().add(new THREE.Vector3(-1, 0, 0))
            : fromHint.point
        const resolvedTarget = resolveEndpoint(stage, target, record.routing.toPort, targetToward)
        if (!resolvedTarget) return Object.freeze({ missing: Object.freeze([unresolvedEndpoint(stage, target, record.routing.toPort)]) })
        targets.push(resolvedTarget)
    }
    const scale = enclosingElementsScale([fromHint.element, ...targetHints.map(hint => hint!.element)])
    const clearance = record.routing.clearance
        ?? Math.max(0.08 * scale, (stage.boxDistance ?? 1) * 0.28 * scale)
    const lane = record.routing.lane === 'auto' ? automaticLane : record.routing.lane
    const laneDistance = finite(lane, 0) * (stage.boxDistance ?? 1) * 0.34 * scale
    const waypoints = record.routing.waypoints.map(waypoint => resolveWaypoint(stage, waypoint))
    const excludedIds = new Set([from.nodeId, ...targets.map(target => target.nodeId)].filter(Boolean) as string[])
    const obstacles = resolveObstacles(stage, record.routing.obstacles, excludedIds, clearance)

    const resolved = record.topology === 'bus'
        ? resolveBus(ownerId, record, from, targets, scale, clearance, laneDistance)
        : resolveEdge(ownerId, record, from, targets[0], scale, clearance, laneDistance, waypoints, obstacles, strategy)
    return Object.freeze({ network: resolved, missing: Object.freeze([]) })
}

function resolveEdge<Item>(
    ownerId: string,
    record: AuthoredConnectorRecord<Item>,
    from: ResolvedConnectorEndpoint,
    to: ResolvedConnectorEndpoint,
    scale: number,
    clearance: number,
    laneDistance: number,
    waypoints: readonly THREE.Vector3[],
    obstacles: readonly THREE.Box3[],
    strategy: ConnectorRuntimeStrategy,
): ResolvedConnectorNetwork<Item> {
    const result = strategy.resolve({
        from,
        to,
        clearance,
        laneDistance,
        elevation: record.routing.elevation * scale,
        waypoints,
        obstacles,
        scale,
    })
    const points = freezePoints(result.points)
    const fromKey = `${record.key}:terminal:from`
    const toKey = `${record.key}:terminal:to:0`
    const run: ConnectorRouteRun = Object.freeze({
        key: `${record.key}:run:route`,
        role: 'route',
        memberKeys: Object.freeze([record.key]),
        points,
        fromJunctionKey: fromKey,
        toJunctionKey: toKey,
    })
    const junctions: ConnectorRouteJunction[] = [
        makeJunction(fromKey, 'terminal', points[0] ?? from.point, [record.key]),
        makeJunction(toKey, 'terminal', points.at(-1) ?? to.point, [record.key]),
    ]
    const traversal = makeTraversal(record, 0, [run], points)
    return makeResolvedNetwork(ownerId, record, from, [to], [run], junctions, [traversal], scale, laneDistance)
}

function resolveBus<Item>(
    ownerId: string,
    record: AuthoredConnectorRecord<Item>,
    from: ResolvedConnectorEndpoint,
    targets: readonly ResolvedConnectorEndpoint[],
    scale: number,
    clearance: number,
    laneDistance: number,
): ResolvedConnectorNetwork<Item> {
    const routeY = Math.max(from.point.y, ...targets.map(target => target.point.y))
        + record.routing.elevation * scale
    const averageTarget = targets.reduce((sum, target) => sum.add(target.point), new THREE.Vector3())
        .multiplyScalar(1 / targets.length)
    const alongX = Math.abs(from.normal.x) >= Math.abs(from.normal.z)
    const outward = alongX
        ? (from.normal.x || (averageTarget.x >= from.point.x ? 1 : -1))
        : (from.normal.z || (averageTarget.z >= from.point.z ? 1 : -1))
    const trunkCoordinate = (alongX ? from.point.x : from.point.z)
        + outward * (clearance * 1.6 + Math.abs(laneDistance))
    const sourceJunction = new THREE.Vector3(
        alongX ? trunkCoordinate : from.point.x,
        routeY,
        alongX ? from.point.z : trunkCoordinate,
    )
    const targetJunctions = targets.map(target => new THREE.Vector3(
        alongX ? trunkCoordinate : target.point.x,
        routeY,
        alongX ? target.point.z : trunkCoordinate,
    ))
    const coordinate = (point: THREE.Vector3) => alongX ? point.z : point.x
    const stations: Array<{ point: THREE.Vector3; source: boolean; targets: number[] }> = []
    for (const [kind, point, targetIndex] of [
        ['source', sourceJunction, -1] as const,
        ...targetJunctions.map((point, index) => ['target', point, index] as const),
    ]) {
        const existing = stations.find(station => Math.abs(coordinate(station.point) - coordinate(point)) <= EPSILON)
        if (existing) {
            if (kind === 'source') existing.source = true
            else existing.targets.push(targetIndex)
        } else {
            stations.push({ point, source: kind === 'source', targets: kind === 'target' ? [targetIndex] : [] })
        }
    }
    stations.sort((a, b) => coordinate(a.point) - coordinate(b.point))
    const stationKeys = stations.map((station, index) => station.source
        ? `${record.key}:junction:source`
        : `${record.key}:junction:target:${station.targets[0] ?? index}`)
    const sourceStationIndex = stations.findIndex(station => station.source)
    const targetStationIndexes = targets.map((_, targetIndex) =>
        stations.findIndex(station => station.targets.includes(targetIndex)))
    const fromKey = `${record.key}:terminal:from`
    const toKeys = targets.map((_, index) => `${record.key}:terminal:to:${index}`)
    const junctions: ConnectorRouteJunction[] = [
        makeJunction(fromKey, 'terminal', from.point, [record.key]),
        ...stations.map((station, index) => makeJunction(
            stationKeys[index],
            'junction',
            station.point,
            [record.key],
        )),
        ...targets.map((target, index) => makeJunction(toKeys[index], 'terminal', target.point, [record.key])),
    ]
    const sourceRun: ConnectorRouteRun = makeRun(
        `${record.key}:run:source`, 'source', [record.key], [from.point, sourceJunction], fromKey, stationKeys[sourceStationIndex],
    )
    const trunkRuns = stations.slice(0, -1).map((station, index) => makeRun(
        `${record.key}:run:trunk:${index}`,
        'trunk',
        [record.key],
        [station.point, stations[index + 1].point],
        stationKeys[index],
        stationKeys[index + 1],
    ))
    const branchRuns = targets.map((target, index) => makeRun(
        `${record.key}:run:branch:${index}`,
        'branch',
        [record.key],
        [targetJunctions[index], target.point],
        stationKeys[targetStationIndexes[index]],
        toKeys[index],
    ))
    const runs = [sourceRun, ...trunkRuns, ...branchRuns]
    const traversals = targets.map((target, targetIndex) => {
        const targetStationIndex = targetStationIndexes[targetIndex]
        const selectedTrunks = targetStationIndex >= sourceStationIndex
            ? trunkRuns.slice(sourceStationIndex, targetStationIndex)
            : trunkRuns.slice(targetStationIndex, sourceStationIndex).reverse()
        const traversalRuns = [sourceRun, ...selectedTrunks, branchRuns[targetIndex]]
        const points = freezePoints([
            from.point,
            sourceJunction,
            ...selectedTrunks.map((run, index) => targetStationIndex >= sourceStationIndex
                ? run.points.at(-1)!
                : run.points[0]),
            target.point,
        ])
        return makeTraversal(record, targetIndex, traversalRuns, dedupePoints(points))
    })
    return makeResolvedNetwork(ownerId, record, from, targets, runs, junctions, traversals, scale, laneDistance)
}

function makeResolvedNetwork<Item>(
    ownerId: string,
    record: AuthoredConnectorRecord<Item>,
    from: ResolvedConnectorEndpoint,
    to: readonly ResolvedConnectorEndpoint[],
    runs: readonly ConnectorRouteRun[],
    junctions: readonly ConnectorRouteJunction[],
    traversals: readonly ConnectorTerminalTraversal<Item>[],
    scale: number,
    laneDistance: number,
): ResolvedConnectorNetwork<Item> {
    const routeSignature = stableValue({
        authored: record.routeSignature,
        from: from.revision,
        to: to.map(target => target.revision),
        laneDistance,
        runs: runs.map(run => ({ key: run.key, points: run.points.map(point => point.toArray()) })),
    })
    return Object.freeze({
        ownerId,
        key: record.key,
        item: record.item,
        items: Object.freeze([record.item]),
        topology: record.topology,
        memberKeys: Object.freeze([record.key]),
        fromReference: record.from,
        toReferences: record.to,
        from,
        to: Object.freeze([...to]),
        runs: Object.freeze([...runs]),
        junctions: Object.freeze([...junctions]),
        traversals: Object.freeze([...traversals]),
        totalLength: runs.reduce((sum, run) => sum + polylineLengths(run.points).totalLength, 0),
        scale,
        routeSignature,
        sourceName: record.names.at(-1),
    })
}

function makeRun(
    key: string,
    role: ConnectorRouteRun['role'],
    memberKeys: readonly string[],
    rawPoints: readonly THREE.Vector3[],
    fromJunctionKey: string,
    toJunctionKey: string,
): ConnectorRouteRun {
    return Object.freeze({
        key,
        role,
        memberKeys: Object.freeze([...memberKeys]),
        points: freezePoints(rawPoints),
        fromJunctionKey,
        toJunctionKey,
    })
}

function makeJunction(
    key: string,
    kind: ConnectorRouteJunction['kind'],
    point: THREE.Vector3,
    memberKeys: readonly string[],
): ConnectorRouteJunction {
    return Object.freeze({ key, kind, point: Object.freeze(point.clone()), memberKeys: Object.freeze([...memberKeys]) })
}

function makeTraversal<Item>(
    record: AuthoredConnectorRecord<Item>,
    targetIndex: number,
    runs: readonly ConnectorRouteRun[],
    points: readonly THREE.Vector3[],
): ConnectorTerminalTraversal<Item> {
    const lengths = polylineLengths(points)
    return Object.freeze({
        key: `${record.key}:traversal:${targetIndex}`,
        memberKey: record.key,
        index: record.index,
        item: record.item,
        targetIndex,
        runKeys: Object.freeze(runs.map(run => run.key)),
        points,
        cumulativeLengths: lengths.cumulativeLengths,
        totalLength: lengths.totalLength,
    })
}

function polylineLengths(points: readonly THREE.Vector3[]): {
    cumulativeLengths: readonly number[]
    totalLength: number
} {
    const cumulativeLengths = [0]
    for (let index = 1; index < points.length; index++) {
        cumulativeLengths.push(cumulativeLengths[index - 1] + points[index - 1].distanceTo(points[index]))
    }
    return { cumulativeLengths: Object.freeze(cumulativeLengths), totalLength: cumulativeLengths.at(-1) ?? 0 }
}

function dedupePoints(points: readonly THREE.Vector3[]): readonly THREE.Vector3[] {
    return Object.freeze(points.filter((point, index) => index === 0 || point.distanceToSquared(points[index - 1]) > EPSILON))
}

interface EndpointHint {
    point: THREE.Vector3
    element?: Element3d
}

function endpointCenter(stage: VuetrexStage, reference: ConnectorEndpoint): EndpointHint | undefined {
    if (typeof reference === 'string' || 'node' in reference) {
        const nodeId = typeof reference === 'string' ? reference : reference.node
        const element = stage.getById(nodeId)
        if (!element) return undefined
        return { point: boundsOf(element).getCenter(new THREE.Vector3()), element }
    }
    const point = vectorFrom(reference.position)
    if (reference.space && reference.space !== 'world') {
        const object = stage.getById(reference.space.node)?.mesh
        if (!object) return undefined
        object.updateWorldMatrix(true, false)
        object.localToWorld(point)
    }
    return { point }
}

function resolveEndpoint(
    stage: VuetrexStage,
    reference: ConnectorEndpoint,
    defaultPort: ConnectorPort,
    toward: THREE.Vector3,
): ResolvedConnectorEndpoint | undefined {
    if (typeof reference !== 'string' && 'position' in reference) {
        const hint = endpointCenter(stage, reference)
        if (!hint) return undefined
        const normal = toward.clone().sub(hint.point)
        if (normal.lengthSq() <= EPSILON) normal.set(1, 0, 0)
        normal.normalize().negate()
        return Object.freeze({
            reference,
            point: hint.point,
            normal,
            revision: `free:${hint.point.toArray().join(',')}`,
        })
    }
    const nodeId = typeof reference === 'string' ? reference : reference.node
    const element = stage.getById(nodeId)
    if (!element) return undefined
    const port = typeof reference === 'string' ? defaultPort : reference.port ?? defaultPort
    const customName = port && typeof port === 'object' && 'name' in port ? port.name : undefined
    if (customName) {
        const declared = element.node.declaredConnectorPorts?.get(customName)
        const definition = declared ? declaredPortDefinition(element, declared) : element.node.connectorPorts?.()[customName]
        if (!definition) {
            if (!declared && ['auto', 'center', 'left', 'right', 'front', 'back', 'top', 'bottom'].includes(customName)) {
                return resolveEndpoint(stage, { node: nodeId, port: customName as import('../types.js').ConnectorPortName }, defaultPort, toward)
            }
            return undefined
        }
        const object = element.mesh
        if (!object) return undefined
        object.updateWorldMatrix(true, false)
        const point = vectorFrom(definition.position).applyMatrix4(object.matrixWorld)
        const normal = vectorFrom(definition.normal)
            .applyMatrix3(new THREE.Matrix3().getNormalMatrix(object.matrixWorld))
            .normalize()
        return Object.freeze({
            reference,
            point,
            normal,
            bounds: boundsOf(element),
            nodeId,
            revision: `${nodeId}:${customName}:${point.toArray().join(',')}:${normal.toArray().join(',')}`,
        })
    }
    const resolved = resolvePort(element, port as Exclude<ConnectorPort, { name: string }>, toward)
    return Object.freeze({
        reference,
        point: resolved.point,
        normal: resolved.normal,
        bounds: resolved.bounds,
        nodeId,
        revision: `${nodeId}:${stableValue(port)}:${resolved.point.toArray().join(',')}:${resolved.normal.toArray().join(',')}`,
    })
}

function resolveWaypoint(
    stage: VuetrexStage,
    waypoint: ConnectorWaypoint | ConnectorVector3Like,
): THREE.Vector3 {
    if (waypoint && typeof waypoint === 'object' && 'position' in waypoint) {
        const point = vectorFrom(waypoint.position)
        if (waypoint.space && waypoint.space !== 'world') {
            const object = stage.getById(waypoint.space.node)?.mesh
            if (object) {
                object.updateWorldMatrix(true, false)
                object.localToWorld(point)
            }
        }
        return point
    }
    return vectorFrom(waypoint as ConnectorVector3Like)
}

function resolveObstacles(
    stage: VuetrexStage,
    source: 'none' | 'stage-nodes' | readonly ConnectorObstacleRef[],
    excludedIds: ReadonlySet<string>,
    clearance: number,
): THREE.Box3[] {
    if (source === 'none') return []
    const bounds: THREE.Box3[] = []
    if (source === 'stage-nodes') {
        const seen = new Set<Element3d>()
        const scene = typeof stage.getScene === 'function' ? stage.getScene() : stage.scene
        scene.traverse(object => {
            const element = object.userData.el as Element3d | undefined
            if (!element || seen.has(element) || excludedIds.has(element.node.id) || !object.visible) return
            seen.add(element)
            const box = boundsOf(element)
            if (!box.isEmpty()) bounds.push(box.expandByScalar(clearance))
        })
        return bounds
    }
    for (const reference of source) {
        let box: THREE.Box3 | undefined
        let extra = clearance
        if (typeof reference === 'string') {
            const element = stage.getById(reference)
            if (element && !excludedIds.has(reference)) box = boundsOf(element)
        } else if ('node' in reference) {
            const element = stage.getById(reference.node)
            extra = reference.clearance ?? clearance
            if (element && !excludedIds.has(reference.node)) box = boundsOf(element)
        } else {
            box = new THREE.Box3(vectorFrom(reference.min), vectorFrom(reference.max))
        }
        if (box && !box.isEmpty()) bounds.push(box.expandByScalar(extra))
    }
    return bounds
}

function boundsOf(element: Element3d): THREE.Box3 {
    const object = element.mesh
    if (!object) {
        const point = element.getWorldPosition()
        return new THREE.Box3(point.clone(), point.clone())
    }
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    if (!bounds.isEmpty()) return bounds
    const point = element.getWorldPosition()
    return new THREE.Box3(point.clone(), point.clone())
}

function freezePoints(points: readonly THREE.Vector3[]): readonly THREE.Vector3[] {
    return Object.freeze(points.map(point => Object.freeze(point.clone())))
}

function endpointLabel(endpoint: ConnectorEndpoint): string {
    if (typeof endpoint === 'string') return endpoint
    if ('node' in endpoint) return endpoint.node
    return `position:${vectorFrom(endpoint.position).toArray().join(',')}`
}

function vectorFrom(value: ConnectorVector3Like): THREE.Vector3 {
    return new THREE.Vector3(value[0], value[1], value[2])
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function unresolvedEndpoint(stage: VuetrexStage, reference: ConnectorEndpoint, fallback: ConnectorPort): string {
    const node = typeof reference === 'string' ? reference : 'node' in reference ? reference.node : undefined
    const port = typeof reference !== 'string' && 'node' in reference ? reference.port ?? fallback : fallback
    if (node && typeof port === 'object' && 'name' in port) {
        const disabled = stage.getById(node)?.node.declaredConnectorPorts?.get(port.name)?.disabled
        return `${disabled ? 'disabled' : 'missing'} port: ${node}/${port.name}`
    }
    return endpointLabel(reference)
}

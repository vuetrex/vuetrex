import * as THREE from 'three'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { stableValue } from '@/lib-components/connectors/compiler/evaluator.js'
import { resolveConnectorRecord } from '@/lib-components/connectors/compiler/resolver.js'
import { StrokeBackend } from '@/lib-components/connectors/runtime/StrokeBackend.js'
import { ParticleBridge } from '@/lib-components/connectors/runtime/ParticleBridge.js'
import { GeometryBridge } from '@/lib-components/connectors/runtime/GeometryBridge.js'
import { isGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource } from '@/lib-components/geometry/types.js'
import { isParticleSource } from '@/lib-components/particles/graph.js'
import { connectorStrategySnapshot } from '@/lib-components/connectors/strategies/index.js'
import { connectorAppearanceSnapshot } from '@/lib-components/connectors/appearance.js'
import type {
    AuthoredConnectorPlan,
    AuthoredConnectorRecord,
    ConnectorDecorationRecord,
    ConnectorFlowRecord,
    ConnectorGeometryRecord,
    ConnectorRouteJunction,
    ConnectorRouteRun,
    ConnectorTerminalTraversal,
    ResolvedConnectorNetwork,
} from '@/lib-components/connectors/compiler/types.js'
import type {
    ConnectorEndpoint,
    ConnectorHit,
    ConnectorAppearanceBackend,
    ConnectorRuntimeDiagnostics,
    ConnectorParameterValues,
    ResolvedConnectorTraversalContext,
    ResolvedConnectorNetworkContext,
} from '@/lib-components/connectors/types.js'

export type ConnectorHostEventName = 'onClick' | 'onDblclick' | 'onPointerenter' | 'onPointerleave'

export interface ConnectorOwnerInteraction {
    readonly interactive: boolean
    dispatch(type: ConnectorHostEventName, hit: ConnectorHit, event: MouseEvent): void
}

interface OwnerState {
    readonly ownerId: string
    plan: AuthoredConnectorPlan
    resolved: Map<string, ResolvedConnectorNetwork>
    bundles: Map<string, ResolvedConnectorNetwork>
    missing: Map<string, readonly string[]>
    interaction?: ConnectorOwnerInteraction
    parameters: ConnectorParameterValues
}

type StrokeRuntimeBackend = ConnectorAppearanceBackend<ConnectorDecorationRecord> & {
    diagnostics?(): { readonly entries: number; readonly updates: number; readonly allocations?: number }
}

export class Connectors {
    readonly stage: VuetrexStage
    private readonly owners = new Map<string, OwnerState>()
    private strokeBackend?: StrokeRuntimeBackend
    private particleBridge?: ParticleBridge
    private geometryBridge?: GeometryBridge
    private routeBuildCount = 0
    private mounted = false
    private readonly strategies = connectorStrategySnapshot()
    private readonly appearances = connectorAppearanceSnapshot()

    constructor(stage: VuetrexStage) {
        this.stage = stage
    }

    mount(): void {
        if (this.mounted) return
        this.mounted = true
        this.strokeBackend = (this.appearances.get('stroke')?.(this.stage)
            ?? new StrokeBackend(this.stage)) as StrokeRuntimeBackend
        this.particleBridge = new ParticleBridge(this.stage)
        this.geometryBridge = new GeometryBridge(this.stage)
    }

    reconcile(
        ownerId: string,
        plan: AuthoredConnectorPlan,
        interaction?: ConnectorOwnerInteraction,
        parameters: ConnectorParameterValues = {},
    ): void {
        this.ensureMounted()
        const changedPeerGroups = new Set(this.owners.get(ownerId)?.plan.records.map(peerGroupKey) ?? [])
        plan.records.forEach(record => changedPeerGroups.add(peerGroupKey(record)))
        const owner: OwnerState = this.owners.get(ownerId) ?? {
            ownerId,
            plan,
            resolved: new Map(),
            bundles: new Map(),
            missing: new Map(),
            parameters,
        }
        owner.plan = plan
        owner.interaction = interaction
        owner.parameters = parameters
        this.owners.set(ownerId, owner)
        this.resolvePeerGroups(changedPeerGroups)
        this.refreshOutputs()
    }

    removeOwner(ownerId: string): void {
        const removed = this.owners.get(ownerId)
        if (!removed || !this.owners.delete(ownerId)) return
        this.particleBridge?.removeOwner(ownerId)
        this.geometryBridge?.removeOwner(ownerId)
        this.resolvePeerGroups(new Set(removed.plan.records.map(peerGroupKey)))
        this.refreshOutputs()
    }

    /** Re-resolve graph declarations when endpoint identity or availability changes. */
    reconcileConnections(): void {
        this.ensureMounted()
        for (const owner of this.owners.values()) this.resolveOwner(owner)
        this.refreshOutputs()
    }

    /** Reroute only records whose resolved endpoint is the changed node or one of its descendants. */
    update(element: Element3d): void {
        let changed = false
        for (const owner of this.owners.values()) {
            const affected = new Set<string>()
            for (const record of owner.plan.records) {
                const path = owner.resolved.get(record.key)
                if (path) {
                    const endpoints = [path.from, ...path.to]
                    if (endpoints.some(endpoint => {
                        const endpointElement = endpoint.nodeId ? this.stage.getById(endpoint.nodeId) : undefined
                        return endpointElement ? this.isEndpointWithin(endpointElement, element) : false
                    })) affected.add(record.key)
                } else if ([record.from, ...record.to].some(endpoint => endpointNodeId(endpoint) === element.node.id)) {
                    affected.add(record.key)
                }
            }
            if (affected.size) {
                this.resolveOwner(owner, affected)
                changed = true
            }
        }
        if (changed) this.refreshOutputs()
    }

    /** Remove live output for a disappearing endpoint while retaining authored declarations. */
    remove(element: Element3d): void {
        let changed = false
        for (const owner of this.owners.values()) {
            for (const [key, path] of [...owner.resolved]) {
                const endpointIds = [path.from.nodeId, ...path.to.map(endpoint => endpoint.nodeId)]
                if (!endpointIds.includes(element.node.id)) continue
                owner.resolved.delete(key)
                owner.missing.set(key, Object.freeze([element.node.id]))
                changed = true
            }
        }
        if (changed) this.refreshOutputs()
    }

    getResolvedNetwork(ownerId: string, key: string): ResolvedConnectorNetwork | undefined {
        const owner = this.owners.get(ownerId)
        return owner?.resolved.get(key) ?? owner?.bundles.get(key)
    }

    getConnectionPorts(): Array<{ id: string; role: 'from' | 'to'; point: THREE.Vector3 }> {
        const ports: Array<{ id: string; role: 'from' | 'to'; point: THREE.Vector3 }> = []
        for (const owner of this.owners.values()) {
            for (const path of owner.resolved.values()) {
                const id = `${owner.ownerId}:${path.key}`
                ports.push({ id, role: 'from', point: path.from.point.clone() })
                path.to.forEach(target => ports.push({ id, role: 'to', point: target.point.clone() }))
            }
        }
        return ports
    }

    hitAt(object: THREE.Object3D, instanceId?: number, intersection?: THREE.Intersection): ConnectorHit | undefined {
        return this.strokeBackend?.hitAt?.(object, instanceId, intersection)
            ?? this.geometryBridge?.hitAt(object, instanceId, intersection)
            ?? this.particleBridge?.hitAt(object, instanceId, intersection)
    }

    dispatchOwnerEvent(
        ownerId: string,
        type: ConnectorHostEventName,
        object: THREE.Object3D,
        instanceId: number | undefined,
        event: MouseEvent,
        intersection?: THREE.Intersection,
    ): ConnectorHit | undefined {
        const owner = this.owners.get(ownerId)
        if (!owner?.interaction?.interactive) return undefined
        const hit = this.hitAt(object, instanceId, intersection)
        if (hit) {
            ;(event as MouseEvent & { vxConnector?: ConnectorHit }).vxConnector = hit
            owner.interaction.dispatch(type, hit, event)
        }
        return hit
    }

    connectorDiagnostics(): ConnectorRuntimeDiagnostics {
        const allOwners = [...this.owners.values()]
        const allRecords = allOwners.flatMap(owner => [...owner.plan.records])
        const allPaths = allOwners.flatMap(owner => [...owner.resolved.values()])
        const stroke = this.strokeBackend?.diagnostics?.()
        const particle = this.particleBridge?.diagnostics()
        const geometry = this.geometryBridge?.diagnostics()
        return Object.freeze({
            ownerCount: allOwners.length,
            authoredCount: allRecords.length,
            resolvedCount: allPaths.length,
            unresolvedCount: allOwners.reduce((sum, owner) => sum + owner.missing.size, 0),
            edgeCount: allRecords.filter(record => record.topology === 'edge').length,
            busCount: allRecords.filter(record => record.topology === 'bus').length,
            bundledCount: new Set(allRecords.map(record => record.bundleKey).filter(Boolean)).size,
            segmentCount: allPaths.reduce((sum, path) => sum + path.runs.reduce(
                (runSum, run) => runSum + Math.max(0, run.points.length - 1), 0), 0),
            pointCount: allPaths.reduce((sum, path) => sum + path.runs.reduce(
                (runSum, run) => runSum + run.points.length, 0), 0),
            strokeCount: stroke?.entries ?? 0,
            particleEmitterCount: particle?.emitters ?? 0,
            geometryRecordCount: geometry?.records ?? 0,
            routeBuildCount: this.routeBuildCount,
            decorationUpdateCount: (stroke?.updates ?? 0) + (particle?.rebuilds ?? 0) + (geometry?.evaluations ?? 0),
            particleProgramBuildCount: particle?.rebuilds ?? 0,
            geometryEvaluationCount: geometry?.evaluations ?? 0,
            owners: Object.freeze(allOwners.map(owner => Object.freeze({
                name: owner.plan.records.flatMap(record => record.names).at(-1),
                recordKeys: Object.freeze(owner.plan.records.map(record => record.key)),
                unresolvedKeys: Object.freeze([...owner.missing.keys()]),
            }))),
        })
    }

    clear(): void {
        this.strokeBackend?.dispose()
        this.particleBridge?.dispose()
        this.geometryBridge?.dispose()
        this.strokeBackend = undefined
        this.particleBridge = undefined
        this.geometryBridge = undefined
        this.owners.clear()
        this.mounted = false
    }

    private resolveOwner(owner: OwnerState, only?: ReadonlySet<string>): void {
        const activeKeys = new Set(owner.plan.records.map(record => record.key))
        for (const key of [...owner.resolved.keys()]) if (!activeKeys.has(key)) owner.resolved.delete(key)
        for (const key of [...owner.missing.keys()]) if (!activeKeys.has(key)) owner.missing.delete(key)
        for (const record of owner.plan.records) {
            if (only && !only.has(record.key)) continue
            const result = resolveConnectorRecord(
                this.stage,
                owner.ownerId,
                record,
                this.automaticLane(owner.ownerId, record),
                this.strategies.get(record.routing.strategy) ?? this.strategies.get('orthogonal')!,
            )
            if (!result.network) {
                owner.resolved.delete(record.key)
                owner.missing.set(record.key, result.missing)
                continue
            }
            const prior = owner.resolved.get(record.key)
            if (prior?.routeSignature !== result.network.routeSignature) {
                owner.resolved.set(record.key, result.network)
                this.routeBuildCount++
            }
            owner.missing.delete(record.key)
        }
    }

    private resolvePeerGroups(groupKeys: ReadonlySet<string>): void {
        for (const owner of this.owners.values()) {
            const keys = new Set(owner.plan.records.filter(record => groupKeys.has(peerGroupKey(record))).map(record => record.key))
            if (keys.size) this.resolveOwner(owner, keys)
        }
    }

    private refreshOutputs(): void {
        if (!this.mounted) return
        const strokes: ConnectorDecorationRecord[] = []
        for (const owner of this.owners.values()) {
            const flows: ConnectorFlowRecord[] = []
            const geometries: ConnectorGeometryRecord[] = []
            const bundleGroups = collectBundleNetworks(owner)
            owner.bundles.clear()
            bundleGroups.forEach(group => owner.bundles.set(group.key, group.network))
            for (const record of owner.plan.records) {
                const network = owner.resolved.get(record.key)
                if (!network || !record.visible) continue
                const interactive = owner.interaction?.interactive ?? false
                record.strokes.forEach((style, layerIndex) => strokes.push(Object.freeze({
                    id: `${owner.ownerId}:${record.key}:stroke:${style.key}`,
                    ownerId: owner.ownerId,
                    key: record.key,
                    item: record.item,
                    network,
                    layerIndex,
                    layerKey: style.key,
                    style,
                    interactive,
                    sourceName: network.sourceName,
                    signature: stableValue({ route: network.routeSignature, style, layerKey: style.key }),
                })))
                record.flows.forEach(layer => {
                    const traversals = layer.scope === 'network'
                        ? record.bundleKey ? [] : [undefined]
                        : network.traversals.filter(hasUsablePath)
                    traversals.forEach(traversal => {
                        const source = layer.scope === 'network'
                            ? (layer.factory as any)(networkContext(network))
                            : (layer.factory as any)(routeContext(network, traversal!))
                        if (!isParticleSource(source)) throw new TypeError(`Connector flow '${record.key}' must return a ParticleSource.`)
                        flows.push(Object.freeze({
                            id: `${owner.ownerId}:${record.key}:flow:${layer.key}:${traversal?.key ?? 'network'}`,
                            ownerId: owner.ownerId,
                            key: record.key,
                            item: traversal?.item ?? record.item,
                            network,
                            traversal,
                            source,
                            interactive,
                            sourceName: network.sourceName,
                            signature: stableValue({ route: network.routeSignature, layer: layer.key, traversal: traversal?.key }),
                        }))
                    })
                })
                record.geometries.forEach(layer => {
                    const traversals = layer.scope === 'network'
                        ? record.bundleKey ? [] : [undefined]
                        : network.traversals.filter(hasUsablePath)
                    traversals.forEach(traversal => {
                        const source = layer.scope === 'network'
                            ? (layer.factory as any)(networkContext(network))
                            : (layer.factory as any)(routeContext(network, traversal!))
                        if (!isGeometrySource(source)) throw new TypeError(`Connector geometry '${record.key}' must return a GeometrySource.`)
                        geometries.push(makeGeometryRecord(
                            owner, record, network, source, interactive,
                            `geometry:${layer.key}:${traversal?.key ?? 'network'}`,
                            traversal,
                        ))
                    })
                })
                appendMarkerGeometry(geometries, owner, record, network, interactive)
            }
            appendBundleFactories(flows, geometries, owner, bundleGroups)
            appendBundles(strokes, owner, bundleGroups)
            this.particleBridge?.reconcile(owner.ownerId, flows, owner.parameters)
            this.geometryBridge?.reconcile(owner.ownerId, geometries, owner.parameters)
        }
        this.strokeBackend?.reconcile(strokes)
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

    private automaticLane(ownerId: string, record: AuthoredConnectorRecord): number {
        if (record.routing.lane !== 'auto') return Number(record.routing.lane)
        const groupKey = stableValue([record.topology, record.from, record.to])
        const peers = [...this.owners.values()].flatMap(owner => owner.plan.records.map(candidate => ({
            id: `${owner.ownerId}:${candidate.key}`,
            groupKey: stableValue([candidate.topology, candidate.from, candidate.to]),
        }))).filter(candidate => candidate.groupKey === groupKey)
            .sort((a, b) => a.id.localeCompare(b.id))
        const index = peers.findIndex(candidate => candidate.id === `${ownerId}:${record.key}`)
        return index < 0 ? 0 : index - (peers.length - 1) / 2
    }

    private ensureMounted(): void {
        if (!this.mounted) this.mount()
    }
}

/** Initial layout can temporarily collapse endpoints; path factories require a real span. */
function hasUsablePath(traversal: ConnectorTerminalTraversal): boolean {
    return traversal.points.length >= 2 && traversal.totalLength > 0
}

function peerGroupKey(record: AuthoredConnectorRecord): string {
    return stableValue([record.topology, record.from, record.to])
}

function routeContext<Item>(
    network: ResolvedConnectorNetwork<Item>,
    traversal: ConnectorTerminalTraversal<Item>,
): ResolvedConnectorTraversalContext<Item> {
    const points = Object.freeze(traversal.points.map(point => tuple(point)))
    return Object.freeze({
        scope: 'traversal',
        ownerId: network.ownerId,
        networkKey: network.key,
        key: traversal.key,
        memberKey: traversal.memberKey,
        index: traversal.index,
        item: traversal.item,
        targetIndex: traversal.targetIndex,
        topology: network.topology as 'edge' | 'bus',
        from: network.fromReference,
        to: network.toReferences[traversal.targetIndex],
        runKeys: traversal.runKeys,
        points,
        cumulativeLengths: traversal.cumulativeLengths,
        totalLength: traversal.totalLength,
        scale: network.scale,
        sourceName: network.sourceName,
    })
}

function networkContext<Item>(network: ResolvedConnectorNetwork<Item>): ResolvedConnectorNetworkContext<Item> {
    return Object.freeze({
        scope: 'network',
        ownerId: network.ownerId,
        key: network.key,
        index: 0,
        item: network.item,
        items: network.items,
        topology: network.topology,
        memberKeys: network.memberKeys,
        runs: Object.freeze(network.runs.map(run => Object.freeze({
            key: run.key,
            role: run.role,
            memberKeys: run.memberKeys,
            points: Object.freeze(run.points.map(point => tuple(point))),
            fromJunctionKey: run.fromJunctionKey,
            toJunctionKey: run.toJunctionKey,
        }))),
        junctions: Object.freeze(network.junctions.map(junction => Object.freeze({
            key: junction.key,
            kind: junction.kind,
            point: tuple(junction.point),
            memberKeys: junction.memberKeys,
        }))),
        traversals: Object.freeze(network.traversals.map(traversal => routeContext(network, traversal))),
        totalLength: network.totalLength,
        scale: network.scale,
        sourceName: network.sourceName,
    })
}

function tuple(point: THREE.Vector3): readonly [number, number, number] {
    return Object.freeze([point.x, point.y, point.z])
}

function makeGeometryRecord(
    owner: OwnerState,
    authored: AuthoredConnectorRecord,
    path: ResolvedConnectorNetwork,
    source: ConnectorGeometryRecord['source'],
    interactive: boolean,
    suffix: string,
    traversal?: ConnectorTerminalTraversal,
): ConnectorGeometryRecord {
    const part = suffix.includes('marker-start')
        ? 'marker-start'
        : suffix.includes('marker-end')
            ? 'marker-end'
            : suffix.includes('junction')
                ? 'junction'
                : 'geometry'
    return Object.freeze({
        id: `${owner.ownerId}:${authored.key}:${suffix}`,
        ownerId: owner.ownerId,
        key: authored.key,
        item: authored.item,
        network: path,
        traversal,
        source,
        interactive,
        sourceName: path.sourceName,
        part,
        signature: stableValue({ route: path.routeSignature, suffix }),
    })
}

function appendMarkerGeometry(
    output: ConnectorGeometryRecord[],
    owner: OwnerState,
    authored: AuthoredConnectorRecord,
    path: ResolvedConnectorNetwork,
    interactive: boolean,
): void {
    authored.markers.forEach(marker => {
        const placements: Array<{
            source: GeometrySource
            point: THREE.Vector3
            tangent: THREE.Vector3
            part: string
        }> = []
        const firstTraversal = path.traversals[0]
        if (marker.start && firstTraversal?.points.length >= 2) {
            const tangent = firstTraversal.points[1].clone().sub(firstTraversal.points[0]).normalize()
            placements.push({
                source: marker.start,
                point: firstTraversal.points[0].clone().addScaledVector(tangent, marker.inset),
                tangent,
                part: 'marker-start',
            })
        }
        if (marker.end) {
            path.traversals.filter(traversal => traversal.points.length >= 2).forEach(traversal => {
                const end = traversal.points.length - 1
                const tangent = traversal.points[end].clone().sub(traversal.points[end - 1]).normalize()
                placements.push({
                    source: marker.end as GeometrySource,
                    point: traversal.points[end].clone().addScaledVector(tangent, -marker.inset),
                    tangent,
                    part: `marker-end:${traversal.targetIndex}`,
                })
            })
        }
        if (marker.junction) {
            path.junctions.filter(junction => junction.kind === 'junction').forEach((junction, index) => placements.push({
                source: marker.junction as GeometrySource,
                point: junction.point,
                tangent: new THREE.Vector3(1, 0, 0),
                part: `junction:${index}`,
            }))
        }
        if (marker.repeat) {
            path.runs.forEach((part, partIndex) => {
                for (let index = 1; index < part.points.length; index++) {
                    const tangent = part.points[index].clone().sub(part.points[index - 1]).normalize()
                    placements.push({
                        source: marker.repeat as GeometrySource,
                        point: part.points[index - 1].clone().lerp(part.points[index], 0.5),
                        tangent,
                        part: `repeat:${partIndex}:${index}`,
                    })
                }
            })
        }
        placements.forEach(placement => {
            let source = placement.source.transform({
                translate: placement.point,
                rotate: marker.align === 'none' ? undefined : tangentQuaternion(placement.tangent),
                scale: marker.scale * path.scale,
            })
            if (marker.color !== undefined) source = source.parameterMap({ color: marker.color })
            output.push(makeGeometryRecord(
                owner,
                authored,
                path,
                source,
                interactive,
                `marker:${marker.key}:${placement.part}`,
            ))
        })
    })
}

function tangentQuaternion(tangent: THREE.Vector3): THREE.Quaternion {
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.clone().normalize())
}

interface BundleNetworkGroup {
    readonly key: string
    readonly network: ResolvedConnectorNetwork
    readonly members: readonly { authored: AuthoredConnectorRecord; path: ResolvedConnectorNetwork }[]
}

function collectBundleNetworks(owner: OwnerState): BundleNetworkGroup[] {
    const groups = new Map<string, Array<{ authored: AuthoredConnectorRecord; path: ResolvedConnectorNetwork }>>()
    for (const authored of owner.plan.records) {
        if (!authored.bundleKey || !authored.visible) continue
        const path = owner.resolved.get(authored.key)
        if (!path) continue
        const group = groups.get(authored.bundleKey) ?? []
        group.push({ authored, path })
        groups.set(authored.bundleKey, group)
    }
    return [...groups].map(([key, members]) => Object.freeze({
        key,
        members: Object.freeze(members),
        network: bundlePath(owner.ownerId, key, members.map(member => member.path)),
    }))
}

function appendBundles(
    strokes: ConnectorDecorationRecord[],
    owner: OwnerState,
    groups: readonly BundleNetworkGroup[],
): void {
    for (const { key: bundleKey, members, network: path } of groups) {
        if (members.length < 2) continue
        const first = members[0].authored
        const style = Object.freeze({
            key: 'bundle-underlay',
            explicit: Object.freeze(['color', 'width', 'opacity', 'offset']),
            implicit: false,
            color: first.bundleColor ?? first.strokes[0]?.color,
            width: first.bundleWidth ?? Math.max(...members.map(member => member.authored.strokes[0]?.width ?? 0.04)) * 1.8,
            opacity: 0.58,
            dash: false as const,
            offset: -0.004,
            markerStart: false as const,
            markerEnd: false as const,
            depthTest: first.strokes[0]?.depthTest ?? true,
        })
        strokes.push(Object.freeze({
            id: `${owner.ownerId}:bundle:${bundleKey}`,
            ownerId: owner.ownerId,
            key: bundleKey,
            item: undefined,
            network: path,
            layerIndex: -1,
            layerKey: 'bundle-underlay',
            style,
            interactive: owner.interaction?.interactive ?? false,
            sourceName: path.sourceName,
            bundleMemberKeys: Object.freeze(members.map(member => member.authored.key)),
            signature: stableValue({ route: path.routeSignature, style }),
        }))
    }
}

function appendBundleFactories(
    flows: ConnectorFlowRecord[],
    geometries: ConnectorGeometryRecord[],
    owner: OwnerState,
    groups: readonly BundleNetworkGroup[],
): void {
    const interactive = owner.interaction?.interactive ?? false
    for (const { key: bundleKey, members, network } of groups) {
        const first = members[0]?.authored
        if (!first) continue
        first.flows.filter(layer => layer.scope === 'network').forEach(layer => {
            const source = (layer.factory as any)(networkContext(network))
            if (!isParticleSource(source)) throw new TypeError(`Connector bundle flow '${bundleKey}' must return a ParticleSource.`)
            flows.push(Object.freeze({
                id: `${owner.ownerId}:bundle:${bundleKey}:flow:${layer.key}`,
                ownerId: owner.ownerId,
                key: bundleKey,
                item: network.item,
                network,
                source,
                interactive,
                sourceName: network.sourceName,
                signature: stableValue({ route: network.routeSignature, layer: layer.key }),
            }))
        })
        first.geometries.filter(layer => layer.scope === 'network').forEach(layer => {
            const source = (layer.factory as any)(networkContext(network))
            if (!isGeometrySource(source)) throw new TypeError(`Connector bundle geometry '${bundleKey}' must return a GeometrySource.`)
            geometries.push(makeGeometryRecord(
                owner, first, network, source, interactive, `bundle:${bundleKey}:geometry:${layer.key}`,
            ))
        })
    }
}

function bundlePath(ownerId: string, key: string, members: readonly ResolvedConnectorNetwork[]): ResolvedConnectorNetwork {
    const first = members[0]
    const junctionGroups = new Map<string, ConnectorRouteJunction[]>()
    members.flatMap(path => path.junctions).forEach(junction => {
        const signature = pointSignature(junction.point)
        const group = junctionGroups.get(signature) ?? []
        group.push(junction)
        junctionGroups.set(signature, group)
    })
    const junctionKeyBySource = new Map<string, string>()
    const junctions = Object.freeze([...junctionGroups.values()].map(group => {
        const memberKeys = Object.freeze([...new Set(group.flatMap(junction => junction.memberKeys))].sort())
        const bundleKey = `bundle:${key}:junction:${group.map(junction => junction.key).sort().join('+')}`
        group.forEach(junction => junctionKeyBySource.set(junction.key, bundleKey))
        return Object.freeze({
            key: bundleKey,
            kind: group.every(junction => junction.kind === 'terminal') ? 'terminal' as const : 'junction' as const,
            point: Object.freeze(group[0].point.clone()),
            memberKeys,
        })
    }))
    const runGroups = new Map<string, ConnectorRouteRun[]>()
    members.flatMap(path => path.runs).forEach(run => {
        const forward = run.points.map(pointSignature).join('>')
        const reverse = [...run.points].reverse().map(pointSignature).join('>')
        const signature = forward < reverse ? forward : reverse
        const group = runGroups.get(signature) ?? []
        group.push(run)
        runGroups.set(signature, group)
    })
    const runKeyBySource = new Map<string, string>()
    const runs = Object.freeze([...runGroups.values()].map(group => {
        const memberKeys = Object.freeze([...new Set(group.flatMap(run => run.memberKeys))].sort())
        const bundleRunKey = `bundle:${key}:run:${group.map(run => run.key).sort().join('+')}`
        group.forEach(run => runKeyBySource.set(run.key, bundleRunKey))
        return Object.freeze({
            key: bundleRunKey,
            role: group[0].role,
            memberKeys,
            points: group[0].points,
            fromJunctionKey: junctionKeyBySource.get(group[0].fromJunctionKey)!,
            toJunctionKey: junctionKeyBySource.get(group[0].toJunctionKey)!,
        })
    }))
    const traversals = Object.freeze(members.flatMap(path => path.traversals).map(traversal => Object.freeze({
        ...traversal,
        runKeys: Object.freeze(traversal.runKeys.map(runKey => runKeyBySource.get(runKey)!)),
    })))
    return Object.freeze({
        ownerId,
        key,
        item: first.item,
        items: Object.freeze(members.flatMap(path => path.items)),
        topology: 'bundle',
        memberKeys: Object.freeze(members.flatMap(path => path.memberKeys)),
        fromReference: first.fromReference,
        toReferences: Object.freeze(members.flatMap(path => path.toReferences)),
        from: first.from,
        to: Object.freeze(members.flatMap(path => path.to)),
        runs,
        junctions,
        traversals,
        totalLength: members.reduce((sum, path) => sum + path.totalLength, 0),
        scale: first.scale,
        routeSignature: stableValue(members.map(path => path.routeSignature)),
        sourceName: first.sourceName,
    })
}

function pointSignature(point: THREE.Vector3): string {
    return `${point.x},${point.y},${point.z}`
}

function endpointNodeId(endpoint: ConnectorEndpoint): string | undefined {
    if (typeof endpoint === 'string') return endpoint
    return 'node' in endpoint ? endpoint.node : endpoint.space && endpoint.space !== 'world' ? endpoint.space.node : undefined
}

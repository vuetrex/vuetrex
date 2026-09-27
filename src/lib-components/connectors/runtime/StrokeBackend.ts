import * as THREE from 'three'
import type { ConnectorDecorationRecord } from '@/lib-components/connectors/compiler/types.js'
import type {
    ConnectorAppearanceBackend,
    ConnectorBundleHit,
    ConnectorEdgeHit,
    ConnectorHit,
} from '@/lib-components/connectors/types.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { connectorPathPosition } from '@/lib-components/connectors/runtime/hit.js'

interface StrokeEntry {
    readonly record: ConnectorDecorationRecord
    readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
}

const EPSILON = 1e-10
const ARROW_DEPTH_IN_WIDTHS = 2

/** Keyed, static stroke realization. It allocates nothing on stable-key reorder. */
export class StrokeBackend implements ConnectorAppearanceBackend<ConnectorDecorationRecord> {
    readonly group = new THREE.Group()
    private readonly entries = new Map<string, StrokeEntry>()
    private readonly byObject = new WeakMap<THREE.Object3D, ConnectorDecorationRecord>()
    private updates = 0
    private allocations = 0

    constructor(private readonly stage: VuetrexStage) {
        this.group.name = 'vx-connector-strokes'
        this.group.userData.vxConnectorOutput = true
        stageScene(stage).add(this.group)
    }

    reconcile(records: readonly ConnectorDecorationRecord[]): void {
        const visible = records.filter(record => record.style.opacity > 0)
        const nextIds = new Set(visible.map(record => record.id))
        for (const [id, entry] of this.entries) {
            if (nextIds.has(id)) continue
            this.removeEntry(entry)
            this.entries.delete(id)
        }

        for (const record of visible) {
            const current = this.entries.get(record.id)
            if (current?.record.signature === record.signature
                && current.record.interactive === record.interactive) continue
            if (current) this.removeEntry(current)
            const entry = this.createEntry(record)
            this.entries.set(record.id, entry)
            this.updates++
        }
    }

    hitAt(object: THREE.Object3D, _instanceId?: number, intersection?: THREE.Intersection): ConnectorHit | undefined {
        const record = this.byObject.get(object)
        if (!record || !record.interactive) return undefined
        const point = intersection?.point.clone() ?? record.network.from.point.clone()
        if (record.bundleMemberKeys) {
            const progress = networkProgress(record.network.runs.map(run => run.points), point)
            const hit: ConnectorBundleHit = Object.freeze({
                kind: 'bundle',
                key: record.key,
                part: 'bundle',
                memberKeys: record.bundleMemberKeys,
                point: tuple(point),
                pathPosition: progress,
                sourceName: record.sourceName,
            })
            return hit
        }
        const hit: ConnectorEdgeHit = Object.freeze({
            kind: 'edge',
            key: record.key,
            item: record.item,
            part: 'stroke',
            point: tuple(point),
            pathPosition: connectorPathPosition(record.network, point),
            sourceName: record.sourceName,
        })
        return hit
    }

    diagnostics(): { readonly entries: number; readonly updates: number; readonly allocations: number } {
        return Object.freeze({ entries: this.entries.size, updates: this.updates, allocations: this.allocations })
    }

    objectFor(id: string): THREE.Object3D | undefined {
        return this.entries.get(id)?.mesh
    }

    dispose(): void {
        for (const entry of this.entries.values()) this.removeEntry(entry)
        this.entries.clear()
        this.group.removeFromParent()
    }

    private createEntry(record: ConnectorDecorationRecord): StrokeEntry {
        const width = Math.max(0.001, record.style.width ?? this.stage.boxDistance * 0.032)
        const vertices: number[] = []
        const firstPart = record.network.traversals[0]
        const arrowDepth = width * ARROW_DEPTH_IN_WIDTHS
        const startRun = record.style.markerStart === 'arrow' ? firstPart?.runKeys[0] : undefined
        const endRuns = new Set(record.style.markerEnd === 'arrow'
            ? record.network.traversals.map(part => part.runKeys.at(-1)) : [])
        for (const part of record.network.runs) {
            appendPolyline(vertices, part.points, width, record.style.offset, record.style.dash,
                part.key === startRun ? arrowDepth : 0,
                endRuns.has(part.key) ? arrowDepth : 0)
        }
        if (firstPart && record.style.markerStart && record.style.markerStart !== 'none') {
            appendMarker(
                vertices,
                record.style.markerStart,
                firstPart.points[0],
                firstPart.points[1]?.clone().sub(firstPart.points[0]).negate(),
                width,
                record.style.offset,
            )
        }
        for (const part of record.network.traversals) {
            if (part.points.length < 2 || !record.style.markerEnd || record.style.markerEnd === 'none') continue
            const end = part.points.length - 1
            appendMarker(
                vertices,
                record.style.markerEnd,
                part.points[end],
                part.points[end]?.clone().sub(part.points[end - 1]),
                width,
                record.style.offset,
            )
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        const material = new THREE.MeshBasicMaterial({
            color: record.style.color ?? this.stage.settings.connectorColor ?? 0xa0ffff,
            opacity: record.style.opacity,
            transparent: record.style.opacity < 1,
            depthTest: record.style.depthTest,
            side: THREE.DoubleSide,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.name = `vx-connector-${record.ownerId}-${record.key}`
        mesh.renderOrder = record.layerIndex
        mesh.userData.vxConnectorOutput = true
        mesh.userData.vxConnectorOwner = record.interactive ? record.ownerId : undefined
        mesh.userData.vxConnectorKey = record.key
        mesh.userData.vxConnectorPart = record.bundleMemberKeys ? 'bundle' : 'stroke'
        mesh.userData.vxBloomEffects = record.style.effects
        this.byObject.set(mesh, record)
        this.group.add(mesh)
        this.allocations++
        return { record, mesh }
    }

    private removeEntry(entry: StrokeEntry): void {
        entry.mesh.removeFromParent()
        entry.mesh.geometry.dispose()
        entry.mesh.material.dispose()
    }
}

function networkProgress(polylines: readonly (readonly THREE.Vector3[])[], point: THREE.Vector3): number {
    let total = 0
    let nearestDistance = Infinity
    let nearestAlong = 0
    const projected = new THREE.Vector3()
    for (const points of polylines) {
        for (let index = 1; index < points.length; index++) {
            const start = points[index - 1]
            const end = points[index]
            const length = start.distanceTo(end)
            new THREE.Line3(start, end).closestPointToPoint(point, true, projected)
            const distance = projected.distanceToSquared(point)
            if (distance < nearestDistance) {
                nearestDistance = distance
                nearestAlong = total + start.distanceTo(projected)
            }
            total += length
        }
    }
    return total <= EPSILON ? 0 : THREE.MathUtils.clamp(nearestAlong / total, 0, 1)
}

function stageScene(stage: VuetrexStage): THREE.Scene {
    return typeof stage.getScene === 'function' ? stage.getScene() : stage.scene
}

function appendPolyline(
    vertices: number[],
    points: readonly THREE.Vector3[],
    width: number,
    offset: number,
    dash: readonly [number, number] | false,
    trimStart = 0,
    trimEnd = 0,
): void {
    let length = 0
    for (let index = 1; index < points.length; index++) length += points[index - 1].distanceTo(points[index])
    const visibleEnd = length - trimEnd
    if (visibleEnd <= trimStart) return
    let distance = 0
    for (let index = 1; index < points.length; index++) {
        const from = points[index - 1], to = points[index]
        const segmentLength = from.distanceTo(to)
        if (segmentLength > EPSILON) {
            const direction = to.clone().sub(from).multiplyScalar(1 / segmentLength)
            // Clip the original dash spans, so reserving marker space never shifts the dash pattern.
            for (const [start, end] of dashSpans(from, to, dash)) {
                const startDistance = Math.max(distance + from.distanceTo(start), trimStart)
                const endDistance = Math.min(distance + from.distanceTo(end), visibleEnd)
                if (endDistance <= startDistance) continue
                appendRibbon(vertices,
                    from.clone().addScaledVector(direction, startDistance - distance),
                    from.clone().addScaledVector(direction, endDistance - distance), width, offset)
            }
        }
        distance += segmentLength
    }
}

function ribbonSide(tangent: THREE.Vector3): THREE.Vector3 {
    const side = new THREE.Vector3(0, 1, 0).cross(tangent)
    if (side.lengthSq() <= EPSILON) side.copy(new THREE.Vector3(1, 0, 0).cross(tangent))
    return side.normalize()
}

function appendRibbon(
    vertices: number[],
    startValue: THREE.Vector3,
    endValue: THREE.Vector3,
    width: number,
    offset: number,
): void {
    const start = startValue.clone().add(new THREE.Vector3(0, offset, 0))
    const end = endValue.clone().add(new THREE.Vector3(0, offset, 0))
    const tangent = end.clone().sub(start)
    if (tangent.lengthSq() <= EPSILON) return
    tangent.normalize()
    const side = ribbonSide(tangent).multiplyScalar(width / 2)
    const a = start.clone().add(side)
    const b = start.clone().sub(side)
    const c = end.clone().sub(side)
    const d = end.clone().add(side)
    pushTriangle(vertices, a, b, c)
    pushTriangle(vertices, a, c, d)
}

function dashSpans(
    start: THREE.Vector3,
    end: THREE.Vector3,
    dash: readonly [number, number] | false,
): Array<readonly [THREE.Vector3, THREE.Vector3]> {
    if (!dash) return [[start, end]]
    const length = start.distanceTo(end)
    if (length <= EPSILON) return []
    const [draw, gap] = dash
    const period = draw + gap
    if (period <= EPSILON) return [[start, end]]
    const direction = end.clone().sub(start).multiplyScalar(1 / length)
    const result: Array<readonly [THREE.Vector3, THREE.Vector3]> = []
    for (let distance = 0; distance < length; distance += period) {
        result.push([
            start.clone().addScaledVector(direction, distance),
            start.clone().addScaledVector(direction, Math.min(length, distance + draw)),
        ])
    }
    return result
}

function appendMarker(
    vertices: number[],
    kind: 'arrow' | 'dot' | 'diamond',
    point: THREE.Vector3,
    rawTangent: THREE.Vector3 | undefined,
    width: number,
    offset: number,
): void {
    const tangent = rawTangent?.lengthSq() ? rawTangent.clone().normalize() : new THREE.Vector3(1, 0, 0)
    const side = ribbonSide(tangent)
    if (kind === 'arrow') {
        const tip = point.clone().add(new THREE.Vector3(0, offset, 0))
        const base = tip.clone().addScaledVector(tangent, -width * ARROW_DEPTH_IN_WIDTHS)
        side.multiplyScalar(width * 1.2)
        pushTriangle(vertices, tip, base.clone().add(side), base.clone().sub(side))
        return
    }
    const length = width * (kind === 'dot' ? 2.2 : 8)
    const center = point.clone()
        .add(new THREE.Vector3(0, offset, 0))
        .addScaledVector(tangent, -length * 0.25)
    const halfWidth = width * 1.5
    const tip = center.clone().addScaledVector(tangent, length / 2)
    const back = center.clone().addScaledVector(tangent, -length * 0.75)
    const left = center.clone().addScaledVector(side, halfWidth)
    const right = center.clone().addScaledVector(side, -halfWidth)
    pushTriangle(vertices, tip, left, back)
    pushTriangle(vertices, tip, back, right)
}

function pushTriangle(vertices: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
}

function tuple(point: THREE.Vector3): readonly [number, number, number] {
    return Object.freeze([point.x, point.y, point.z])
}

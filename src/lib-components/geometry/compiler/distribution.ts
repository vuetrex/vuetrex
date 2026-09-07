import * as THREE from 'three'
import type {
    CustomDistribution,
    GeometryItemKey,
    GeometryPlacement,
    GeometrySet,
    GridDistribution,
    ItemDistribution,
    LineDistribution,
    PointDistribution,
    RotationLike,
    ScaleLike,
    SurfaceDistribution,
    Vector3Like,
} from '@/lib-components/geometry/types.js'
import { keyedRandom } from '@/lib-components/geometry/random.js'
import { directionQuaternion, toQuaternion, toScale3, toVector3 } from '@/lib-components/geometry/values.js'

export interface EvaluatedPlacement<Item = unknown> {
    key: string
    index: number
    item: Item
    position: THREE.Vector3
    normal?: THREE.Vector3
    tangent?: THREE.Vector3
    matrix: THREE.Matrix4
}

function itemValue<Item, Value>(
    value: Value | ((item: Item, index: number) => Value) | undefined,
    item: Item,
    index: number,
): Value | undefined {
    return typeof value === 'function'
        ? (value as (item: Item, index: number) => Value)(item, index)
        : value
}

function semanticKey<Item>(item: Item, index: number, keyBy?: GeometryItemKey<Item>): string {
    if (typeof keyBy === 'function') return String(keyBy(item, index))
    if (keyBy !== undefined && item && typeof item === 'object') {
        const value = (item as Record<PropertyKey, unknown>)[keyBy as PropertyKey]
        if (value !== undefined && value !== null && value !== '') return String(value)
    }
    if (item && typeof item === 'object' && 'id' in item) {
        const value = (item as Record<string, unknown>).id
        if (value !== undefined && value !== null && value !== '') return String(value)
    }
    return String(index)
}

function placementMatrix(options: {
    position: THREE.Vector3
    direction?: Vector3Like
    rotation?: RotationLike
    scale?: ScaleLike
}): THREE.Matrix4 {
    const orientation = directionQuaternion(options.direction)
    if (options.rotation !== undefined) orientation.multiply(toQuaternion(options.rotation))
    return new THREE.Matrix4().compose(options.position, orientation, toScale3(options.scale))
}

function fromPlacement<Item>(
    placement: GeometryPlacement<Item>,
    index: number,
    fallbackItem?: Item,
): EvaluatedPlacement<Item | undefined> {
    const position = toVector3(placement.position)
    const normal = placement.normal === undefined ? undefined : toVector3(placement.normal).normalize()
    const tangent = placement.direction === undefined ? undefined : toVector3(placement.direction).normalize()
    return {
        key: String(placement.key ?? index),
        index,
        item: placement.item ?? fallbackItem,
        position,
        normal,
        tangent,
        matrix: placementMatrix({
            position,
            direction: placement.direction,
            rotation: placement.rotation,
            scale: placement.scale,
        }),
    }
}

function itemPlacements<Item>(options: ItemDistribution<Item>): EvaluatedPlacement<Item>[] {
    const seen = new Set<string>()
    return options.items.map((item, index) => {
        const key = semanticKey(item, index, options.keyBy)
        if (seen.has(key)) throw new Error(`Procedural distribution requires unique keys; duplicate key: ${key}`)
        seen.add(key)
        const position = toVector3(itemValue(options.position, item, index))
        const direction = itemValue(options.direction, item, index)
        const normalValue = itemValue(options.normal, item, index)
        const normal = normalValue === undefined ? undefined : toVector3(normalValue).normalize()
        const tangent = direction === undefined ? undefined : toVector3(direction).normalize()
        const rotation = itemValue(options.rotation, item, index)
        const scale = itemValue(options.scale, item, index)
        return {
            key,
            index,
            item,
            position,
            normal,
            tangent,
            matrix: placementMatrix({ position, direction, rotation, scale }),
        }
    })
}

function pointPlacements<Item>(options: PointDistribution<Item>): EvaluatedPlacement<Item | undefined>[] {
    return options.points.map((point, index) => {
        if (point && typeof point === 'object' && 'position' in point && !(point as unknown as THREE.Vector3).isVector3) {
            return fromPlacement(point as GeometryPlacement<Item>, index)
        }
        return fromPlacement({ position: point as Vector3Like }, index)
    })
}

function samplePolyline(points: readonly THREE.Vector3[], unit: number): { position: THREE.Vector3; tangent: THREE.Vector3 } {
    if (points.length < 2) return { position: points[0]?.clone() ?? new THREE.Vector3(), tangent: new THREE.Vector3(0, 1, 0) }
    const lengths: number[] = []
    let total = 0
    for (let index = 0; index < points.length - 1; index++) {
        const length = points[index].distanceTo(points[index + 1])
        lengths.push(length)
        total += length
    }
    let target = THREE.MathUtils.clamp(unit, 0, 1) * total
    for (let index = 0; index < lengths.length; index++) {
        if (target <= lengths[index] || index === lengths.length - 1) {
            const segmentUnit = lengths[index] <= 1e-12 ? 0 : target / lengths[index]
            return {
                position: points[index].clone().lerp(points[index + 1], segmentUnit),
                tangent: points[index + 1].clone().sub(points[index]).normalize(),
            }
        }
        target -= lengths[index]
    }
    return { position: points[points.length - 1].clone(), tangent: new THREE.Vector3(0, 1, 0) }
}

function linePlacements(options: LineDistribution): EvaluatedPlacement[] {
    const count = Math.max(0, Math.floor(options.count))
    const points = options.points && options.points.length >= 2
        ? options.points.map(point => toVector3(point))
        : [toVector3(options.start), toVector3(options.end, new THREE.Vector3(0, 1, 0))]
    return Array.from({ length: count }, (_, index) => {
        const unit = options.includeEndpoints === false
            ? (index + 1) / (count + 1)
            : count <= 1 ? 0.5 : index / (count - 1)
        const sample = samplePolyline(points, unit)
        const direction = options.align === 'tangent' ? sample.tangent : undefined
        return {
            key: String(index),
            index,
            item: undefined,
            position: sample.position,
            tangent: sample.tangent,
            matrix: placementMatrix({ position: sample.position, direction }),
        }
    })
}

function gridPlacements(options: GridDistribution): EvaluatedPlacement[] {
    const count = typeof options.count !== 'number'
        ? [Math.max(0, Math.floor(options.count[0])), Math.max(0, Math.floor(options.count[1]))] as const
        : (() => {
            const total = Math.max(0, Math.floor(options.count))
            const x = Math.ceil(Math.sqrt(total))
            return [x, x === 0 ? 0 : Math.ceil(total / x)] as const
        })()
    const limit = typeof options.count !== 'number' ? count[0] * count[1] : Math.max(0, Math.floor(options.count))
    const spacing = typeof options.spacing === 'number'
        ? [options.spacing, options.spacing] as const
        : options.spacing ?? [1, 1] as const
    const center = toVector3(options.center)
    const placements: EvaluatedPlacement[] = []
    for (let z = 0; z < count[1]; z++) {
        for (let x = 0; x < count[0] && placements.length < limit; x++) {
            const index = placements.length
            const position = center.clone().add(new THREE.Vector3(
                (x - (count[0] - 1) / 2) * spacing[0],
                0,
                (z - (count[1] - 1) / 2) * spacing[1],
            ))
            placements.push({
                key: `${x}:${z}`,
                index,
                item: undefined,
                position,
                matrix: placementMatrix({ position }),
            })
        }
    }
    return placements
}

interface SurfaceTriangle {
    a: THREE.Vector3
    b: THREE.Vector3
    c: THREE.Vector3
    normal: THREE.Vector3
    cumulativeArea: number
}

function surfaceTriangles(surface: GeometrySet): { triangles: SurfaceTriangle[]; totalArea: number } {
    const triangles: SurfaceTriangle[] = []
    let totalArea = 0
    for (const record of surface.records) {
        if (!record.visible || record.prototype.topology !== 'mesh') continue
        const geometry = record.prototype.geometry
        const position = geometry.getAttribute('position')
        if (!position) continue
        const index = geometry.getIndex()
        const triangleCount = index ? index.count / 3 : position.count / 3
        for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
            const ia = index ? index.getX(triangleIndex * 3) : triangleIndex * 3
            const ib = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1
            const ic = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2
            const a = new THREE.Vector3().fromBufferAttribute(position, ia).applyMatrix4(record.matrix)
            const b = new THREE.Vector3().fromBufferAttribute(position, ib).applyMatrix4(record.matrix)
            const c = new THREE.Vector3().fromBufferAttribute(position, ic).applyMatrix4(record.matrix)
            const cross = b.clone().sub(a).cross(c.clone().sub(a))
            const area = cross.length() / 2
            if (area <= 1e-12) continue
            totalArea += area
            triangles.push({ a, b, c, normal: cross.normalize(), cumulativeArea: totalArea })
        }
    }
    return { triangles, totalArea }
}

function surfacePlacements(options: SurfaceDistribution, surface: GeometrySet): EvaluatedPlacement[] {
    const count = Math.max(0, Math.floor(options.count))
    const seed = options.seed ?? 0
    const { triangles, totalArea } = surfaceTriangles(surface)
    if (triangles.length === 0 || totalArea <= 0) return []

    return Array.from({ length: count }, (_, index) => {
        const key = String(index)
        const areaTarget = keyedRandom(seed, key, 'triangle') * totalArea
        const triangle = triangles.find(candidate => areaTarget <= candidate.cumulativeArea) ?? triangles[triangles.length - 1]
        const root = Math.sqrt(keyedRandom(seed, key, 'barycentric-u'))
        const second = keyedRandom(seed, key, 'barycentric-v')
        const wa = 1 - root
        const wb = root * (1 - second)
        const wc = root * second
        const position = triangle.a.clone().multiplyScalar(wa)
            .addScaledVector(triangle.b, wb)
            .addScaledVector(triangle.c, wc)
        const normal = triangle.normal.clone()
        return {
            key,
            index,
            item: undefined,
            position,
            normal,
            matrix: placementMatrix({
                position,
                direction: options.align === 'normal' ? normal : undefined,
            }),
        }
    })
}

export function evaluateDistribution(
    parameters: Record<string, unknown>,
    surface?: GeometrySet,
): EvaluatedPlacement[] {
    if ('items' in parameters) return itemPlacements(parameters as unknown as ItemDistribution)
    if (parameters.pattern === 'line') return linePlacements(parameters as unknown as LineDistribution)
    if (parameters.pattern === 'grid') return gridPlacements(parameters as unknown as GridDistribution)
    if (parameters.pattern === 'custom') {
        const custom = parameters as unknown as CustomDistribution
        const count = Math.max(0, Math.floor(custom.count))
        return Array.from({ length: count }, (_, index) => fromPlacement(custom.placement(index, count), index))
    }
    if (parameters.pattern === 'surface') {
        return surfacePlacements(parameters as unknown as SurfaceDistribution, surface ?? { records: [] })
    }
    return pointPlacements(parameters as unknown as PointDistribution)
}

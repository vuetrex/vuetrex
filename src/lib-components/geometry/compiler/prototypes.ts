import * as THREE from 'three'
import type {
    BoxParameters,
    GeometryPrototype,
    GeometryParameterValues,
    GeometrySource,
    IcosphereParameters,
    LineParameters,
    PlaneParameters,
} from '@/lib-components/geometry/types.js'
import { resolveGeometryValue } from '@/lib-components/geometry/parameters.js'
import { finiteNumber, integer, toVector3 } from '@/lib-components/geometry/values.js'

interface PrototypeEntry {
    prototype: GeometryPrototype
    generation: number
}

interface PrototypeDescription {
    signature: string
    topology: 'mesh' | 'line'
    create: () => THREE.BufferGeometry
}

function numberSignature(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toPrecision(12)
}

function linePoints(parameters: LineParameters, values: GeometryParameterValues): THREE.Vector3[] {
    const configuredPoints = resolveGeometryValue(parameters.points, values)
    if (configuredPoints && configuredPoints.length >= 2) {
        return configuredPoints.map(point => toVector3(point))
    }
    const length = finiteNumber(resolveGeometryValue(parameters.length, values), 1, 0)
    return [new THREE.Vector3(), new THREE.Vector3(0, length, 0)]
}

function lineCurve(
    points: readonly THREE.Vector3[],
    mode: LineParameters['path'],
    closed: boolean,
): THREE.Curve<THREE.Vector3> {
    if (points.length === 2) return new THREE.LineCurve3(points[0], points[1])
    if (mode === 'smooth') return new THREE.CatmullRomCurve3([...points], closed, 'centripetal')

    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let index = 0; index < points.length - 1; index++) {
        path.add(new THREE.LineCurve3(points[index], points[index + 1]))
    }
    if (closed) path.add(new THREE.LineCurve3(points[points.length - 1], points[0]))
    return path
}

function describeLine(parameters: LineParameters, values: GeometryParameterValues): PrototypeDescription {
    const points = linePoints(parameters, values)
    const closed = parameters.closed === true
    const thickness = finiteNumber(resolveGeometryValue(parameters.thickness, values), 0, 0)
    const pointSignature = points.map(point => point.toArray().map(numberSignature).join(',')).join(';')
    if (thickness <= 0) {
        const renderedPoints = closed ? [...points, points[0]] : points
        return {
            signature: `line:thin:${closed}:${pointSignature}`,
            topology: 'line',
            create: () => new THREE.BufferGeometry().setFromPoints(renderedPoints),
        }
    }

    const radialSegments = integer(resolveGeometryValue(parameters.radialSegments, values), 8, 3)
    const tubularSegments = integer(
        resolveGeometryValue(parameters.tubularSegments, values),
        Math.max(8, (points.length - 1) * 8),
        1,
    )
    const pathMode = parameters.path ?? 'polyline'
    return {
        signature: [
            'line:pipe', pathMode, String(closed), numberSignature(thickness),
            String(tubularSegments), String(radialSegments), pointSignature,
        ].join(':'),
        topology: 'mesh',
        create: () => new THREE.TubeGeometry(
                lineCurve(points, pathMode, closed),
                tubularSegments,
                thickness,
                radialSegments,
                closed,
            ),
    }
}

function describePlane(parameters: PlaneParameters, values: GeometryParameterValues): PrototypeDescription {
    const width = finiteNumber(resolveGeometryValue(parameters.width, values), 1, 0.000001)
    const depth = finiteNumber(resolveGeometryValue(parameters.depth, values), 1, 0.000001)
    const widthSegments = integer(resolveGeometryValue(parameters.widthSegments, values), 1, 1)
    const depthSegments = integer(resolveGeometryValue(parameters.depthSegments, values), 1, 1)
    return {
        signature: `plane:${numberSignature(width)}:${numberSignature(depth)}:${widthSegments}:${depthSegments}`,
        topology: 'mesh',
        create: () => {
            const geometry = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments)
            geometry.rotateX(-Math.PI / 2)
            return geometry
        },
    }
}

function describeBox(parameters: BoxParameters, values: GeometryParameterValues): PrototypeDescription {
    const width = finiteNumber(resolveGeometryValue(parameters.width, values), 1, 0.000001)
    const height = finiteNumber(resolveGeometryValue(parameters.height, values), 1, 0.000001)
    const depth = finiteNumber(resolveGeometryValue(parameters.depth, values), 1, 0.000001)
    const widthSegments = integer(resolveGeometryValue(parameters.widthSegments, values), 1, 1)
    const heightSegments = integer(resolveGeometryValue(parameters.heightSegments, values), 1, 1)
    const depthSegments = integer(resolveGeometryValue(parameters.depthSegments, values), 1, 1)
    return {
        signature: [
            'box', numberSignature(width), numberSignature(height), numberSignature(depth),
            String(widthSegments), String(heightSegments), String(depthSegments),
        ].join(':'),
        topology: 'mesh',
        create: () => new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments),
    }
}

function describeIcosphere(parameters: IcosphereParameters, values: GeometryParameterValues): PrototypeDescription {
    const radius = finiteNumber(resolveGeometryValue(parameters.radius, values), 1, 0.000001)
    const detail = integer(resolveGeometryValue(parameters.detail, values), 0, 0)
    return {
        signature: `icosphere:${numberSignature(radius)}:${detail}`,
        topology: 'mesh',
        create: () => new THREE.IcosahedronGeometry(radius, detail),
    }
}

interface SharedPrototypeEntry {
    prototype: GeometryPrototype
    references: number
}

export class GeometryPrototypePool {
    private readonly entries = new Map<string, SharedPrototypeEntry>()
    private creations = 0

    acquire(description: PrototypeDescription): GeometryPrototype {
        const existing = this.entries.get(description.signature)
        if (existing) {
            existing.references++
            return existing.prototype
        }
        const geometry = description.create()
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()
        const prototype = Object.freeze({
            signature: description.signature,
            topology: description.topology,
            geometry,
        })
        this.entries.set(description.signature, { prototype, references: 1 })
        this.creations++
        return prototype
    }

    release(signature: string): void {
        const entry = this.entries.get(signature)
        if (!entry) return
        entry.references--
        if (entry.references > 0) return
        entry.prototype.geometry.dispose()
        this.entries.delete(signature)
    }

    get size(): number {
        return this.entries.size
    }

    get creationCount(): number {
        return this.creations
    }
}

const sharedPools = new WeakMap<object, GeometryPrototypePool>()

export function geometryPrototypePoolFor(owner: object): GeometryPrototypePool {
    let pool = sharedPools.get(owner)
    if (!pool) {
        pool = new GeometryPrototypePool()
        sharedPools.set(owner, pool)
    }
    return pool
}

export class GeometryPrototypeRegistry {
    private readonly entries = new Map<string, PrototypeEntry>()
    private generation = 0

    constructor(readonly pool = new GeometryPrototypePool()) {}

    beginCompilation(): void {
        this.generation++
    }

    resolve(source: GeometrySource, values: GeometryParameterValues = {}): GeometryPrototype {
        let description: PrototypeDescription
        switch (source.kind) {
            case 'line': description = describeLine(source.parameters as LineParameters, values); break
            case 'plane': description = describePlane(source.parameters as PlaneParameters, values); break
            case 'box': description = describeBox(source.parameters as BoxParameters, values); break
            case 'icosphere': description = describeIcosphere(source.parameters as IcosphereParameters, values); break
            default: throw new Error(`'${source.kind}' is not a procedural geometry primitive.`)
        }

        const existing = this.entries.get(description.signature)
        if (existing) {
            existing.generation = this.generation
            return existing.prototype
        }
        const prototype = this.pool.acquire(description)
        this.entries.set(description.signature, { prototype, generation: this.generation })
        return prototype
    }

    endCompilation(): void {
        for (const [signature, entry] of this.entries) {
            if (entry.generation === this.generation) continue
            this.pool.release(signature)
            this.entries.delete(signature)
        }
    }

    dispose(): void {
        for (const signature of this.entries.keys()) this.pool.release(signature)
        this.entries.clear()
    }

    get size(): number {
        return this.entries.size
    }

    get sharedSize(): number {
        return this.pool.size
    }

    get sharedCreationCount(): number {
        return this.pool.creationCount
    }
}

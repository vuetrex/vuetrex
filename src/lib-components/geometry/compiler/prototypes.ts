import * as THREE from 'three'
import type {
    BoxParameters,
    GeometryPrototype,
    GeometrySource,
    IcosphereParameters,
    LineParameters,
    PlaneParameters,
} from '@/lib-components/geometry/types.js'
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

function linePoints(parameters: LineParameters): THREE.Vector3[] {
    if (parameters.points && parameters.points.length >= 2) {
        return parameters.points.map(point => toVector3(point))
    }
    const length = finiteNumber(parameters.length, 1, 0)
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

function describeLine(parameters: LineParameters): PrototypeDescription {
    const points = linePoints(parameters)
    const closed = parameters.closed === true
    const thickness = finiteNumber(parameters.thickness, 0, 0)
    const pointSignature = points.map(point => point.toArray().map(numberSignature).join(',')).join(';')
    if (thickness <= 0) {
        const renderedPoints = closed ? [...points, points[0]] : points
        return {
            signature: `line:thin:${closed}:${pointSignature}`,
            topology: 'line',
            create: () => new THREE.BufferGeometry().setFromPoints(renderedPoints),
        }
    }

    const radialSegments = integer(parameters.radialSegments, 8, 3)
    const tubularSegments = integer(
        parameters.tubularSegments,
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

function describePlane(parameters: PlaneParameters): PrototypeDescription {
    const width = finiteNumber(parameters.width, 1, 0.000001)
    const depth = finiteNumber(parameters.depth, 1, 0.000001)
    const widthSegments = integer(parameters.widthSegments, 1, 1)
    const depthSegments = integer(parameters.depthSegments, 1, 1)
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

function describeBox(parameters: BoxParameters): PrototypeDescription {
    const width = finiteNumber(parameters.width, 1, 0.000001)
    const height = finiteNumber(parameters.height, 1, 0.000001)
    const depth = finiteNumber(parameters.depth, 1, 0.000001)
    const widthSegments = integer(parameters.widthSegments, 1, 1)
    const heightSegments = integer(parameters.heightSegments, 1, 1)
    const depthSegments = integer(parameters.depthSegments, 1, 1)
    return {
        signature: [
            'box', numberSignature(width), numberSignature(height), numberSignature(depth),
            String(widthSegments), String(heightSegments), String(depthSegments),
        ].join(':'),
        topology: 'mesh',
        create: () => new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments),
    }
}

function describeIcosphere(parameters: IcosphereParameters): PrototypeDescription {
    const radius = finiteNumber(parameters.radius, 1, 0.000001)
    const detail = integer(parameters.detail, 0, 0)
    return {
        signature: `icosphere:${numberSignature(radius)}:${detail}`,
        topology: 'mesh',
        create: () => new THREE.IcosahedronGeometry(radius, detail),
    }
}

export class GeometryPrototypeRegistry {
    private readonly entries = new Map<string, PrototypeEntry>()
    private generation = 0

    beginCompilation(): void {
        this.generation++
    }

    resolve(source: GeometrySource): GeometryPrototype {
        let description: PrototypeDescription
        switch (source.kind) {
            case 'line': description = describeLine(source.parameters as LineParameters); break
            case 'plane': description = describePlane(source.parameters as PlaneParameters); break
            case 'box': description = describeBox(source.parameters as BoxParameters); break
            case 'icosphere': description = describeIcosphere(source.parameters as IcosphereParameters); break
            default: throw new Error(`'${source.kind}' is not a procedural geometry primitive.`)
        }

        const existing = this.entries.get(description.signature)
        if (existing) {
            existing.generation = this.generation
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
        this.entries.set(description.signature, { prototype, generation: this.generation })
        return prototype
    }

    endCompilation(): void {
        for (const [signature, entry] of this.entries) {
            if (entry.generation === this.generation) continue
            entry.prototype.geometry.dispose()
            this.entries.delete(signature)
        }
    }

    dispose(): void {
        for (const entry of this.entries.values()) entry.prototype.geometry.dispose()
        this.entries.clear()
    }

    get size(): number {
        return this.entries.size
    }
}

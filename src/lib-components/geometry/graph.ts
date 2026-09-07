import * as THREE from 'three'
import {
    GEOMETRY_GRAPH_NODE,
    type GeometryGraphNode,
    type GeometryInput,
    type GeometrySource,
} from '@/lib-components/geometry/types.js'

const functionIds = new WeakMap<Function, number>()
let functionSequence = 0

export function isGeometrySource(value: unknown): value is GeometrySource<any> {
    return Boolean(value && typeof value === 'object' && (value as GeometryGraphNode)[GEOMETRY_GRAPH_NODE] === true)
}

export function createGeometryNode<Parameters extends object, Item = unknown>(
    kind: string,
    inputs: Record<string, GeometryInput>,
    parameters: Parameters,
    key?: string,
): GeometryGraphNode<Parameters, Item> {
    for (const [inputName, input] of Object.entries(inputs)) {
        if (input === undefined) continue
        const sources = Array.isArray(input) ? input : [input]
        if (sources.some(source => !isGeometrySource(source))) {
            throw new TypeError(`Geometry node '${kind}' received an invalid '${inputName}' input.`)
        }
    }

    const node = {
        [GEOMETRY_GRAPH_NODE]: true as const,
        kind,
        ...(key ? { key } : {}),
        inputs: Object.freeze({ ...inputs }),
        parameters: Object.freeze({ ...parameters }),
    }
    return Object.freeze(node)
}

function valueSignature(value: unknown, visiting: WeakSet<object>): string {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'function') {
        let id = functionIds.get(value)
        if (id === undefined) {
            id = ++functionSequence
            functionIds.set(value, id)
        }
        return `function:${value.name || 'anonymous'}:${id}`
    }
    if (Array.isArray(value)) return `[${value.map(item => valueSignature(item, visiting)).join(',')}]`
    if (typeof value !== 'object') return String(value)
    if (visiting.has(value)) return '[cycle]'
    visiting.add(value)
    try {
        if ((value as THREE.Vector2).isVector2) return `v2:${(value as THREE.Vector2).toArray().join(',')}`
        if ((value as THREE.Vector3).isVector3) return `v3:${(value as THREE.Vector3).toArray().join(',')}`
        if ((value as THREE.Vector4).isVector4) return `v4:${(value as THREE.Vector4).toArray().join(',')}`
        if ((value as THREE.Euler).isEuler) {
            const euler = value as THREE.Euler
            return `e:${euler.x},${euler.y},${euler.z},${euler.order}`
        }
        if ((value as THREE.Quaternion).isQuaternion) return `q:${(value as THREE.Quaternion).toArray().join(',')}`
        if (isGeometrySource(value)) return geometryGraphSignature(value, visiting)
        const record = value as Record<string, unknown>
        return `{${Object.keys(record).sort().map(key => `${key}:${valueSignature(record[key], visiting)}`).join(',')}}`
    } finally {
        visiting.delete(value)
    }
}

export function geometryGraphSignature(source: GeometrySource<any>, visiting = new WeakSet<object>()): string {
    if (visiting.has(source)) throw new Error(`Cyclic procedural geometry graph detected at '${source.kind}'.`)
    visiting.add(source)
    try {
        const inputs = Object.keys(source.inputs).sort().map(name => {
            const input = source.inputs[name]
            if (Array.isArray(input)) {
                return `${name}:[${input.map(item => geometryGraphSignature(item, visiting)).join('|')}]`
            }
            return `${name}:${input ? geometryGraphSignature(input as GeometrySource<any>, visiting) : 'none'}`
        })
        return `${source.kind}${source.key ? `#${source.key}` : ''}(${valueSignature(source.parameters, visiting)})[${inputs.join(',')}]`
    } finally {
        visiting.delete(source)
    }
}

import * as THREE from 'three'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { isGeometrySource } from '@/lib-components/geometry/graph.js'
import { isGeometryParameter } from '@/lib-components/geometry/parameters.js'
import { isGeometryPointDomain } from '@/lib-components/geometry/points.js'
import type {
    GeometryParameterValues,
    GeometrySet,
    GeometrySource,
} from '@/lib-components/geometry/types.js'

export interface GeometryGraphNodeDescription {
    readonly id: string
    readonly kind: string
    readonly key?: string
    readonly inputs: Readonly<Record<string, string | readonly string[] | null>>
    readonly parameters: unknown
}

export interface GeometryGraphDescription {
    readonly root: string
    readonly nodes: readonly GeometryGraphNodeDescription[]
}

export interface GeometryBoundsDescription {
    readonly min: readonly [number, number, number]
    readonly max: readonly [number, number, number]
    readonly size: readonly [number, number, number]
}

export interface GeometryInspection {
    readonly graph: GeometryGraphDescription
    readonly recordCount: number
    readonly prototypeCount: number
    readonly materialKeys: readonly string[]
    readonly groups: readonly string[]
    readonly bounds: GeometryBoundsDescription | null
    readonly warnings: readonly string[]
}

export type GeometryUpdateKind = 'initial' | 'topology' | 'structure' | 'attributes' | 'unchanged' | 'empty'

export interface GeometryRuntimeDiagnostics extends GeometryInspection {
    readonly evaluationCount: number
    readonly evaluationMs: number
    readonly updateKind: GeometryUpdateKind
    readonly batchCount: number
    readonly localPrototypeCount: number
    readonly sharedPrototypeCount: number
    readonly topologyBuildCount: number
}

function serializedValue(value: unknown, visiting = new WeakSet<object>()): unknown {
    if (value === null || value === undefined || typeof value === 'string'
        || typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
    if (Array.isArray(value)) return value.map(item => serializedValue(item, visiting))
    if (typeof value !== 'object') return String(value)
    if (isGeometryParameter(value)) {
        return { parameter: value.name, fallback: serializedValue(value.fallback, visiting) }
    }
    if (isGeometryPointDomain(value)) {
        return { pointDomain: value.kind, parameters: serializedValue(value.parameters, visiting) }
    }
    if ((value as THREE.Vector2).isVector2 || (value as THREE.Vector3).isVector3
        || (value as THREE.Vector4).isVector4 || (value as THREE.Quaternion).isQuaternion) {
        return (value as THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | THREE.Quaternion).toArray()
    }
    if ((value as THREE.Euler).isEuler) {
        const euler = value as THREE.Euler
        return [euler.x, euler.y, euler.z, euler.order]
    }
    if (visiting.has(value)) return '[Circular]'
    visiting.add(value)
    try {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => [key, serializedValue(item, visiting)]))
    } finally {
        visiting.delete(value)
    }
}

export function describeGeometryGraph(source: GeometrySource): GeometryGraphDescription {
    if (!isGeometrySource(source)) throw new TypeError('describeGeometryGraph() requires a GeometrySource.')
    const ids = new WeakMap<GeometrySource, string>()
    const nodes: GeometryGraphNodeDescription[] = []
    const visiting = new WeakSet<GeometrySource>()
    let sequence = 0

    const visit = (node: GeometrySource): string => {
        if (visiting.has(node)) throw new Error(`Cyclic procedural geometry graph detected at '${node.kind}'.`)
        const known = ids.get(node)
        if (known) return known
        visiting.add(node)
        const id = `node-${++sequence}`
        ids.set(node, id)
        const inputs = Object.fromEntries(Object.entries(node.inputs).map(([name, input]) => {
            if (Array.isArray(input)) return [name, input.map(item => visit(item))]
            return [name, input ? visit(input as GeometrySource) : null]
        }))
        nodes.push(Object.freeze({
            id,
            kind: node.kind,
            ...(node.key ? { key: node.key } : {}),
            inputs: Object.freeze(inputs),
            parameters: serializedValue(node.parameters),
        }))
        visiting.delete(node)
        return id
    }

    const root = visit(source)
    return Object.freeze({ root, nodes: Object.freeze(nodes) })
}

/** Serialize the authored DAG as Graphviz DOT for visual inspection tools. */
export function geometryGraphToDot(source: GeometrySource): string {
    const graph = describeGeometryGraph(source)
    const lines = ['digraph ProceduralGeometry {', '  rankdir=LR;']
    for (const node of graph.nodes) {
        const label = `${node.kind}${node.key ? `\\n${node.key}` : ''}`.replaceAll('"', '\\"')
        lines.push(`  "${node.id}" [label="${label}"];`)
        for (const [inputName, input] of Object.entries(node.inputs)) {
            const inputIds = Array.isArray(input) ? input : input ? [input] : []
            for (const inputId of inputIds) {
                lines.push(`  "${inputId}" -> "${node.id}" [label="${inputName.replaceAll('"', '\\"')}"];`)
            }
        }
    }
    lines.push('}')
    return lines.join('\n')
}

export function boundsDescription(bounds: THREE.Box3): GeometryBoundsDescription | null {
    if (bounds.isEmpty()) return null
    return Object.freeze({
        min: bounds.min.toArray() as [number, number, number],
        max: bounds.max.toArray() as [number, number, number],
        size: bounds.getSize(new THREE.Vector3()).toArray() as [number, number, number],
    })
}

export function geometryWarnings(source: GeometrySource, set: GeometrySet): readonly string[] {
    const warnings: string[] = []
    if (set.records.length === 0) warnings.push('The graph evaluates to no records.')
    if (set.records.some(record => record.prototype.topology === 'line')) {
        warnings.push('Thin line records render separately and cannot participate in mesh baking.')
    }
    const visited = new WeakSet<GeometrySource>()
    const visit = (node: GeometrySource) => {
        if (visited.has(node)) return
        visited.add(node)
        if (node.kind === 'distribute') {
            const parameters = node.parameters as Record<string, unknown>
            const items = parameters.items
            if (Array.isArray(items) && parameters.keyBy === undefined && items.some(item =>
                item && typeof item === 'object' && !('id' in item),
            )) {
                warnings.push('An item distribution has object items without keyBy or id; record identity follows array indexes.')
            }
            const domain = parameters.domain
            if (isGeometryPointDomain(domain) && domain.kind === 'points') {
                const placements = domain.parameters.placements
                if (Array.isArray(placements) && placements.some(placement =>
                    placement && typeof placement === 'object' && !('key' in placement),
                )) {
                    warnings.push('An explicit point domain omits placement keys; record identity follows array indexes.')
                }
            }
        }
        for (const input of Object.values(node.inputs)) {
            if (Array.isArray(input)) input.forEach(visit)
            else if (input) visit(input as GeometrySource)
        }
    }
    visit(source)
    return Object.freeze([...new Set(warnings)])
}

export function inspectGeometry(
    source: GeometrySource,
    parameters: GeometryParameterValues = {},
): GeometryInspection {
    const prototypes = new GeometryPrototypeRegistry()
    prototypes.beginCompilation()
    try {
        const set = evaluateGeometry(source, prototypes, parameters)
        return Object.freeze({
            graph: describeGeometryGraph(source),
            recordCount: set.records.length,
            prototypeCount: new Set(set.records.map(record => record.prototype.signature)).size,
            materialKeys: Object.freeze([...new Set(set.records.map(record => record.materialKey))].sort()),
            groups: Object.freeze([...new Set(set.records.flatMap(record => record.groups))].sort()),
            bounds: boundsDescription(geometrySetBounds(set)),
            warnings: geometryWarnings(source, set),
        })
    } finally {
        prototypes.endCompilation()
        prototypes.dispose()
    }
}

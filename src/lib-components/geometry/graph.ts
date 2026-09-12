import * as THREE from 'three'
import {
    GEOMETRY_GRAPH_NODE,
    type DistributionOptions,
    type GeometryChain,
    type GeometryGraphNode,
    type GeometryInput,
    type GeometryNodeOptions,
    type GeometryPipeOperator,
    type GeometrySource,
    type GeometryValue,
    type JoinOptions,
    type MaterialChannelOptions,
    type NamedGeometryOptions,
    type ParameterMapOptions,
    type RandomizeOptions,
    type SurfaceDistribution,
    type TransformParameters,
} from '@/lib-components/geometry/types.js'
import { isGeometryParameter } from '@/lib-components/geometry/parameters.js'
import { isGeometryPointDomain } from '@/lib-components/geometry/points.js'

const functionIds = new WeakMap<Function, number>()
let functionSequence = 0

class GeometrySourceMethods<Item = unknown> implements GeometryChain<Item> {
    transform(options: TransformParameters = {}): GeometrySource<Item> {
        return transformGeometrySource(this as unknown as GeometrySource<Item>, options)
    }

    distribute<NextItem = unknown>(distribution: DistributionOptions<NextItem>): GeometrySource<NextItem> {
        return distributeGeometrySource(this as unknown as GeometrySource<Item>, distribution)
    }

    parameterMap(options: ParameterMapOptions<Item>): GeometrySource<Item> {
        return parameterMapGeometrySource(this as unknown as GeometrySource<Item>, options)
    }

    material(material: GeometryValue<string>, options: GeometryNodeOptions = {}): GeometrySource<Item> {
        return materialGeometrySource(this as unknown as GeometrySource<Item>, material, options)
    }

    named(name: GeometryValue<string>, options: GeometryNodeOptions = {}): GeometrySource<Item> {
        return namedGeometrySource(this as unknown as GeometrySource<Item>, name, options)
    }

    randomize(options: RandomizeOptions = {}): GeometrySource<Item> {
        return randomizeGeometrySource(this as unknown as GeometrySource<Item>, options)
    }

    join(
        source: GeometrySource<Item> | readonly GeometrySource<Item>[],
        options: JoinOptions = {},
    ): GeometrySource<Item> {
        const others = Array.isArray(source) ? source : [source]
        return joinGeometrySources([this as unknown as GeometrySource<Item>, ...others], options)
    }

    pipe<Output = Item>(operator: GeometryPipeOperator<Item, Output>): GeometrySource<Output> {
        if (typeof operator !== 'function') throw new TypeError('GeometrySource.pipe() requires an operator function.')
        const result = operator(this as unknown as GeometrySource<Item>)
        if (!isGeometrySource(result)) {
            throw new TypeError('GeometrySource.pipe() operator must return a GeometrySource.')
        }
        return result
    }
}

const geometrySourcePrototype = Object.freeze(GeometrySourceMethods.prototype)

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

    const node = Object.assign(Object.create(geometrySourcePrototype), {
        [GEOMETRY_GRAPH_NODE]: true as const,
        kind,
        ...(key ? { key } : {}),
        inputs: Object.freeze({ ...inputs }),
        parameters: Object.freeze({ ...parameters }),
    }) as GeometryGraphNode<Parameters, Item>
    return Object.freeze(node)
}

export function transformGeometrySource<Item = unknown>(
    input: GeometrySource<Item>,
    options: TransformParameters = {},
): GeometrySource<Item> {
    const { key, ...parameters } = options
    return createGeometryNode<typeof parameters, Item>('transform', { geometry: input }, parameters, key)
}

export function distributeGeometrySource<Item = unknown>(
    input: GeometrySource,
    distribution: DistributionOptions<Item>,
): GeometrySource<Item> {
    if (isGeometryPointDomain(distribution)) {
        return createGeometryNode<{ domain: typeof distribution }, Item>(
            'distribute',
            { geometry: input },
            { domain: distribution },
        )
    }
    if (Array.isArray(distribution)) {
        return createGeometryNode<{ points: unknown[] }, Item>('distribute', { geometry: input }, { points: [...distribution] })
    }
    const { key, ...options } = distribution as Exclude<
        DistributionOptions<Item>,
        readonly unknown[] | { readonly kind: string }
    >
    if ('pattern' in options && options.pattern === 'surface') {
        const { surface, ...parameters } = options as Omit<SurfaceDistribution, 'key'>
        return createGeometryNode<typeof parameters, Item>('distribute', { geometry: input, surface }, parameters, key)
    }
    return createGeometryNode<typeof options, Item>('distribute', { geometry: input }, options, key)
}

export function joinGeometrySources<Item = unknown>(
    inputs: readonly GeometrySource<Item>[],
    options: JoinOptions = {},
): GeometrySource<Item> {
    const { key, operation = 'combine' } = options
    if (operation !== 'combine') {
        throw new Error(`Unsupported procedural join operation: ${String(operation)}.`)
    }
    return createGeometryNode<{ operation: 'combine' }, Item>('join', { geometries: [...inputs] }, { operation }, key)
}

export function parameterMapGeometrySource<Item = unknown>(
    input: GeometrySource<Item>,
    options: ParameterMapOptions<Item>,
): GeometrySource<Item> {
    const { key, ...parameters } = options
    return createGeometryNode<typeof parameters, Item>('parameter-map', { geometry: input }, parameters, key)
}

export function materialGeometrySource<Item = unknown>(
    input: GeometrySource<Item>,
    material: MaterialChannelOptions['material'],
    options: GeometryNodeOptions = {},
): GeometrySource<Item> {
    return createGeometryNode<{ material: MaterialChannelOptions['material'] }, Item>(
        'material',
        { geometry: input },
        { material },
        options.key,
    )
}

export function namedGeometrySource<Item = unknown>(
    input: GeometrySource<Item>,
    name: NamedGeometryOptions['name'],
    options: GeometryNodeOptions = {},
): GeometrySource<Item> {
    return createGeometryNode<{ name: NamedGeometryOptions['name'] }, Item>(
        'named',
        { geometry: input },
        { name },
        options.key,
    )
}

export function randomizeGeometrySource<Item = unknown>(
    input: GeometrySource<Item>,
    options: RandomizeOptions = {},
): GeometrySource<Item> {
    const { key, ...parameters } = options
    return createGeometryNode<typeof parameters, Item>('randomize', { geometry: input }, parameters, key)
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
    if (isGeometryParameter(value)) {
        return `parameter:${value.name}:${valueSignature(value.fallback, visiting)}`
    }
    if (isGeometryPointDomain(value)) {
        return `point-domain:${value.kind}:${valueSignature(value.parameters, visiting)}`
    }
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

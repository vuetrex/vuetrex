import * as THREE from 'three'
import { evaluateField } from '@/lib-components/geometry/fields.js'
import { keyedRandom, randomBetween } from '@/lib-components/geometry/random.js'
import { resolveGeometryValue } from '@/lib-components/geometry/parameters.js'
import type {
    ColorRange,
    GeometryParameterValues,
    GeometryContext,
    GeometryRecord,
    GeometrySet,
    GeometrySource,
    JoinOptions,
    MaterialChannelOptions,
    NamedGeometryOptions,
    NumberRange,
    ParameterMapOptions,
    RandomizeOptions,
    Vector3Like,
    VectorRange,
    TransformParameters,
} from '@/lib-components/geometry/types.js'
import { composeTransform, toVector3 } from '@/lib-components/geometry/values.js'
import { evaluateDistribution } from '@/lib-components/geometry/compiler/distribution.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'

const primitiveKinds = new Set(['line', 'plane', 'box', 'icosphere'])

function sourceInput(source: GeometrySource, name: string): GeometrySource {
    const input = source.inputs[name]
    if (!input || Array.isArray(input)) throw new Error(`Geometry node '${source.kind}' requires one '${name}' input.`)
    return input as GeometrySource
}

function sourceInputs(source: GeometrySource, name: string): readonly GeometrySource[] {
    const input = source.inputs[name]
    if (!input) return []
    return Array.isArray(input) ? input : [input as GeometrySource]
}

function contextAt(
    record: GeometryRecord,
    key: string,
    index: number,
    matrix = record.domainMatrix ?? record.matrix,
): GeometryContext {
    return Object.freeze({
        ...record.context,
        key,
        index,
        position: new THREE.Vector3().setFromMatrixPosition(matrix),
    })
}

function composeInRecordDomain(
    record: GeometryRecord,
    localMatrix: THREE.Matrix4,
): { matrix: THREE.Matrix4; domainMatrix?: THREE.Matrix4 } {
    if (!record.domainMatrix) {
        return { matrix: record.matrix.clone().multiply(localMatrix) }
    }
    const domainMatrix = record.domainMatrix.clone().multiply(localMatrix)
    const matrix = domainMatrix.clone()
        .multiply(record.domainMatrix.clone().invert())
        .multiply(record.matrix)
    return { matrix, domainMatrix }
}

function cloneRecord(record: GeometryRecord, overrides: Partial<GeometryRecord>): GeometryRecord {
    return Object.freeze({
        ...record,
        ...overrides,
    })
}

function vectorJitter(
    value: Vector3Like | VectorRange | undefined,
    seed: string | number,
    key: string,
    channel: string,
    center: number,
): THREE.Vector3 {
    if (value === undefined) return new THREE.Vector3(center, center, center)
    if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
        const range = value as VectorRange
        const minimum = toVector3(range.min)
        const maximum = toVector3(range.max)
        return new THREE.Vector3(
            randomBetween(seed, key, `${channel}:x`, minimum.x, maximum.x),
            randomBetween(seed, key, `${channel}:y`, minimum.y, maximum.y),
            randomBetween(seed, key, `${channel}:z`, minimum.z, maximum.z),
        )
    }
    const amplitude = toVector3(value as Vector3Like)
    return new THREE.Vector3(
        randomBetween(seed, key, `${channel}:x`, center - Math.abs(amplitude.x), center + Math.abs(amplitude.x)),
        randomBetween(seed, key, `${channel}:y`, center - Math.abs(amplitude.y), center + Math.abs(amplitude.y)),
        randomBetween(seed, key, `${channel}:z`, center - Math.abs(amplitude.z), center + Math.abs(amplitude.z)),
    )
}

function randomScale(
    value: RandomizeOptions['scale'],
    seed: string | number,
    key: string,
): THREE.Vector3 {
    if (value === undefined) return new THREE.Vector3(1, 1, 1)
    if (typeof value === 'number') {
        const scalar = randomBetween(seed, key, 'scale:uniform', 1 - Math.abs(value), 1 + Math.abs(value))
        return new THREE.Vector3(scalar, scalar, scalar)
    }
    if (Array.isArray(value) && value.length === 2) {
        const scalar = randomBetween(seed, key, 'scale:uniform', value[0], value[1])
        return new THREE.Vector3(scalar, scalar, scalar)
    }
    if (value && typeof value === 'object' && 'min' in value && 'max' in value) {
        if (typeof value.min === 'number' && typeof value.max === 'number') {
            const range = value as NumberRange
            const scalar = randomBetween(seed, key, 'scale:uniform', range.min, range.max)
            return new THREE.Vector3(scalar, scalar, scalar)
        }
        return vectorJitter(value as VectorRange, seed, key, 'scale', 1)
    }
    return vectorJitter(value as Vector3Like, seed, key, 'scale', 1)
}

function randomColor(
    value: RandomizeOptions['color'],
    seed: string | number,
    key: string,
): THREE.Color | undefined {
    if (value === undefined) return undefined
    const from = Array.isArray(value) ? value[0] : (value as ColorRange).from
    const to = Array.isArray(value) ? value[1] : (value as ColorRange).to
    return new THREE.Color(from).lerp(new THREE.Color(to), keyedRandom(seed, key, 'color'))
}

export class GeometryEvaluator {
    private readonly cache = new WeakMap<GeometrySource<any>, GeometrySet>()
    private readonly visiting = new WeakMap<GeometrySource<any>, string>()

    constructor(
        private readonly prototypes: GeometryPrototypeRegistry,
        private readonly parameters: GeometryParameterValues = {},
    ) {}

    evaluate(source: GeometrySource<any>): GeometrySet {
        return this.evaluateNode(source, 'root')
    }

    private evaluateNode(source: GeometrySource<any>, path: string): GeometrySet {
        const cached = this.cache.get(source)
        if (cached) return cached
        const activePath = this.visiting.get(source)
        if (activePath) {
            throw new Error(`Cyclic procedural geometry graph detected at '${path}' (already visiting '${activePath}').`)
        }
        this.visiting.set(source, path)
        try {
            let result: GeometrySet
            if (primitiveKinds.has(source.kind)) result = this.evaluatePrimitive(source, path)
            else {
                switch (source.kind) {
                    case 'module': result = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/module`); break
                    case 'transform': result = this.evaluateTransform(source, path); break
                    case 'boolean':
                    case 'join': result = this.evaluateJoin(source, path); break
                    case 'distribute': result = this.evaluateDistribute(source, path); break
                    case 'parameter-map': result = this.evaluateParameterMap(source, path); break
                    case 'randomize': result = this.evaluateRandomize(source, path); break
                    case 'material': result = this.evaluateMaterial(source, path); break
                    case 'named': result = this.evaluateNamed(source, path); break
                    default: throw new Error(`Unknown procedural geometry node kind: '${source.kind}'.`)
                }
            }
            const frozen = Object.freeze({ records: Object.freeze([...result.records]) })
            this.cache.set(source, frozen)
            return frozen
        } finally {
            this.visiting.delete(source)
        }
    }

    private evaluatePrimitive(source: GeometrySource, path: string): GeometrySet {
        const prototype = this.prototypes.resolve(source, this.parameters)
        const key = source.key ?? path
        const matrix = new THREE.Matrix4()
        const context: GeometryContext = Object.freeze({
            key,
            index: 0,
            item: undefined,
            position: new THREE.Vector3(),
        })
        return {
            records: [Object.freeze({
                key,
                prototype,
                matrix,
                color: new THREE.Color(0xffffff),
                visible: true,
                materialKey: 'default',
                groups: Object.freeze([]),
                context,
                attributes: Object.freeze({}),
            })],
        }
    }

    private evaluateTransform(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const options = source.parameters as TransformParameters
        const operatorMatrix = composeTransform({
            translate: resolveGeometryValue(options.translate, this.parameters),
            rotate: resolveGeometryValue(options.rotate, this.parameters),
            scale: resolveGeometryValue(options.scale, this.parameters),
            pivot: resolveGeometryValue(options.pivot, this.parameters),
        })
        return {
            records: input.records.map((record, index) => {
                const matrix = operatorMatrix.clone().multiply(record.matrix)
                const domainMatrix = record.domainMatrix
                    ? operatorMatrix.clone().multiply(record.domainMatrix)
                    : undefined
                const key = `${source.key ?? path}/${record.key}`
                const transformed = { ...record, matrix, domainMatrix } as GeometryRecord
                return cloneRecord(record, { key, matrix, domainMatrix, context: contextAt(transformed, key, index) })
            }),
        }
    }

    private evaluateJoin(source: GeometrySource, path: string): GeometrySet {
        const options = source.parameters as JoinOptions
        if (options.operation !== 'combine') {
            throw new Error(`Unsupported procedural join operation: ${String(options.operation)}.`)
        }
        return {
            records: sourceInputs(source, 'geometries').flatMap((input, inputIndex) =>
                this.evaluateNode(input, `${path}/geometries/${inputIndex}`).records.map((record, recordIndex) => {
                    const key = `${source.key ?? path}/${inputIndex}/${record.key}`
                    return cloneRecord(record, { key, context: contextAt(record, key, recordIndex) })
                }),
            ),
        }
    }

    private evaluateDistribute(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const surfaceInput = source.inputs.surface
        const surface = surfaceInput && !Array.isArray(surfaceInput)
            ? this.evaluateNode(surfaceInput as GeometrySource, `${path}/surface`)
            : undefined
        const placements = evaluateDistribution(source.parameters as Record<string, unknown>, surface, this.parameters)
        const records: GeometryRecord[] = []
        for (const placement of placements) {
            for (const sourceRecord of input.records) {
                const key = `${source.key ?? path}/${placement.key}/${sourceRecord.key}`
                const matrix = placement.matrix.clone().multiply(sourceRecord.matrix)
                const domainMatrix = placement.matrix.clone()
                const domainKey = `${source.key ?? path}/${placement.key}`
                const context: GeometryContext = Object.freeze({
                    key,
                    domainKey,
                    index: placement.index,
                    item: placement.item,
                    position: placement.position.clone(),
                    ...(placement.normal ? { normal: placement.normal.clone() } : {}),
                    ...(placement.tangent ? { tangent: placement.tangent.clone() } : {}),
                })
                records.push(cloneRecord(sourceRecord, { key, matrix, domainMatrix, context }))
            }
        }
        return { records }
    }

    private evaluateParameterMap(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const options = source.parameters as ParameterMapOptions
        return {
            records: input.records.map((record, index) => {
                const key = `${source.key ?? path}/${record.key}`
                const context = Object.freeze({ ...record.context, key, index })
                const position = evaluateField(options.position, context, this.parameters)
                const rotation = evaluateField(options.rotation, context, this.parameters)
                const scale = evaluateField(options.scale, context, this.parameters)
                const colorValue = evaluateField(options.color, context, this.parameters)
                const visibleValue = evaluateField(options.visible, context, this.parameters)
                const localMatrix = composeTransform({ translate: position, rotate: rotation, scale })
                const transformed = composeInRecordDomain(record, localMatrix)
                const mappedRecord = { ...record, ...transformed, context } as GeometryRecord
                const mappedContext = contextAt(mappedRecord, key, index)
                return cloneRecord(record, {
                    key,
                    ...transformed,
                    context: mappedContext,
                    color: colorValue === undefined ? record.color.clone() : new THREE.Color(colorValue),
                    visible: record.visible && (visibleValue ?? true),
                })
            }),
        }
    }

    private evaluateRandomize(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const options = source.parameters as RandomizeOptions
        const seed = resolveGeometryValue(options.seed, this.parameters) ?? 0
        const operatorKey = source.key ?? path
        return {
            records: input.records.map((record, index) => {
                const key = `${operatorKey}/${record.key}`
                const randomKey = `${operatorKey}:${record.context.domainKey ?? record.context.key}`
                const translate = vectorJitter(resolveGeometryValue(options.translate, this.parameters), seed, randomKey, 'translate', 0)
                const rotation = vectorJitter(resolveGeometryValue(options.rotation, this.parameters), seed, randomKey, 'rotation', 0)
                const scale = randomScale(resolveGeometryValue(options.scale, this.parameters), seed, randomKey)
                const localMatrix = composeTransform({ translate, rotate: rotation.toArray() as [number, number, number], scale })
                const transformed = composeInRecordDomain(record, localMatrix)
                const randomizedRecord = { ...record, ...transformed } as GeometryRecord
                return cloneRecord(record, {
                    key,
                    ...transformed,
                    context: contextAt(randomizedRecord, key, index),
                    color: randomColor(resolveGeometryValue(options.color, this.parameters), seed, randomKey) ?? record.color.clone(),
                })
            }),
        }
    }

    private evaluateMaterial(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const materialKey = resolveGeometryValue(
            (source.parameters as MaterialChannelOptions).material,
            this.parameters,
        )
        if (typeof materialKey !== 'string' || !materialKey.trim()) {
            throw new TypeError('Procedural material channel names must be non-empty strings.')
        }
        return {
            records: input.records.map((record, index) => {
                const key = `${source.key ?? path}/${record.key}`
                return cloneRecord(record, { key, materialKey, context: contextAt(record, key, index) })
            }),
        }
    }

    private evaluateNamed(source: GeometrySource, path: string): GeometrySet {
        const input = this.evaluateNode(sourceInput(source, 'geometry'), `${path}/geometry`)
        const name = resolveGeometryValue(
            (source.parameters as NamedGeometryOptions).name,
            this.parameters,
        )
        if (typeof name !== 'string' || !name.trim()) {
            throw new TypeError('Procedural geometry group names must be non-empty strings.')
        }
        return {
            records: input.records.map((record, index) => {
                const key = `${source.key ?? path}/${record.key}`
                return cloneRecord(record, {
                    key,
                    groups: Object.freeze([...record.groups, name]),
                    context: contextAt(record, key, index),
                })
            }),
        }
    }
}

export function evaluateGeometry(
    source: GeometrySource<any>,
    prototypes = new GeometryPrototypeRegistry(),
    parameters: GeometryParameterValues = {},
): GeometrySet {
    return new GeometryEvaluator(prototypes, parameters).evaluate(source)
}

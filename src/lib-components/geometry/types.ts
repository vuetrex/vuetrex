import type * as THREE from 'three'

export const GEOMETRY_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/geometry-node')
export const GEOMETRY_PARAMETER = Symbol.for('@exceeder/vuetrex/geometry-parameter')
export const GEOMETRY_POINT_DOMAIN = Symbol.for('@exceeder/vuetrex/geometry-point-domain')

export type Vector3Tuple = readonly [number, number, number]
export type Vector3Object = Readonly<{ x: number; y: number; z: number }>
export type Vector3Like = Vector3Tuple | Vector3Object | THREE.Vector3
export type ScaleLike = number | Vector3Like
export type EulerTuple = readonly [number, number, number]
export type QuaternionTuple = readonly [number, number, number, number]
export type RotationLike = EulerTuple | QuaternionTuple | THREE.Euler | THREE.Quaternion

export interface GeometryParameter<Value = unknown> {
    readonly [GEOMETRY_PARAMETER]: true
    readonly name: string
    readonly fallback?: Value
}

export type GeometryValue<Value> = Value | GeometryParameter<Value>
export type GeometryParameterValues = Readonly<Record<string, unknown>>

export type GeometryPipeOperator<Input = unknown, Output = Input> = (
    source: GeometrySource<Input>,
) => GeometrySource<Output>

/** Immutable fluent operations shared by every authored geometry source. */
export interface GeometryChain<Item = unknown> {
    transform(options?: TransformParameters): GeometrySource<Item>
    distribute<NextItem = unknown>(distribution: DistributionOptions<NextItem>): GeometrySource<NextItem>
    parameterMap(options: ParameterMapOptions<Item>): GeometrySource<Item>
    material(material: GeometryValue<string>, options?: GeometryNodeOptions): GeometrySource<Item>
    named(name: GeometryValue<string>, options?: GeometryNodeOptions): GeometrySource<Item>
    randomize(options?: RandomizeOptions): GeometrySource<Item>
    join(
        source: GeometrySource<Item> | readonly GeometrySource<Item>[],
        options?: JoinOptions,
    ): GeometrySource<Item>
    pipe<Output = Item>(operator: GeometryPipeOperator<Item, Output>): GeometrySource<Output>
}

export type GeometryInput = GeometrySource<any> | readonly GeometrySource<any>[] | undefined

export interface GeometryGraphNode<Parameters extends object = Record<string, unknown>, Item = unknown>
    extends GeometryChain<Item> {
    readonly [GEOMETRY_GRAPH_NODE]: true
    readonly kind: string
    readonly key?: string
    readonly inputs: Readonly<Record<string, GeometryInput>>
    readonly parameters: Readonly<Parameters>
    /** Type-only carrier for the current field domain. */
    readonly __geometryItem?: Item
}

export type GeometrySource<Item = unknown> = GeometryGraphNode<object, Item>

export interface GeometryFactory<Parameters, Item = unknown> {
    (parameters: Readonly<Parameters>): GeometrySource<Item>
    readonly geometryModuleName: string
}

export type GeometryOutputMap = Record<string, GeometrySource<any>>
export type GeometryOutputs<Outputs extends GeometryOutputMap> = Readonly<Outputs> & {
    output<Name extends keyof Outputs>(name: Name): Outputs[Name]
}

export interface GeometryOutputsFactory<Parameters, Outputs extends GeometryOutputMap> {
    (parameters: Readonly<Parameters>): GeometryOutputs<Outputs>
    readonly geometryModuleName: string
}

export interface GeometryContext<Item = unknown> {
    readonly key: string
    /** Stable key of the most recent distribution placement containing this record. */
    readonly domainKey?: string
    readonly index: number
    readonly item: Item
    readonly position: THREE.Vector3
    readonly normal?: THREE.Vector3
    readonly tangent?: THREE.Vector3
}

export type Field<Value, Item = unknown> = GeometryValue<Value> | ((context: GeometryContext<Item>) => GeometryValue<Value>)

export type GeometryAttributeValue = number | THREE.Vector2 | THREE.Vector3 | THREE.Vector4

export interface GeometryPrototype {
    readonly signature: string
    readonly topology: 'mesh' | 'line'
    readonly geometry: THREE.BufferGeometry
}

export interface GeometryRecord<Item = unknown> {
    readonly key: string
    readonly prototype: GeometryPrototype
    readonly matrix: THREE.Matrix4
    /** Transform of the most recent distribution domain, used for coherent subgraph mapping. */
    readonly domainMatrix?: THREE.Matrix4
    readonly color: THREE.Color
    readonly visible: boolean
    readonly materialKey: string
    readonly groups: readonly string[]
    readonly context: GeometryContext<Item>
    readonly attributes: Readonly<Record<string, GeometryAttributeValue>>
}

export interface GeometrySet {
    readonly records: readonly GeometryRecord[]
}

export interface GeometryHit<Item = unknown> {
    readonly id: string
    readonly item: Item
    readonly instanceIndex: number
    readonly recordKey: string
    readonly materialKey: string
    readonly groups: readonly string[]
}

export type GeometryRecordSelector = string | Readonly<{
    group?: string
    material?: string
    item?: string | number
}>

export interface GeometryNodeOptions {
    key?: string
}

export interface LineParameters extends GeometryNodeOptions {
    length?: GeometryValue<number>
    points?: GeometryValue<readonly Vector3Like[]>
    thickness?: GeometryValue<number>
    tubularSegments?: GeometryValue<number>
    radialSegments?: GeometryValue<number>
    closed?: boolean
    path?: 'polyline' | 'smooth'
}

export interface PlaneParameters extends GeometryNodeOptions {
    width?: GeometryValue<number>
    depth?: GeometryValue<number>
    widthSegments?: GeometryValue<number>
    depthSegments?: GeometryValue<number>
}

export interface BoxParameters extends GeometryNodeOptions {
    width?: GeometryValue<number>
    height?: GeometryValue<number>
    depth?: GeometryValue<number>
    widthSegments?: GeometryValue<number>
    heightSegments?: GeometryValue<number>
    depthSegments?: GeometryValue<number>
}

export interface IcosphereParameters extends GeometryNodeOptions {
    radius?: GeometryValue<number>
    detail?: GeometryValue<number>
}

export interface TransformParameters extends GeometryNodeOptions {
    translate?: GeometryValue<Vector3Like>
    rotate?: GeometryValue<RotationLike>
    scale?: GeometryValue<ScaleLike>
    pivot?: GeometryValue<Vector3Like>
}

export interface ParameterMapOptions<Item = unknown> extends GeometryNodeOptions {
    position?: Field<Vector3Like, Item>
    rotation?: Field<RotationLike, Item>
    scale?: Field<ScaleLike, Item>
    color?: Field<THREE.ColorRepresentation, Item>
    visible?: Field<boolean, Item>
}

export type GeometryItemKey<Item> = keyof Item | string | ((item: Item, index: number) => string | number)
export type ItemValue<Item, Value> = GeometryValue<Value> | ((item: Item, index: number) => GeometryValue<Value>)

export interface GeometryPlacement<Item = unknown> {
    key?: string | number
    item?: Item
    position: Vector3Like
    direction?: Vector3Like
    normal?: Vector3Like
    rotation?: RotationLike
    scale?: ScaleLike
}

export interface GeometryPointDomain<Item = unknown> {
    readonly [GEOMETRY_POINT_DOMAIN]: true
    readonly kind: 'points' | 'curve' | 'radial' | 'map'
    readonly parameters: Readonly<Record<string, unknown>>
}

export interface CurvePointOptions extends GeometryNodeOptions {
    points: GeometryValue<readonly Vector3Like[]>
    count: GeometryValue<number>
    includeEndpoints?: boolean
    align?: 'none' | 'tangent'
}

export interface RadialPointOptions<Item = unknown> extends GeometryNodeOptions {
    count: GeometryValue<number>
    radius?: GeometryValue<number>
    center?: GeometryValue<Vector3Like>
    axis?: 'xy' | 'xz' | 'yz'
    startAngle?: GeometryValue<number>
    arc?: GeometryValue<number>
    item?: (index: number, count: number) => Item
}

export interface GeometryPointContext<Item = unknown> {
    readonly key: string
    readonly index: number
    readonly count: number
    readonly item: Item
    readonly position: THREE.Vector3
    readonly normal?: THREE.Vector3
    readonly tangent?: THREE.Vector3
}

export interface ItemDistribution<Item = unknown> extends GeometryNodeOptions {
    items: readonly Item[]
    keyBy?: GeometryItemKey<Item>
    position: ItemValue<Item, Vector3Like>
    direction?: ItemValue<Item, Vector3Like | undefined>
    normal?: ItemValue<Item, Vector3Like | undefined>
    rotation?: ItemValue<Item, RotationLike | undefined>
    scale?: ItemValue<Item, ScaleLike | undefined>
}

export interface PointDistribution<Item = unknown> extends GeometryNodeOptions {
    points: readonly (Vector3Like | GeometryPlacement<Item>)[]
}

export interface LineDistribution extends GeometryNodeOptions {
    pattern: 'line'
    count: GeometryValue<number>
    start?: GeometryValue<Vector3Like>
    end?: GeometryValue<Vector3Like>
    points?: GeometryValue<readonly Vector3Like[]>
    includeEndpoints?: boolean
    align?: 'none' | 'tangent'
}

export interface GridDistribution extends GeometryNodeOptions {
    pattern: 'grid'
    count: GeometryValue<number | readonly [number, number]>
    spacing?: GeometryValue<number | readonly [number, number]>
    center?: GeometryValue<Vector3Like>
}

export interface CustomDistribution<Item = unknown> extends GeometryNodeOptions {
    pattern: 'custom'
    count: GeometryValue<number>
    placement: (index: number, count: number) => GeometryPlacement<Item>
}

export interface SurfaceDistribution extends GeometryNodeOptions {
    pattern: 'surface'
    surface: GeometrySource
    count: GeometryValue<number>
    seed?: GeometryValue<string | number>
    align?: 'none' | 'normal'
}

export type DistributionOptions<Item = unknown> =
    | ItemDistribution<Item>
    | PointDistribution<Item>
    | LineDistribution
    | GridDistribution
    | CustomDistribution<Item>
    | SurfaceDistribution
    | GeometryPointDomain<Item>
    | readonly (Vector3Like | GeometryPlacement<Item>)[]

export interface JoinOptions extends GeometryNodeOptions {
    operation?: 'combine'
}

/** @deprecated Use JoinOptions and geo.join(). */
export type CombineOptions = JoinOptions

export interface MaterialChannelOptions extends GeometryNodeOptions {
    material: GeometryValue<string>
}

export interface NamedGeometryOptions extends GeometryNodeOptions {
    name: GeometryValue<string>
}

export interface NumberRange {
    min: number
    max: number
}

export interface VectorRange {
    min: Vector3Like
    max: Vector3Like
}

export interface ColorRange {
    from: THREE.ColorRepresentation
    to: THREE.ColorRepresentation
}

export interface RandomizeOptions extends GeometryNodeOptions {
    seed?: GeometryValue<string | number>
    translate?: GeometryValue<Vector3Like | VectorRange>
    rotation?: GeometryValue<EulerTuple | VectorRange>
    scale?: GeometryValue<number | readonly [number, number] | Vector3Like | VectorRange | NumberRange>
    color?: GeometryValue<readonly [THREE.ColorRepresentation, THREE.ColorRepresentation] | ColorRange>
}

import type * as THREE from 'three'

export const GEOMETRY_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/geometry-node')

export type Vector3Tuple = readonly [number, number, number]
export type Vector3Object = Readonly<{ x: number; y: number; z: number }>
export type Vector3Like = Vector3Tuple | Vector3Object | THREE.Vector3
export type ScaleLike = number | Vector3Like
export type EulerTuple = readonly [number, number, number]
export type QuaternionTuple = readonly [number, number, number, number]
export type RotationLike = EulerTuple | QuaternionTuple | THREE.Euler | THREE.Quaternion

export type GeometryInput = GeometrySource<any> | readonly GeometrySource<any>[] | undefined

export interface GeometryGraphNode<Parameters extends object = Record<string, unknown>, Item = unknown> {
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

export type Field<Value, Item = unknown> = Value | ((context: GeometryContext<Item>) => Value)

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
    readonly context: GeometryContext<Item>
    readonly attributes: Readonly<Record<string, GeometryAttributeValue>>
}

export interface GeometrySet {
    readonly records: readonly GeometryRecord[]
}

export interface GeometryNodeOptions {
    key?: string
}

export interface LineParameters extends GeometryNodeOptions {
    length?: number
    points?: readonly Vector3Like[]
    thickness?: number
    tubularSegments?: number
    radialSegments?: number
    closed?: boolean
    path?: 'polyline' | 'smooth'
}

export interface PlaneParameters extends GeometryNodeOptions {
    width?: number
    depth?: number
    widthSegments?: number
    depthSegments?: number
}

export interface BoxParameters extends GeometryNodeOptions {
    width?: number
    height?: number
    depth?: number
    widthSegments?: number
    heightSegments?: number
    depthSegments?: number
}

export interface IcosphereParameters extends GeometryNodeOptions {
    radius?: number
    detail?: number
}

export interface TransformParameters extends GeometryNodeOptions {
    translate?: Vector3Like
    rotate?: RotationLike
    scale?: ScaleLike
    pivot?: Vector3Like
}

export interface ParameterMapOptions<Item = unknown> extends GeometryNodeOptions {
    position?: Field<Vector3Like, Item>
    rotation?: Field<RotationLike, Item>
    scale?: Field<ScaleLike, Item>
    color?: Field<THREE.ColorRepresentation, Item>
    visible?: Field<boolean, Item>
}

export type GeometryItemKey<Item> = keyof Item | string | ((item: Item, index: number) => string | number)
export type ItemValue<Item, Value> = Value | ((item: Item, index: number) => Value)

export interface GeometryPlacement<Item = unknown> {
    key?: string | number
    item?: Item
    position: Vector3Like
    direction?: Vector3Like
    normal?: Vector3Like
    rotation?: RotationLike
    scale?: ScaleLike
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
    count: number
    start?: Vector3Like
    end?: Vector3Like
    points?: readonly Vector3Like[]
    includeEndpoints?: boolean
    align?: 'none' | 'tangent'
}

export interface GridDistribution extends GeometryNodeOptions {
    pattern: 'grid'
    count: number | readonly [number, number]
    spacing?: number | readonly [number, number]
    center?: Vector3Like
}

export interface CustomDistribution<Item = unknown> extends GeometryNodeOptions {
    pattern: 'custom'
    count: number
    placement: (index: number, count: number) => GeometryPlacement<Item>
}

export interface SurfaceDistribution extends GeometryNodeOptions {
    pattern: 'surface'
    surface: GeometrySource
    count: number
    seed?: string | number
    align?: 'none' | 'normal'
}

export type DistributionOptions<Item = unknown> =
    | ItemDistribution<Item>
    | PointDistribution<Item>
    | LineDistribution
    | GridDistribution
    | CustomDistribution<Item>
    | SurfaceDistribution
    | readonly (Vector3Like | GeometryPlacement<Item>)[]

export interface CombineOptions extends GeometryNodeOptions {
    operation?: 'combine'
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
    seed?: string | number
    translate?: Vector3Like | VectorRange
    rotation?: EulerTuple | VectorRange
    scale?: number | readonly [number, number] | Vector3Like | VectorRange | NumberRange
    color?: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation] | ColorRange
}

import type * as THREE from 'three'

export const PARTICLE_GRAPH_NODE = Symbol.for('@exceeder/vuetrex/particle-node')
export const PARTICLE_PARAMETER = Symbol.for('@exceeder/vuetrex/particle-parameter')

export type ParticleVector3Tuple = readonly [number, number, number]
export type ParticleVector3Object = Readonly<{ x: number; y: number; z: number }>
export type ParticleVector3Like = ParticleVector3Tuple | ParticleVector3Object | THREE.Vector3
export type ParticleColor = THREE.ColorRepresentation | THREE.Color
export type ParticleTarget = string | ParticleVector3Like
export type ParticleBackendName = 'auto' | 'cpu' | (string & {})

export interface ParticleParameter<Value = unknown> {
    readonly [PARTICLE_PARAMETER]: true
    readonly name: string
    readonly fallback?: Value
}

export type ParticleValue<Value> = Value | ParticleParameter<Value>
export type ParticleParameterValues = Readonly<Record<string, unknown>>

export interface ParticleContext<Item = unknown> {
    readonly key: string
    readonly index: number
    readonly emitterIndex: number
    readonly item: Item
    /** Stable deterministic value in [0, 1), useful for visual variation. */
    readonly random: number
    /** Stable starting progress in [0, 1). */
    readonly phase: number
}

export type ParticleField<Value, Item = unknown> =
    | ParticleValue<Value>
    | ((context: ParticleContext<Item>) => ParticleValue<Value>)

export type ParticleCount<Item = unknown> =
    | ParticleValue<number>
    | ((item: Item, emitterIndex: number) => ParticleValue<number>)

export interface ParticleNodeOptions {
    key?: string
}

export type ParticlePipeOperator<Input = unknown, Output = Input> = (
    source: ParticleSource<Input>,
) => ParticleSource<Output>

/** Immutable fluent operations shared by every authored particle source. */
export interface ParticleChain<Item = unknown> {
    appearance(options?: ParticleAppearanceOptions<Item>): ParticleSource<Item>
    motion(options?: ParticleMotionOptions<Item>): ParticleSource<Item>
    simulate(options?: ParticleSimulationOptions<Item>): ParticleSource<Item>
    named(name: ParticleValue<string>, options?: ParticleNodeOptions): ParticleSource<Item>
    join(
        source: ParticleSource<Item> | readonly ParticleSource<Item>[],
        options?: ParticleJoinOptions,
    ): ParticleSource<Item>
    pipe<Output = Item>(operator: ParticlePipeOperator<Item, Output>): ParticleSource<Output>
}

export type ParticleInput = ParticleSource<any> | readonly ParticleSource<any>[] | undefined

export interface ParticleGraphNode<Parameters extends object = Record<string, unknown>, Item = unknown>
    extends ParticleChain<Item> {
    readonly [PARTICLE_GRAPH_NODE]: true
    readonly kind: string
    readonly key?: string
    readonly inputs: Readonly<Record<string, ParticleInput>>
    readonly parameters: Readonly<Parameters>
    /** Type-only carrier for the current particle data domain. */
    readonly __particleItem?: Item
}

export type ParticleSource<Item = unknown> = ParticleGraphNode<object, Item>

export interface ParticleFactory<Parameters, Item = unknown> {
    (parameters: Readonly<Parameters>): ParticleSource<Item>
    readonly particleModuleName: string
}

export type ParticleOutputMap = Record<string, ParticleSource<any>>
export type ParticleOutputs<Outputs extends ParticleOutputMap> = Readonly<Outputs> & {
    output<Name extends keyof Outputs>(name: Name): Outputs[Name]
}

export interface ParticleOutputsFactory<Parameters, Outputs extends ParticleOutputMap> {
    (parameters: Readonly<Parameters>): ParticleOutputs<Outputs>
    readonly particleModuleName: string
}

export interface ParticlePath<Item = unknown> {
    readonly points: readonly ParticleVector3Like[]
    readonly item?: Item
    readonly key?: string
    readonly closed?: boolean
}

export interface PathParticleOptions<Item = unknown> extends ParticleNodeOptions {
    count?: ParticleCount<Item>
    item?: Item
    closed?: boolean
    seed?: ParticleValue<string | number>
    distribution?: 'even' | 'random'
    spread?: ParticleField<number, Item>
}

export interface PathsParticleOptions<Item = unknown> extends ParticleNodeOptions {
    count?: ParticleCount<Item>
    closed?: boolean
    seed?: ParticleValue<string | number>
    distribution?: 'even' | 'random'
    spread?: ParticleField<number, Item>
}

export interface ParticleCloud<Item = unknown> {
    readonly target: ParticleTarget
    readonly item?: Item
    readonly key?: string
    /** Scalar radius, XYZ radii, or `bounds` to derive radius from a named object. */
    readonly radius?: ParticleValue<number | ParticleVector3Like | 'bounds'>
}

export interface CloudParticleOptions<Item = unknown> extends ParticleNodeOptions {
    count?: ParticleCount<Item>
    item?: Item
    radius?: ParticleValue<number | ParticleVector3Like | 'bounds'>
    shape?: 'sphere' | 'box'
    distribution?: 'volume' | 'surface'
    seed?: ParticleValue<string | number>
}

export interface CloudsParticleOptions<Item = unknown> extends ParticleNodeOptions {
    count?: ParticleCount<Item>
    radius?: ParticleValue<number | ParticleVector3Like | 'bounds'>
    shape?: 'sphere' | 'box'
    distribution?: 'volume' | 'surface'
    seed?: ParticleValue<string | number>
}

export interface ParticleAppearanceOptions<Item = unknown> extends ParticleNodeOptions {
    color?: ParticleField<ParticleColor, Item>
    size?: ParticleField<number, Item>
    opacity?: ParticleField<number, Item>
    shape?: ParticleValue<'soft-disc' | 'disc' | 'square'>
    blending?: ParticleValue<'normal' | 'additive'>
    depthWrite?: ParticleValue<boolean>
    sizeAttenuation?: ParticleValue<boolean>
}

export interface ParticleOrbitOptions<Item = unknown> {
    center?: ParticleTarget
    axis?: ParticleVector3Like
    speed?: ParticleField<number, Item>
}

export interface ParticleMotionOptions<Item = unknown> extends ParticleNodeOptions {
    /** World units per second along a path. */
    speed?: ParticleField<number, Item>
    velocity?: ParticleField<ParticleVector3Like, Item>
    /** Deterministic wandering amplitude in world units. */
    turbulence?: ParticleField<number, Item>
    turbulenceScale?: ParticleValue<number>
    orbit?: ParticleOrbitOptions<Item>
}

export interface ParticleGravityForce<Item = unknown> {
    type: 'gravity'
    acceleration: ParticleField<ParticleVector3Like, Item>
}

export interface ParticleAttractorForce<Item = unknown> {
    type: 'attractor'
    target: ParticleTarget
    strength: ParticleField<number, Item>
    radius?: ParticleValue<number>
}

export interface ParticleVortexForce<Item = unknown> {
    type: 'vortex'
    center?: ParticleTarget
    axis?: ParticleVector3Like
    strength: ParticleField<number, Item>
    radius?: ParticleValue<number>
}

export type ParticleForce<Item = unknown> =
    | ParticleGravityForce<Item>
    | ParticleAttractorForce<Item>
    | ParticleVortexForce<Item>

export interface ParticleSimulationOptions<Item = unknown> extends ParticleNodeOptions {
    /** `auto` currently selects CPU and is the stable seam for a future FBO backend. */
    backend?: ParticleValue<ParticleBackendName>
    forces?: readonly ParticleForce<Item>[]
    drag?: ParticleValue<number>
    maxDelta?: ParticleValue<number>
}

export interface ParticleJoinOptions extends ParticleNodeOptions {
    operation?: 'combine'
}

export interface ParticleHit<Item = unknown> {
    readonly id: string
    readonly item: Item
    readonly particleIndex: number
}

import { Quaternion, Vector3 } from 'three'

export interface CompositionContext {
    time?: number
    selectedId?: string
    parameters?: Readonly<Record<string, unknown>>
}

export interface SpatialContext extends CompositionContext {
    origin?: Vector3
}

export interface Placement {
    position: Vector3
    orientation: Quaternion
    scale: Vector3
    visibility?: boolean
    lod?: number
}

export type CapabilityType = 'select' | 'inspect' | 'focus' | 'restart' | 'pause' | 'animate'

export interface Capability {
    type: CapabilityType
    target: 'scene' | 'node' | 'instance'
}

export interface SceneNode<T = unknown> {
    id: string
    data: T
    placement: Placement
    representation?: string
    props?: Readonly<Record<string, unknown>>
}

export interface SceneConnection<T = unknown> {
    id: string
    from: string
    to: string
    data?: T
    bundle?: string
}

export interface SceneLabel {
    id: string
    target: string
    text: string
}

export interface SceneFragment<T = unknown> {
    nodes: SceneNode<T>[]
    connections: SceneConnection[]
    labels: SceneLabel[]
}

export interface RepresentationRecipe<T, Selected = unknown, Aggregated = unknown, Emitted = unknown> {
    select(data: T, context: CompositionContext): Selected
    aggregate(data: Selected, context: CompositionContext): Aggregated
    arrange(data: Aggregated, context: SpatialContext): Placement[]
    emit(data: Aggregated, placements: Placement[]): SceneFragment<Emitted>
    capabilities: Capability[]
}

export interface ComposedScene<T = unknown> {
    fragment: SceneFragment<T>
    capabilities: Capability[]
}

/** Executes the four recipe phases without coupling them to Vue or Three.js scene objects. */
export function compose<T, Selected, Aggregated, Emitted>(
    recipe: RepresentationRecipe<T, Selected, Aggregated, Emitted>,
    data: T,
    context: SpatialContext = {},
): ComposedScene<Emitted> {
    const selected = recipe.select(data, context)
    const aggregated = recipe.aggregate(selected, context)
    const placements = recipe.arrange(aggregated, context)
    return {
        fragment: recipe.emit(aggregated, placements),
        capabilities: [...recipe.capabilities],
    }
}

export interface Group<T, Key extends PropertyKey = string> {
    key: Key
    items: T[]
}

export interface LinearPlacementOptions {
    gap?: number
    scale?: Vector3
}

export interface RingPlacementOptions extends LinearPlacementOptions {
    radius?: number
    startAngle?: number
    arc?: number
    faceCenter?: boolean
}

export interface SpherePlacementOptions extends LinearPlacementOptions {
    radius?: number
    orientOutward?: boolean
}

export interface TimelinePlacementOptions extends LinearPlacementOptions {
    gap?: number
    rise?: number
}

export interface RadialRelation {
    from: string
    to: string
}

export interface RadialFocusOptions<T> {
    id(item: T, index: number): string
    relations?: readonly RadialRelation[]
    innerRadius?: number
    outerRadius?: number
    startAngle?: number
    faceCenter?: boolean
    centerScale?: Vector3
    innerScale?: Vector3
    outerScale?: Vector3
}

export interface EncodeOptions<T> {
    id(item: T, index: number): string
    representation?: string | ((item: T, index: number) => string)
    props?: (item: T, index: number) => Readonly<Record<string, unknown>>
}

const up = new Vector3(0, 1, 0)

function placement(position: Vector3, orientation = new Quaternion(), scale = new Vector3(1, 1, 1)): Placement {
    return { position, orientation, scale }
}

function centeredOffset(index: number, count: number, gap: number): number {
    return (index - (count - 1) / 2) * gap
}

/** Collection operators. */
export function filter<T>(items: readonly T[], predicate: (item: T, index: number) => boolean): T[] {
    return items.filter(predicate)
}

export function groupBy<T, Key extends PropertyKey>(
    items: readonly T[],
    keyOf: (item: T) => Key,
): Group<T, Key>[] {
    const groups = new Map<Key, T[]>()
    for (const item of items) {
        const key = keyOf(item)
        const group = groups.get(key)
        if (group) group.push(item)
        else groups.set(key, [item])
    }
    return [...groups].map(([key, groupedItems]) => ({ key, items: groupedItems }))
}

export function aggregate<T, Result>(
    items: readonly T[],
    reducer: (result: Result, item: T, index: number) => Result,
    initial: Result,
): Result {
    return items.reduce(reducer, initial)
}

/** Spatial operators. All positions are local to context.origin. */
export function row<T>(items: readonly T[], context: SpatialContext = {}, options: LinearPlacementOptions = {}): Placement[] {
    const origin = context.origin ?? new Vector3()
    const gap = options.gap ?? 1
    const scale = options.scale ?? new Vector3(1, 1, 1)
    return items.map((_item, index) => placement(
        origin.clone().add(new Vector3(centeredOffset(index, items.length, gap), 0, 0)),
        new Quaternion(),
        scale.clone(),
    ))
}

export function stack<T>(items: readonly T[], context: SpatialContext = {}, options: LinearPlacementOptions = {}): Placement[] {
    const origin = context.origin ?? new Vector3()
    const gap = options.gap ?? 1
    const scale = options.scale ?? new Vector3(1, 1, 1)
    return items.map((_item, index) => placement(
        origin.clone().add(new Vector3(0, index * gap, 0)),
        new Quaternion(),
        scale.clone(),
    ))
}

export function ring<T>(items: readonly T[], context: SpatialContext = {}, options: RingPlacementOptions = {}): Placement[] {
    const origin = context.origin ?? new Vector3()
    const radius = options.radius ?? Math.max(1, items.length / Math.PI)
    const start = options.startAngle ?? 0
    const arc = options.arc ?? Math.PI * 2
    const divisor = arc >= Math.PI * 2 ? Math.max(1, items.length) : Math.max(1, items.length - 1)
    const scale = options.scale ?? new Vector3(1, 1, 1)

    return items.map((_item, index) => {
        const angle = start + arc * index / divisor
        const position = origin.clone().add(new Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius))
        const orientation = options.faceCenter
            ? new Quaternion().setFromAxisAngle(up, angle + Math.PI)
            : new Quaternion()
        return placement(position, orientation, scale.clone())
    })
}

/** Fibonacci sphere projection with optional normal-aligned orientation. */
export function sphere<T>(items: readonly T[], context: SpatialContext = {}, options: SpherePlacementOptions = {}): Placement[] {
    const origin = context.origin ?? new Vector3()
    const radius = options.radius ?? 1
    const scale = options.scale ?? new Vector3(1, 1, 1)
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))

    return items.map((_item, index) => {
        const y = items.length <= 1 ? 1 : 1 - index / (items.length - 1) * 2
        const radial = Math.sqrt(Math.max(0, 1 - y * y))
        const angle = index * goldenAngle
        const normal = new Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial)
        const orientation = options.orientOutward === false
            ? new Quaternion()
            : new Quaternion().setFromUnitVectors(up, normal)
        return placement(origin.clone().addScaledVector(normal, radius), orientation, scale.clone())
    })
}

export function timeline<T>(items: readonly T[], context: SpatialContext = {}, options: TimelinePlacementOptions = {}): Placement[] {
    const origin = context.origin ?? new Vector3()
    const gap = options.gap ?? 1
    const rise = options.rise ?? 0
    const scale = options.scale ?? new Vector3(1, 1, 1)
    return items.map((_item, index) => placement(
        origin.clone().add(new Vector3(0, index * rise, -index * gap)),
        new Quaternion(),
        scale.clone(),
    ))
}

/**
 * Places the selected item at the origin, directly related items on an inner
 * ring, and the remaining context on an outer ring. Output order always
 * matches input order so it can be passed directly to encode().
 */
export function radialFocus<T>(
    items: readonly T[],
    context: SpatialContext = {},
    options: RadialFocusOptions<T>,
): Placement[] {
    const origin = context.origin ?? new Vector3()
    const ids = items.map(options.id)
    const selectedIndex = context.selectedId === undefined ? -1 : ids.indexOf(context.selectedId)
    const outerRadius = options.outerRadius ?? Math.max(2.5, items.length / Math.PI * 1.5)
    const startAngle = options.startAngle ?? -Math.PI / 2
    const faceCenter = options.faceCenter ?? true
    const outerScale = options.outerScale ?? new Vector3(0.82, 0.82, 0.82)

    if (selectedIndex < 0) {
        return ring(items, context, {
            radius: outerRadius,
            startAngle,
            faceCenter,
            scale: outerScale,
        })
    }

    const selectedId = ids[selectedIndex]
    const relatedIds = new Set<string>()
    for (const relation of options.relations ?? []) {
        if (relation.from === selectedId) relatedIds.add(relation.to)
        if (relation.to === selectedId) relatedIds.add(relation.from)
    }

    const innerIndices: number[] = []
    const outerIndices: number[] = []
    ids.forEach((id, index) => {
        if (index === selectedIndex) return
        if (relatedIds.has(id)) innerIndices.push(index)
        else outerIndices.push(index)
    })

    const result = new Array<Placement>(items.length)
    result[selectedIndex] = placement(
        origin.clone(),
        new Quaternion(),
        (options.centerScale ?? new Vector3(1.24, 1.24, 1.24)).clone(),
    )

    const assignRing = (indices: number[], radius: number, scale: Vector3, angle: number) => {
        const records = indices.map(index => items[index])
        const placements = ring(records, context, {
            radius,
            startAngle: angle,
            faceCenter,
            scale,
        })
        indices.forEach((sourceIndex, ringIndex) => {
            result[sourceIndex] = placements[ringIndex]
        })
    }

    assignRing(
        innerIndices,
        options.innerRadius ?? Math.max(1.6, outerRadius * 0.56),
        options.innerScale ?? new Vector3(0.96, 0.96, 0.96),
        startAngle,
    )
    assignRing(
        outerIndices,
        outerRadius,
        outerScale,
        startAngle + (outerIndices.length > 0 ? Math.PI / outerIndices.length : 0),
    )

    return result
}

/** Scene emission operators. */
export function encode<T>(items: readonly T[], placements: Placement[], options: EncodeOptions<T>): SceneFragment<T> {
    if (items.length !== placements.length) {
        throw new Error(`encode requires one placement per item; received ${items.length} items and ${placements.length} placements`)
    }
    return {
        nodes: items.map((item, index) => ({
            id: options.id(item, index),
            data: item,
            placement: placements[index],
            representation: typeof options.representation === 'function'
                ? options.representation(item, index)
                : options.representation,
            props: options.props?.(item, index),
        })),
        connections: [],
        labels: [],
    }
}

export function connect<T>(
    fragment: SceneFragment<T>,
    connections: readonly SceneConnection[],
): SceneFragment<T> {
    return { ...fragment, connections: [...fragment.connections, ...connections] }
}

export function bundleBy(
    connections: readonly SceneConnection[],
    keyOf: (connection: SceneConnection) => string,
): SceneConnection[] {
    return connections.map(connection => ({ ...connection, bundle: keyOf(connection) }))
}

export function label<T>(
    fragment: SceneFragment<T>,
    text: (node: SceneNode<T>) => string | undefined,
): SceneFragment<T> {
    const labels = fragment.nodes.flatMap(node => {
        const value = text(node)
        return value ? [{ id: `label:${node.id}`, target: node.id, text: value }] : []
    })
    return { ...fragment, labels: [...fragment.labels, ...labels] }
}

/** Compact vocabulary intended for composition-plan tooling and AI discovery. */
export const operatorCatalog = [
    { name: 'filter', phase: 'select', result: 'items' },
    { name: 'groupBy', phase: 'aggregate', result: 'groups' },
    { name: 'aggregate', phase: 'aggregate', result: 'summary' },
    { name: 'row', phase: 'arrange', result: 'placements' },
    { name: 'stack', phase: 'arrange', result: 'placements' },
    { name: 'ring', phase: 'arrange', result: 'placements' },
    { name: 'sphere', phase: 'arrange', result: 'placements' },
    { name: 'timeline', phase: 'arrange', result: 'placements' },
    { name: 'radialFocus', phase: 'arrange', result: 'placements' },
    { name: 'encode', phase: 'emit', result: 'nodes' },
    { name: 'connect', phase: 'emit', result: 'connections' },
    { name: 'bundleBy', phase: 'emit', result: 'bundles' },
    { name: 'label', phase: 'emit', result: 'labels' },
] as const

import {
    GEOMETRY_POINT_DOMAIN,
    type CurvePointOptions,
    type GeometryPlacement,
    type GeometryPointContext,
    type GeometryPointDomain,
    type RadialPointOptions,
} from '@/lib-components/geometry/types.js'

function createPointDomain<Item>(
    kind: GeometryPointDomain['kind'],
    parameters: Record<string, unknown>,
): GeometryPointDomain<Item> {
    return Object.freeze({
        [GEOMETRY_POINT_DOMAIN]: true as const,
        kind,
        parameters: Object.freeze({ ...parameters }),
    })
}

export function isGeometryPointDomain(value: unknown): value is GeometryPointDomain<any> {
    return Boolean(value && typeof value === 'object'
        && (value as GeometryPointDomain)[GEOMETRY_POINT_DOMAIN] === true)
}

export function points<Item = unknown>(
    placements: readonly GeometryPlacement<Item>[],
): GeometryPointDomain<Item> {
    return createPointDomain('points', { placements: Object.freeze([...placements]) })
}

export function curvePoints(options: CurvePointOptions): GeometryPointDomain {
    const { key, ...parameters } = options
    return createPointDomain('curve', { ...parameters, ...(key ? { key } : {}) })
}

export function radialPoints<Item = unknown>(options: RadialPointOptions<Item>): GeometryPointDomain<Item> {
    const { key, ...parameters } = options
    return createPointDomain('radial', { ...parameters, ...(key ? { key } : {}) })
}

export function mapPoints<Input = unknown, Output = Input>(
    domain: GeometryPointDomain<Input>,
    map: (context: GeometryPointContext<Input>) => GeometryPlacement<Output>,
): GeometryPointDomain<Output> {
    if (!isGeometryPointDomain(domain)) throw new TypeError('mapPoints() requires a GeometryPointDomain.')
    return createPointDomain('map', { domain, map })
}

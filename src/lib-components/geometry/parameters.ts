import type { GeometryParameter, GeometryParameterValues, GeometryValue } from '@/lib-components/geometry/types.js'
import { graphParameter, isGraphParameter, resolveGraphParameter } from '@/lib-components/graph/parameters.js'

export function parameter<Value>(name: string, fallback?: Value): GeometryParameter<Value> {
    return graphParameter(name, fallback)
}

export function isGeometryParameter(value: unknown): value is GeometryParameter<unknown> {
    return isGraphParameter(value)
}

export function resolveGeometryValue<Value>(
    value: GeometryValue<Value> | undefined,
    parameters: GeometryParameterValues,
): Value | undefined {
    return resolveGraphParameter(value, parameters, 'procedural geometry')
}

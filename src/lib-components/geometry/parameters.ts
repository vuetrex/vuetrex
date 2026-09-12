import {
    GEOMETRY_PARAMETER,
    type GeometryParameter,
    type GeometryParameterValues,
    type GeometryValue,
} from '@/lib-components/geometry/types.js'
import { unref } from 'vue'

export function parameter<Value>(name: string, fallback?: Value): GeometryParameter<Value> {
    if (!name.trim()) throw new TypeError('Geometry parameter names must not be empty.')
    return Object.freeze({
        [GEOMETRY_PARAMETER]: true as const,
        name,
        ...(fallback === undefined ? {} : { fallback }),
    })
}

export function isGeometryParameter(value: unknown): value is GeometryParameter<unknown> {
    return Boolean(value && typeof value === 'object' && (value as GeometryParameter)[GEOMETRY_PARAMETER] === true)
}

export function resolveGeometryValue<Value>(
    value: GeometryValue<Value> | undefined,
    parameters: GeometryParameterValues,
): Value | undefined {
    if (!isGeometryParameter(value)) return value
    const resolved = parameters[value.name]
    if (resolved !== undefined) return unref(resolved) as Value
    if ('fallback' in value) return value.fallback as Value
    throw new Error(`Missing required procedural geometry parameter '${value.name}'.`)
}

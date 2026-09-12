import { resolveGeometryValue } from '@/lib-components/geometry/parameters.js'
import type { Field, GeometryContext, GeometryParameterValues } from '@/lib-components/geometry/types.js'

export function evaluateField<Value, Item>(
    field: Field<Value, Item> | undefined,
    context: GeometryContext<Item>,
    parameters: GeometryParameterValues = {},
): Value | undefined {
    if (field === undefined) return undefined
    const evaluated = typeof field === 'function'
        ? (field as (context: GeometryContext<Item>) => Value)(context)
        : field
    return resolveGeometryValue(evaluated, parameters)
}

export function field<Value, Item = unknown>(value: Field<Value, Item>): Field<Value, Item> {
    return value
}

import type { Field, GeometryContext } from '@/lib-components/geometry/types.js'

export function evaluateField<Value, Item>(
    field: Field<Value, Item> | undefined,
    context: GeometryContext<Item>,
): Value | undefined {
    if (field === undefined) return undefined
    return typeof field === 'function'
        ? (field as (context: GeometryContext<Item>) => Value)(context)
        : field
}

export function field<Value, Item = unknown>(value: Field<Value, Item>): Field<Value, Item> {
    return value
}


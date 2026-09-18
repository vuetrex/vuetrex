import { resolveConnectorParameter } from '@/lib-components/connectors/parameters.js'
import type {
    ConnectorContext,
    ConnectorField,
    ConnectorParameterValues,
} from '@/lib-components/connectors/types.js'

export function resolveConnectorField<Value, Item>(
    field: ConnectorField<Value, Item> | undefined,
    context: ConnectorContext<Item>,
    parameters: ConnectorParameterValues = {},
): Value | undefined {
    const value = typeof field === 'function'
        ? (field as (context: ConnectorContext<Item>) => Value)(context)
        : field
    return resolveConnectorParameter(value, parameters)
}

/** Preserve item-aware type inference when defining a reusable connector field. */
export function connectorField<Value, Item = unknown>(
    field: ConnectorField<Value, Item>,
): ConnectorField<Value, Item> {
    return field
}

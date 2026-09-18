import type { ConnectorParameter, ConnectorParameterValues } from '@/lib-components/connectors/types.js'
import { graphParameter, isGraphParameter, resolveGraphParameter } from '@/lib-components/graph/parameters.js'

export function connectorParameter<Value>(name: string, fallback?: Value): ConnectorParameter<Value> {
    return graphParameter(name, fallback)
}

export function isConnectorParameter(value: unknown): value is ConnectorParameter<unknown> {
    return isGraphParameter(value)
}

export function resolveConnectorParameter<Value>(
    value: Value | ConnectorParameter<Value> | undefined,
    parameters: ConnectorParameterValues,
): Value | undefined {
    return resolveGraphParameter(value, parameters, 'connector')
}

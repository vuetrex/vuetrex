import { unref } from 'vue'

/** One immutable parameter token understood by every authored graph domain. */
export const GRAPH_PARAMETER = Symbol.for('@exceeder/vuetrex/graph-parameter')

export interface GraphParameter<Value = unknown> {
    readonly [GRAPH_PARAMETER]: true
    readonly name: string
    readonly fallback?: Value
}

export type GraphParameterValues = Readonly<Record<string, unknown>>

export interface GraphFieldContext<Item = unknown> {
    readonly item: Item
    readonly key: string
    readonly index: number
}

export function graphParameter<Value>(name: string, fallback?: Value): GraphParameter<Value> {
    if (!name.trim()) throw new TypeError('Graph parameter names must not be empty.')
    return Object.freeze({
        [GRAPH_PARAMETER]: true as const,
        name,
        ...(fallback === undefined ? {} : { fallback }),
    })
}

export function isGraphParameter(value: unknown): value is GraphParameter<unknown> {
    return Boolean(value && typeof value === 'object'
        && (value as GraphParameter)[GRAPH_PARAMETER] === true)
}

export function resolveGraphParameter<Value>(
    value: Value | GraphParameter<Value> | undefined,
    parameters: GraphParameterValues,
    domain = 'graph',
): Value | undefined {
    if (!isGraphParameter(value)) return value as Value | undefined
    const resolved = parameters[value.name]
    if (resolved !== undefined) return unref(resolved) as Value
    if ('fallback' in value) return value.fallback as Value
    throw new Error(`Missing required ${domain} parameter '${value.name}'.`)
}

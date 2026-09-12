import { joinGeometrySources } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, JoinOptions } from '@/lib-components/geometry/types.js'

export function join<Item = unknown>(
    inputs: readonly GeometrySource<Item>[],
    options: JoinOptions = {},
): GeometrySource<Item> {
    return joinGeometrySources(inputs, options)
}

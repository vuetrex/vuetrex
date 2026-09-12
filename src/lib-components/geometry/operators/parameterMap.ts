import { parameterMapGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, ParameterMapOptions } from '@/lib-components/geometry/types.js'

export function parameterMap<Item = unknown>(
    input: GeometrySource<Item>,
    options: ParameterMapOptions<Item>,
): GeometrySource<Item> {
    return parameterMapGeometrySource(input, options)
}

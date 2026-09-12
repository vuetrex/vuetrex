import { transformGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, TransformParameters } from '@/lib-components/geometry/types.js'

export function transform<Item = unknown>(input: GeometrySource<Item>, options: TransformParameters = {}): GeometrySource<Item> {
    return transformGeometrySource(input, options)
}

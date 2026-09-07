import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, TransformParameters } from '@/lib-components/geometry/types.js'

export function transform<Item = unknown>(input: GeometrySource<Item>, options: TransformParameters = {}): GeometrySource<Item> {
    const { key, ...parameters } = options
    return createGeometryNode<typeof parameters, Item>('transform', { geometry: input }, parameters, key)
}

import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, RandomizeOptions } from '@/lib-components/geometry/types.js'

export function randomize<Item = unknown>(input: GeometrySource<Item>, options: RandomizeOptions = {}): GeometrySource<Item> {
    const { key, ...parameters } = options
    return createGeometryNode<typeof parameters, Item>('randomize', { geometry: input }, parameters, key)
}

import { randomizeGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, RandomizeOptions } from '@/lib-components/geometry/types.js'

export function randomize<Item = unknown>(input: GeometrySource<Item>, options: RandomizeOptions = {}): GeometrySource<Item> {
    return randomizeGeometrySource(input, options)
}

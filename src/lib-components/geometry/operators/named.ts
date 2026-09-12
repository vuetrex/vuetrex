import { namedGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, NamedGeometryOptions } from '@/lib-components/geometry/types.js'

export function named<Item = unknown>(
    input: GeometrySource<Item>,
    name: NamedGeometryOptions['name'],
    options: { key?: string } = {},
): GeometrySource<Item> {
    return namedGeometrySource(input, name, options)
}

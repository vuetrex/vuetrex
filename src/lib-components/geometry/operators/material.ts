import { materialGeometrySource } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, MaterialChannelOptions } from '@/lib-components/geometry/types.js'

export function material<Item = unknown>(
    input: GeometrySource<Item>,
    material: MaterialChannelOptions['material'],
    options: { key?: string } = {},
): GeometrySource<Item> {
    return materialGeometrySource(input, material, options)
}

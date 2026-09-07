import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type {
    DistributionOptions,
    GeometrySource,
    SurfaceDistribution,
} from '@/lib-components/geometry/types.js'

export function distribute<Item = unknown>(
    input: GeometrySource,
    distribution: DistributionOptions<Item>,
): GeometrySource<Item> {
    if (Array.isArray(distribution)) {
        return createGeometryNode<{ points: unknown[] }, Item>('distribute', { geometry: input }, { points: [...distribution] })
    }
    const { key, ...options } = distribution as Exclude<DistributionOptions<Item>, readonly unknown[]>
    if ('pattern' in options && options.pattern === 'surface') {
        const { surface, ...parameters } = options as Omit<SurfaceDistribution, 'key'>
        return createGeometryNode<typeof parameters, Item>('distribute', { geometry: input, surface }, parameters, key)
    }
    return createGeometryNode<typeof options, Item>('distribute', { geometry: input }, options, key)
}

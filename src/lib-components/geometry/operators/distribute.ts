import { distributeGeometrySource } from '@/lib-components/geometry/graph.js'
import type {
    DistributionOptions,
    GeometrySource,
} from '@/lib-components/geometry/types.js'

export function distribute<Item = unknown>(
    input: GeometrySource,
    distribution: DistributionOptions<Item>,
): GeometrySource<Item> {
    return distributeGeometrySource(input, distribution)
}

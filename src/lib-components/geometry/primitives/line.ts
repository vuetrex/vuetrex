import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, LineParameters } from '@/lib-components/geometry/types.js'

export function line(options: LineParameters = {}): GeometrySource {
    const { key, ...parameters } = options
    return createGeometryNode('line', {}, parameters, key)
}


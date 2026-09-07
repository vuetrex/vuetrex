import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { BoxParameters, GeometrySource } from '@/lib-components/geometry/types.js'

export function box(options: BoxParameters = {}): GeometrySource {
    const { key, ...parameters } = options
    return createGeometryNode('box', {}, parameters, key)
}


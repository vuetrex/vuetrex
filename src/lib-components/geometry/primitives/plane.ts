import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, PlaneParameters } from '@/lib-components/geometry/types.js'

export function plane(options: PlaneParameters = {}): GeometrySource {
    const { key, ...parameters } = options
    return createGeometryNode('plane', {}, parameters, key)
}


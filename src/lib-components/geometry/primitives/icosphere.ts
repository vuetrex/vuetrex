import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { GeometrySource, IcosphereParameters } from '@/lib-components/geometry/types.js'

export function icosphere(options: IcosphereParameters = {}): GeometrySource {
    const { key, ...parameters } = options
    return createGeometryNode('icosphere', {}, parameters, key)
}


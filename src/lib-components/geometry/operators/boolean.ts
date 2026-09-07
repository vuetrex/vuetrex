import { createGeometryNode } from '@/lib-components/geometry/graph.js'
import type { CombineOptions, GeometrySource } from '@/lib-components/geometry/types.js'

export function combineBoolean<Item = unknown>(
    inputs: readonly GeometrySource<Item>[],
    options: CombineOptions = {},
): GeometrySource<Item> {
    const { key, operation = 'combine' } = options
    if (operation !== 'combine') {
        throw new Error(`Unsupported procedural Boolean operation: ${String(operation)}.`)
    }
    return createGeometryNode<{ operation: 'combine' }, Item>('boolean', { geometries: [...inputs] }, { operation }, key)
}

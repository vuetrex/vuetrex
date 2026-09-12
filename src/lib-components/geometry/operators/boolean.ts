import { join } from '@/lib-components/geometry/operators/join.js'
import type { CombineOptions, GeometrySource } from '@/lib-components/geometry/types.js'

/** @deprecated Use geo.join(). */
export function combineBoolean<Item = unknown>(
    inputs: readonly GeometrySource<Item>[],
    options: CombineOptions = {},
): GeometrySource<Item> {
    return join(inputs, options)
}

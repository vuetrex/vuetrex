import { field } from '@/lib-components/geometry/fields.js'
import { defineGeometry } from '@/lib-components/geometry/modules.js'
import { combineBoolean } from '@/lib-components/geometry/operators/boolean.js'
import { distribute } from '@/lib-components/geometry/operators/distribute.js'
import { parameterMap } from '@/lib-components/geometry/operators/parameterMap.js'
import { randomize } from '@/lib-components/geometry/operators/randomize.js'
import { transform } from '@/lib-components/geometry/operators/transform.js'
import { box } from '@/lib-components/geometry/primitives/box.js'
import { icosphere } from '@/lib-components/geometry/primitives/icosphere.js'
import { line } from '@/lib-components/geometry/primitives/line.js'
import { plane } from '@/lib-components/geometry/primitives/plane.js'

export const geo = Object.freeze({
    line,
    plane,
    box,
    icosphere,
    transform,
    distribute,
    parameterMap,
    boolean: combineBoolean,
    randomize,
    field,
})

export { GeometryNode } from '@/lib-components/geometry/GeometryNode.js'
export type { GeometryAnchor } from '@/lib-components/geometry/GeometryNode.js'
export { defineGeometry } from '@/lib-components/geometry/modules.js'
export { field } from '@/lib-components/geometry/fields.js'
export { isGeometrySource, geometryGraphSignature } from '@/lib-components/geometry/graph.js'
export type {
    BoxParameters,
    ColorRange,
    CombineOptions,
    CustomDistribution,
    DistributionOptions,
    EulerTuple,
    Field,
    GeometryContext,
    GeometryFactory,
    GeometryGraphNode,
    GeometryItemKey,
    GeometryNodeOptions,
    GeometryPlacement,
    GeometrySource,
    GridDistribution,
    IcosphereParameters,
    ItemDistribution,
    LineDistribution,
    LineParameters,
    NumberRange,
    ParameterMapOptions,
    PlaneParameters,
    PointDistribution,
    QuaternionTuple,
    RandomizeOptions,
    RotationLike,
    ScaleLike,
    SurfaceDistribution,
    TransformParameters,
    Vector3Like,
    Vector3Object,
    Vector3Tuple,
    VectorRange,
} from '@/lib-components/geometry/types.js'


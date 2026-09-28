import { field } from '@/lib-components/geometry/fields.js'
import { defineGeometry } from '@/lib-components/geometry/modules.js'
import { distribute } from '@/lib-components/geometry/operators/distribute.js'
import { join } from '@/lib-components/geometry/operators/join.js'
import { material } from '@/lib-components/geometry/operators/material.js'
import { named } from '@/lib-components/geometry/operators/named.js'
import { parameterMap } from '@/lib-components/geometry/operators/parameterMap.js'
import { randomize } from '@/lib-components/geometry/operators/randomize.js'
import { transform } from '@/lib-components/geometry/operators/transform.js'
import { box } from '@/lib-components/geometry/primitives/box.js'
import { icosphere } from '@/lib-components/geometry/primitives/icosphere.js'
import { line } from '@/lib-components/geometry/primitives/line.js'
import { plane } from '@/lib-components/geometry/primitives/plane.js'
import { parameter } from '@/lib-components/geometry/parameters.js'
import { curvePoints, mapPoints, points, radialPoints } from '@/lib-components/geometry/points.js'

export const geo = Object.freeze({
    line,
    plane,
    box,
    icosphere,
    transform,
    distribute,
    join,
    parameterMap,
    material,
    named,
    randomize,
    field,
    param: parameter,
    points,
    curvePoints,
    radialPoints,
    mapPoints,
})

export { GeometryNode } from '@/lib-components/geometry/GeometryNode.js'
export type { GeometryAnchor, GeometryMaterialChannels, GeometryEffectChannels } from '@/lib-components/geometry/GeometryNode.js'
export { defineGeometry, defineGeometryOutputs } from '@/lib-components/geometry/modules.js'
export { field } from '@/lib-components/geometry/fields.js'
export { parameter, isGeometryParameter } from '@/lib-components/geometry/parameters.js'
export { curvePoints, isGeometryPointDomain, mapPoints, points, radialPoints } from '@/lib-components/geometry/points.js'
export { isGeometrySource, geometryGraphSignature } from '@/lib-components/geometry/graph.js'
export { describeGeometryGraph, geometryGraphToDot, inspectGeometry } from '@/lib-components/geometry/diagnostics.js'
export type {
    GeometryBoundsDescription,
    GeometryGraphDescription,
    GeometryGraphNodeDescription,
    GeometryInspection,
    GeometryRuntimeDiagnostics,
    GeometryUpdateKind,
} from '@/lib-components/geometry/diagnostics.js'
export type {
    BoxParameters,
    ColorRange,
    CurvePointOptions,
    CustomDistribution,
    DistributionOptions,
    EulerTuple,
    Field,
    GeometryContext,
    GeometryChain,
    GeometryFactory,
    GeometryGraphNode,
    GeometryHit,
    GeometryItemKey,
    GeometryOutputMap,
    GeometryOutputs,
    GeometryOutputsFactory,
    GeometryParameter,
    GeometryParameterValues,
    GeometryPipeOperator,
    GeometryNodeOptions,
    GeometryPointContext,
    GeometryPointDomain,
    GeometryRecordSelector,
    GeometryPlacement,
    GeometrySource,
    GridDistribution,
    IcosphereParameters,
    ItemDistribution,
    JoinOptions,
    LineDistribution,
    LineParameters,
    NumberRange,
    MaterialChannelOptions,
    NamedGeometryOptions,
    ParameterMapOptions,
    PlaneParameters,
    PointDistribution,
    QuaternionTuple,
    RadialPointOptions,
    RandomizeOptions,
    RotationLike,
    ScaleLike,
    SurfaceDistribution,
    TransformParameters,
    Vector3Like,
    Vector3Object,
    Vector3Tuple,
    VectorRange,
    GeometryValue,
} from '@/lib-components/geometry/types.js'

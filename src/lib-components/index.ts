export type { VxStage, VxSettings, VxMouseEvent } from '@/lib-components/vuetrex.js';
export type {
    VxAnimProps,
    VxAnimOptions,
    VxDiagnosticsSettings,
    VxFitOptions,
    VxFogSettings,
    VxWallSettings,
} from '@/lib-components/three/stage.js';
export { DisplayWall } from '@/lib-components/nodes/DisplayWall.js';
export type {
    VxDisplayPaintContext,
    VxDisplaySurface,
    VxDisplayWallShape,
} from '@/lib-components/nodes/DisplayWall.js';
export type { VxMaterialProps, VxHoverProps } from '@/lib-components/nodes/material.js';
export {
    defineGeometry,
    defineGeometryOutputs,
    field,
    geo,
    GeometryNode,
    describeGeometryGraph,
    geometryGraphToDot,
    inspectGeometry,
    isGeometryParameter,
    isGeometryPointDomain,
    mapPoints,
    parameter,
    points,
    curvePoints,
    radialPoints,
    geometryGraphSignature,
    isGeometrySource,
} from '@/lib-components/geometry/index.js';
export type {
    BoxParameters,
    ColorRange,
    CombineOptions,
    CustomDistribution,
    DistributionOptions,
    Field as GeometryField,
    GeometryAnchor,
    GeometryChain,
    GeometryContext,
    GeometryFactory,
    GeometryGraphNode,
    GeometryHit,
    GeometryItemKey,
    GeometryMaterialChannels,
    GeometryOutputMap,
    GeometryOutputs,
    GeometryOutputsFactory,
    GeometryParameter,
    GeometryParameterValues,
    GeometryPipeOperator,
    GeometryPlacement,
    GeometryPointContext,
    GeometryPointDomain,
    GeometryRecordSelector,
    GeometrySource,
    GeometryValue,
    GridDistribution,
    IcosphereParameters,
    ItemDistribution,
    JoinOptions,
    LineDistribution,
    LineParameters,
    ParameterMapOptions,
    PlaneParameters,
    PointDistribution,
    RadialPointOptions,
    CurvePointOptions,
    MaterialChannelOptions,
    NamedGeometryOptions,
    RandomizeOptions,
    RotationLike,
    ScaleLike,
    SurfaceDistribution,
    TransformParameters,
    Vector3Like,
} from '@/lib-components/geometry/index.js';
export type {
    GeometryBoundsDescription,
    GeometryGraphDescription,
    GeometryGraphNodeDescription,
    GeometryInspection,
    GeometryRuntimeDiagnostics,
    GeometryUpdateKind,
} from '@/lib-components/geometry/index.js';
export {
    aggregate,
    bundleBy,
    compose,
    connect,
    encode,
    filter,
    groupBy,
    label,
    operatorCatalog,
    radialFocus,
    ring,
    row,
    sphere,
    stack,
    timeline,
} from '@/lib-components/composition/index.js';
export type {
    Capability,
    CapabilityType,
    ComposedScene,
    CompositionContext,
    Placement,
    RadialFocusOptions,
    RadialRelation,
    RepresentationRecipe,
    SceneConnection,
    SceneFragment,
    SceneLabel,
    SceneNode,
    SpatialContext,
} from '@/lib-components/composition/index.js';
export { InstanceNode } from '@/lib-components/nodes/InstanceNode.js';
export type {
    InstanceAnchor,
    InstanceEncoding,
    InstanceGeometry,
    InstanceHit,
    InstanceItem,
    InstanceKey,
} from '@/lib-components/nodes/InstanceNode.js';
export { default as Vuetrex } from '@/lib-components/vuetrex.js';

export { registerElement } from '@/lib-components/nodes/types.js';
export type { ClassComponent, FunctionalComponent, ElementRegistry } from '@/lib-components/nodes/types.js';

export { Node } from '@/lib-components/nodes/Node.js';
export { Base } from '@/lib-components/nodes/Base.js';
export { Panel } from '@/lib-components/nodes/Panel.js';
export { Spacer } from '@/lib-components/nodes/Spacer.js';
export { BusConnectorNode } from '@/lib-components/nodes/BusConnectorNode.js';
export type {
    BusRouteOptions,
    ConnectorLane,
    ConnectorPort,
    ConnectorPortCoordinates,
    ConnectorPortName,
    ConnectorRouteOptions,
} from '@/lib-components/three/connectors/types.js';
export type { VuetrexStage } from '@/lib-components/three/stage.js';

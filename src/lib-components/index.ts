export type { VuetrexProps, VuetrexEvents, VxSettings, VxFogSettings, VxDiagnosticsSettings } from './root-api.js';
export type { VxCameraController, VxCameraTimeline, VxCameraOrbit, VxCameraView,
    VxCameraOrbitUpdate, VxCameraTweenOptions, VxCameraTimelineOptions } from './three/cameraController.js';
export type { VxStage, VxMouseEvent } from '@/lib-components/vuetrex.js';
export type {
    VxAnimProps,
    VxAnimOptions,
    VxFitOptions,
} from '@/lib-components/three/stage.js';
export { DisplayWall } from '@/lib-components/nodes/DisplayWall.js';
export type {
    VxDisplayPaintContext,
    VxDisplaySurface,
    VxDisplayWallShape,
} from '@/lib-components/nodes/DisplayWall.js';
export type { VxMaterialProps, VxHoverProps, VxResolvedMaterial } from '@/lib-components/styling/types.js';
export { resolveMaterial } from '@/lib-components/styling/resolveMaterial.js';
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
export {
    defineParticleOutputs,
    defineParticles,
    isParticleParameter,
    isParticleSource,
    particleField,
    particleGraphSignature,
    particleParameter,
    particles,
    ParticleNode,
    registerParticleBackend,
    resolveParticleField,
    resolveParticleValue,
} from '@/lib-components/particles/index.js';
export {
    connectors,
    compileConnectors,
    connectorField,
    connectorGraphSignature,
    connectorGraphToDot,
    connectorParameter,
    connectorStrategy,
    defineConnectorOutputs,
    defineConnectors,
    describeConnectorGraph,
    inspectConnectors,
    isConnectorParameter,
    isConnectorSource,
    registerConnectorAppearance,
    registerConnectorStrategy,
    resolveConnectorField,
    resolveConnectorParameter,
} from '@/lib-components/connectors/index.js';
export type * from '@/lib-components/connectors/index.js';
export type {
    CloudParticleOptions,
    CloudsParticleOptions,
    CompiledParticleEmitter,
    CompiledParticleProgram,
    ParticleAnchor,
    ParticleAppearanceOptions,
    ParticleAttractorForce,
    ParticleBackend,
    ParticleBackendContext,
    ParticleBackendFactory,
    ParticleBackendName,
    ParticleChain,
    ParticleCloud,
    ParticleColor,
    ParticleContext,
    ParticleCount,
    ParticleDiagnostics,
    ParticleFactory,
    ParticleField,
    ParticleForce,
    ParticleGraphNode,
    ParticleGravityForce,
    ParticleHit,
    ParticleJoinOptions,
    ParticleMotionOptions,
    ParticleNodeOptions,
    ParticleOrbitOptions,
    ParticleOutputMap,
    ParticleOutputs,
    ParticleOutputsFactory,
    ParticleParameter,
    ParticleParameterValues,
    ParticlePath,
    ParticlePipeOperator,
    ParticleSimulationOptions,
    ParticleSource,
    ParticleTarget,
    ParticleValue,
    ParticleVector3Like,
    ParticleVector3Object,
    ParticleVector3Tuple,
    ParticleVortexForce,
    PathParticleOptions,
    PathsParticleOptions,
    ResolvedParticleTarget,
} from '@/lib-components/particles/index.js';
export type {
    BoxParameters,
    ColorRange,
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
export { ConnectorGraphHost } from '@/lib-components/nodes/ConnectorGraphHost.js';
export type { ConnectorGraphHostEvents } from '@/lib-components/nodes/ConnectorGraphHost.js';
export { StageDeclaration } from '@/lib-components/nodes/StageDeclaration.js';
export type { VuetrexStage } from '@/lib-components/three/stage.js';

export { VxStylesheet, VxStyleSheet, defineVxStyleSheet } from './styling/stylesheets.js';
export type { VxMaterialBinding, VxMaterialStyle, VxStyleSheetDefinition, VxStyleScheme, VxColorScheme } from './styling/stylesheets.js';
export { finishes } from './styling/finishes.js';
export { useCanvasTexture } from './styling/textures.js';
export type { VxTexturePurpose, VxCanvasTextureOptions } from './styling/textures.js';
export type { VxEnvironmentProps, VxCameraProps, VxFloorProps } from './scene/declarations.js';

export type { VxLightingProps, VxShadowQuality } from './three/lighting/LiveLighting.js';

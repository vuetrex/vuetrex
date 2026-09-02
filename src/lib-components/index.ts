export type { VxStage, VxSettings, VxMouseEvent } from '@/lib-components/vuetrex.js';
export type {
    VxAnimProps,
    VxAnimOptions,
    VxDiagnosticsSettings,
    VxFitOptions,
    VxWallSettings,
} from '@/lib-components/three/stage.js';
export { DisplayWall } from '@/lib-components/nodes/DisplayWall.js';
export type {
    VxDisplayPaintContext,
    VxDisplaySurface,
    VxDisplayWallMode,
    VxDisplayWallShape,
} from '@/lib-components/nodes/DisplayWall.js';
export type { VxMaterialProps, VxHoverProps } from '@/lib-components/nodes/material.js';
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
export type { VuetrexStage } from '@/lib-components/three/stage.js';

import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Base} from '@/lib-components/nodes/Base.js';
import {GroupNode} from '@/lib-components/nodes/GroupNode.js';
import {Layer} from '@/lib-components/nodes/Layer.js';
import {Row} from '@/lib-components/nodes/Row.js';
import {Stack} from '@/lib-components/nodes/Stack.js';
import {Ring} from '@/lib-components/nodes/Ring.js';
import {ConnectorNode} from '@/lib-components/nodes/ConnectorNode.js';
import {BusConnectorNode} from '@/lib-components/nodes/BusConnectorNode.js';
import {Panel} from '@/lib-components/nodes/Panel.js';
import {InstanceNode} from '@/lib-components/nodes/InstanceNode.js';
import {DisplayWall} from '@/lib-components/nodes/DisplayWall.js';
import {Spacer} from '@/lib-components/nodes/Spacer.js';
import {GeometryNode} from '@/lib-components/geometry/GeometryNode.js';

import {Box} from '@/lib-components/nodes/shapes/Box.js';
import {Cylinder} from '@/lib-components/nodes/shapes/Cylinder.js';
import {Wedge} from '@/lib-components/nodes/shapes/Wedge.js';


export interface FunctionalComponent {
    setup(stage: VuetrexStage): Base
}

export type ClassComponent = new (stage: VuetrexStage) => Base

export type ElementRegistry = Record<string, ClassComponent | FunctionalComponent>

/**
 * Built-in element types shipped with Vuetrex.
 * Use registerElement() to add custom types globally or pass an `elements`
 * prop to <vuetrex> for per-instance registration.
 */
const builtins: ElementRegistry = {
    'vx-group': GroupNode,
    'vx-layer': Layer,
    //layout
    'vx-row': Row,
    'vx-stack': Stack,
    'vx-ring': Ring,
    'vx-connector': ConnectorNode,
    'vx-bus-connector': BusConnectorNode,
    'bus-connector': BusConnectorNode,
    'vx-panel': Panel,
    'vx-instances': InstanceNode,
    'vx-display-wall': DisplayWall,
    'vx-spacer': Spacer,
    'vx-geometry': GeometryNode,
    //models
    'vx-box': Box,
    'vx-cylinder': Cylinder,
    'vx-wedge': Wedge,
}

/**
 * Register a custom element type globally. Must be called before the
 * <vuetrex> component mounts. For per-instance registration use the
 * `elements` prop instead.
 */
export function registerElement(tag: string, impl: ClassComponent | FunctionalComponent): void {
    builtins[tag] = impl
}

export { builtins as types }

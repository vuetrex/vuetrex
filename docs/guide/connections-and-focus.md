---
title: Connections and focus
description: Keep links, interaction, and camera framing tied to semantic IDs.
---

# Connections and focus

<script setup>
import ConnectorTemplatesScene from '../examples/src/ConnectorTemplatesScene.vue'
import connectorTemplatesSource from '../examples/src/ConnectorTemplatesScene.vue?raw'
import cafeSource from '../examples/src/Cafe3D.vue?raw'
import ConnectorStrategiesScene from '../examples/src/ConnectorStrategiesScene.vue'
import connectorStrategiesSource from '../examples/src/ConnectorStrategiesScene.vue?raw'
import ConnectorPortsScene from '../examples/src/ConnectorPortsScene.vue'
import connectorPortsSource from '../examples/src/ConnectorPortsScene.vue?raw'
import ConnectorNetworksScene from '../examples/src/ConnectorNetworksScene.vue'
import connectorNetworksSource from '../examples/src/ConnectorNetworksScene.vue?raw'
import ConnectorFocusScene from '../examples/src/ConnectorFocusScene.vue'
import connectorFocusSource from '../examples/src/ConnectorFocusScene.vue?raw'
</script>

## The problem: geometry is visible but not explainable

A useful operational view must answer two questions quickly: “what is this connected to?” and “can I inspect this
specific thing?” Vuetrex uses semantic node IDs as stable addresses for both.

## Give nodes domain IDs

```vue
<vx-box id="gateway" name="Edge gateway" text="gateway" />
<vx-box id="orders" name="Orders API" text="orders" />
<vx-box id="payments" name="Payments API" text="payments" />
```

IDs and non-empty names must be unique inside one stage during development. Use `id` for routes and focus; keep `name`
human-readable.

## Choose where to declare a relationship

All three forms use the same compiler, routes, and appearance backends:

| Form | Best for | Public edge handle |
| --- | --- | --- |
| `vx-edge` inside a spatial node | A few outgoing relationships | `(parent ID, key)` |
| `vx-connectors` with `vx-edge` children | A small wiring diagram | `(host scope, key)` |
| `vx-connectors :graph="source"` | Data collections and reusable graph modules | `(host scope, record key)` |

Give endpoints explicit semantic IDs and each template edge a stable Vue `key`. Local edges inherit `from` from
their **direct spatial parent**. An explicit `from` must match that ID. Central edges require both `from` and `to`.
Periods in IDs have no special meaning: node IDs and port names are always separate attributes.

```vue
<!-- Local -->
<vx-box id="gateway">
  <vx-edge key="gateway-orders" to="orders" from-port="right" to-port="left"
           stroke-color="#73cad1" :stroke-width="0.025" />
</vx-box>
<vx-box id="orders" />

<!-- Central, with defaults for every child -->
<vx-connectors scope="services" route-strategy="orthogonal" :clearance="0.3">
  <vx-edge key="orders-payments" from="orders" to="payments" />
</vx-connectors>
<vx-box id="payments" />

<!-- Data-driven: dependencyGraph is a ConnectorSource -->
<vx-connectors scope="dependencies" :graph="dependencyGraph" appearance="primary" />
```

A host accepts **either** `graph` **or** edge children; combining them is an error. Keyed `v-for` and `v-if` children
are supported. Duplicate `(scope, key)` handles fail even across hosts. Always supply `scope` when a handle needs to
survive host remounts; an omitted scope uses a renderer-generated owner identity.

Ports and edges are lifecycle declarations. They do not affect layout, measured size, focus bounds, or Three.js
children. Fixed meshes, `vx-geometry`, and `vx-instances` accept declarations but reject spatial children; use a
`vx-group` or other container for geometry nesting. `vx-panel` keeps its normal container behavior.

## Author an immutable connector graph

```vue
<script setup lang="ts">
import { connectors } from '@exceeder/vuetrex'

const dependencies = connectors
  .edge('gateway', 'orders', { key: 'gateway-orders' })
  .route({ strategy: 'orthogonal', fromPort: 'right', toPort: 'left', clearance: 0.2 })
  .stroke({ color: 0x6fcbd1, width: 0.018, markerEnd: 'arrow' })
</script>

<template>
  <vx-connectors :graph="dependencies" />
</template>
```

`ConnectorSource` values are frozen descriptions, not scene objects. `<vx-connectors>` is one lifecycle host for any
number of records. It has no `Element3d`, ID, layout size, focus target, camera bounds, or Three.js group of its own.
Its position in the template has no spatial meaning, and endpoints may appear before or after it.

Functional and fluent forms are equivalent: `connectors.stroke(connectors.route(source, route), style)` builds the
same graph as `source.route(route).stroke(style)`. The same source can be reused by several immutable parents.

### Compare route strategies

These are four independent edges built from one keyed collection. Their route strategy is selected from each data
item; the stroke colour comes from that same item.

<ClientOnly>
  <ExampleTabs title="Edges · direct, orthogonal, Bezier, and spline" :source="connectorStrategiesSource">
    <ConnectorStrategiesScene />
  </ExampleTabs>
</ClientOnly>

`direct` is the shortest route. `orthogonal` produces axis-aligned runs and can avoid stage-node obstacles. `bezier`
uses endpoint normals as curve handles, while `spline` creates a smooth route through raised lead and midpoint
controls. `manual` is available when the application supplies every intermediate waypoint explicitly.

## Map a keyed data collection

```ts
const dependencyGraph = computed(() => connectors
  .edges(dependencies.value, {
    keyBy: ({ item: edge }) => edge.id,
    from: ({ item: edge }) => edge.source,
    to: ({ item: edge }) => edge.target,
  })
  .route({
    strategy: ({ item: edge }) => edge.critical ? 'orthogonal' : 'bezier',
    elevation: ({ item: edge }) => edge.critical ? 0.45 : 0.15,
    lane: 'auto',
  })
  .stroke({
    color: ({ item: edge }) => edge.critical ? 0xff8a65 : 0x73cad1,
    width: ({ item: edge }) => 0.008 + edge.throughput * 0.0004,
  })
  .named(({ item: edge }) => `dependency:${edge.id}`))
```

Objects with an `id` can omit `keyBy`; other collections must supply it. Duplicate or empty keys fail immediately.
Stable keys preserve paths, renderer identity, hit metadata, and compatible backend slots when data is reordered.

## Route through ports and space

Named bounds ports are `auto`, `center`, `left`, `right`, `front`, `back`, `top`, and `bottom`. Normalized
`{ x, y, z }` coordinates select an exact point in current world bounds. A node can also override `connectorPorts()`
and be addressed with `{ node: 'gateway', port: { name: 'metrics' } }`.

Endpoints may be semantic IDs, `{ node, port }`, world points, or points local to a named node:

```ts
connectors.edge(
  { node: 'orders', port: { x: 1, y: 0.7, z: 0.5 } },
  { position: [0, 0.4, 1], space: { node: 'payments' } },
)
```

### Try named and normalized ports

The buttons below rebuild one immutable graph with different endpoint descriptions. Notice that the dot and arrow move
to the selected surfaces; no coordinates need to be recalculated when the boxes move.

<ClientOnly>
  <ExampleTabs title="Ports · named surfaces and exact bounds positions" :source="connectorPortsSource">
    <ConnectorPortsScene />
  </ExampleTabs>
</ClientOnly>

Named ports choose the centre of a bounds face and provide its outward normal. Normalized ports use `0` for the
minimum bound, `1` for the maximum, and `0.5` for the centre on each axis. For example,
`{ x: 1, y: 1, z: 0.5 }` is the top-right edge of an object's measured world bounds. A component can expose domain
ports such as `metrics` or `replication`; callers then use `{ node: 'database', port: { name: 'replication' } }`.

Built-in strategies are `orthogonal`, `direct`, `bezier`, `spline`, and `manual`.
`manual` consumes `waypoints`, which may also use world or node-local space. Ground routing uses stage-node obstacles
by default. `clearance` controls their expanded footprint. `elevation` raises a route,
and automatic lanes are centered by stable peer key.

## Publish ports from a reusable component

A Vue component is not an endpoint. Its documented spatial root owns the ID and ports. The cafe below publishes six
semantic ports, calculated from the same width and depth props as its geometry. Its `#ports` and `#connections` slots
render directly under that root. Rotate or resize it to see the ports follow the model.

<ClientOnly>
  <ExampleTabs title="Component ports · rotate and resize a cafe" :source="connectorTemplatesSource">
    <ConnectorTemplatesScene />
  </ExampleTabs>
</ClientOnly>

<details>
<summary>Cafe3D · component author contract</summary>
<pre><code>{{ cafeSource }}</code></pre>
</details>

Two coordinate forms are available:

```vue
<vx-port name="internet" :position="[width / 2, 0.4, 0]" :normal="[1, 0, 0]" />
<vx-port name="delivery" face="front" :at="[0.8, 0.2]" />
```

`position` and `normal` are a required pair in the owner's local coordinates. They cannot be combined with `face`
or `at`. Positions may lie outside the surface. Normals must be nonzero; they use the inverse-transpose world
transform and are normalized, including under nonuniform scale.

Face ports use **untransformed local bounds** and outward axis normals. `at` defaults to `[0.5, 0.5]`, with each
coordinate in `[0, 1]`. Empty or zero-size bounds produce an error. These local axes stay attached to a rotated cafe:

| Face | `at` increases along | Outward normal |
| --- | --- | --- |
| front / back | local X, local Y | +Z / −Z |
| right / left | local Z, local Y | +X / −X |
| top / bottom | local X, local Z | +Y / −Y |

![Top view of a cafe rotated 45 degrees, with local axes and port normals](/images/cafe-ports.svg)

Legacy graph bounds ports and `{ x, y, z }` coordinates still use world bounds. Use a declared face port when a
connection surface must rotate with its model.

Callers add a new name or explicitly override a built-in name:

```vue
<Cafe3D id="cafe" :width="3" :depth="2">
  <template #ports>
    <vx-port name="delivery" face="front" :at="[0.8, 0.2]" />
    <vx-port name="mainDoor" override :position="[0.5, 0.15, 1]" :normal="[0, 0, 1]" />
    <vx-port name="sewer" override disabled />
  </template>
  <template #connections>
    <vx-edge key="cafe-router" to="router" from-port="internet" />
  </template>
</Cafe3D>
```

Only one base and one override are allowed per name, independent of child order. An override must target an existing
built-in port. A disabled override is the only form that needs no coordinates. Optional `direction="in"`, `out`, or
`bidirectional` is metadata for future tools; it does not change route geometry. Missing and disabled ports keep the
edge authored and report distinct unresolved reasons. Removing an override restores its built-in port.

A wrapper must deliberately forward `$attrs` and slots to the same spatial root. Disable automatic attribute
inheritance when binding `$attrs` explicitly:

```vue
<!-- TransformNode.vue: GeoNode must itself expose #ports and #connections. -->
<script setup lang="ts">
import type { Placement } from '@exceeder/vuetrex'
import GeoNode from './GeoNode.vue'
defineOptions({ inheritAttrs: false })
defineProps<{ placement: Placement }>()
</script>
<template>
  <vx-group :placement="placement">
    <GeoNode v-bind="$attrs">
      <template #ports><slot name="ports" /></template>
      <template #connections><slot name="connections" /></template>
    </GeoNode>
  </vx-group>
</template>
```

If the supplied component does not forward a slot, a wrapper cannot inject declarations into that component's root.
It can instead expose ports on its own ID-bearing group. Those ports then belong to the wrapper's namespace. Raw
`vx-*` tags take ordinary children; named slots are an API provided by Vue components.

### Workshop VNode: slabs plus declaration slots

The workshop component keeps its `header`, `body`, and `footer` props. Its single `vx-stack` root now forwards `$attrs`,
publishes `input` on its left face and `output` on its right face, and forwards both declaration slots:

```vue
<!-- Inside VNode.vue; defineOptions({ inheritAttrs: false }) in script setup -->
<vx-stack v-bind="$attrs" :gap="0.02">
  <!-- existing footer, body, and header boxes -->
  <vx-port name="input" face="left" />
  <vx-port name="output" face="right" />
  <slot name="ports" />
  <slot name="connections" />
</vx-stack>

<!-- In the caller -->
<VNode id="camera" header="Camera" body="Ready" footer="Online">
  <template #ports><vx-port name="trigger" face="front" :at="[0.5, 0.8]" /></template>
  <template #connections>
    <vx-edge key="camera-config" to="config" from-port="output" to-port="input" />
  </template>
</VNode>
<VNode id="config" header="Config" />
<vx-connectors scope="workshop" route-strategy="orthogonal">
  <vx-edge key="config-camera" from="config" to="camera" to-port="trigger" />
</vx-connectors>
```

These face ports use the whole stack's bounds. A port on a specific slab should be explicitly published by the
component, so callers do not need to guess which visual child to address.

## Put shared presentation in the template

`appearance`, `route-strategy`, `clearance`, `elevation`, `stroke-color`, `stroke-width`, `stroke-opacity`,
`marker-start`, and `marker-end` work on both hosts and edges. Markers accept `arrow`, `dot`, `diamond`, `none`, or
bound `false`. Values resolve from backend defaults → named appearance → host props → edge props or explicit graph
record fields. Removing a prop restores inherited values. Color and width changes retain unchanged route points.

```vue
<script setup lang="ts">
import { VxStyleSheet, defineVxStyleSheet } from '@exceeder/vuetrex'
const styles = defineVxStyleSheet({
  common: { connectors: { primary: {
    routeStrategy: 'orthogonal', clearance: 0.3,
    strokeColor: '#73cad1', strokeWidth: 0.025, markerEnd: 'arrow',
  } } },
  dark: { connectors: { primary: { strokeColor: '#b4f3ff' } } },
})
</script>
<template>
  <VxStyleSheet :sheets="[styles]" scheme="dark">
    <Vuetrex>
      <!-- endpoint nodes -->
      <vx-connectors scope="links" :graph="dependencyGraph" appearance="primary" />
    </Vuetrex>
  </VxStyleSheet>
</template>
```

Connector appearances have their own `connectors` namespace, separate from mesh `materials`. They merge through
common/light/dark stylesheet layers. `class` and CSS selectors cannot style a Three.js connector host. Keep advanced
flow and geometry factories in TypeScript; per-record graph fields take precedence over template defaults.

## Layer strokes, geometry, and particle flow

Appearance operators have stable keys. A route can have a broad under-stroke, a dashed foreground, custom geometry, and
particles without calculating its path again:

```ts
import { connectors, geo, particles } from '@exceeder/vuetrex'

const diamond = geo.box({ width: 0.1, height: 0.1, depth: 0.1 })

const traffic = connectors
  .edge('orders', 'payments', { key: 'orders-payments', item: paymentLink })
  .route({ strategy: 'bezier', elevation: 0.4 })
  .stroke({ key: 'underlay', color: 0x18333a, width: 0.06, markerEnd: false })
  .stroke({ key: 'shaft', color: 0x73cad1, width: 0.015, dash: [0.1, 0.05] })
  .marker({ end: diamond, scale: 0.8, align: 'tangent' })
  .flow(route => particles
    .path(route.points, { key: route.key, item: route.item, count: 12 })
    .appearance({ color: 0xa5f3fc, size: 0.035 })
    .motion({ speed: 0.7 }))
  .geometry(route => geo.line({ points: route.points, thickness: 0.006 }))
```

`flow()` returns a normal `ParticleSource` and uses the registered particle backend. `marker()` and `geometry()`
consume normal `GeometrySource` values and share the stage geometry prototype pool. Adding a marker, geometry, or flow
does not remove the default keyed `shaft`; customize that layer with `.stroke({ key: 'shaft', ... })`.

## Fan out and bundle

```ts
const fanout = connectors
  .bus('gateway', apiIds, { key: 'gateway-apis' })
  .route({ fromPort: 'right', toPort: 'left', elevation: 0.2 })
  .stroke()

const bundled = connectors
  .edges(links, { keyBy: 'id', from: ({ item: link }) => link.source, to: ({ item: link }) => link.target })
  .bundle({ keyBy: ({ item: link }) => link.channel, width: 0.07 })
  .stroke({ width: 0.014 })
```

A bus resolves into keyed source, trunk, and branch runs, junctions, and one ordered traversal per target. `bundle()`
groups the members' actual route networks and preserves their member keys. It does not claim to be a highway router;
a future highway strategy needs independent routing acceptance tests.

### See shared route structure

This scene combines a bus from the gateway to three APIs with a bundle from orders to two workers. The bus shares
source and trunk runs before branching; the purple bundle groups related independent edges under one semantic key.

<ClientOnly>
  <ExampleTabs title="Networks · bus branches, bundle membership, and shared flow" :source="connectorNetworksSource">
    <ConnectorNetworksScene />
  </ExampleTabs>
</ClientOnly>

The particle factory runs once per terminal traversal here, so every bus destination receives a complete source-to-
target flow. Use `{ scope: 'network' }` when a factory should instead see all runs and junctions at once.

Traversal-based flow and geometry factories are deferred when a route has fewer than two points or zero length
(for example, while endpoints are still being laid out). Their outputs return automatically once the route has a span.
Whole-network factories still receive the complete network, including collapsed runs.

Factories consume each terminal traversal by default. Whole-network factories are explicit:

```ts
fanout.flow(network => particles.path(network.runs[0].points), {
  key: 'shared-flow',
  scope: 'network',
})
```

## Handle connector interaction

```vue
<vx-connectors
  :graph="dependencyGraph"
  @click="(hit, event) => selectDependency(hit.key)"
  @pointerenter="hit => hovered = hit.key"
/>
```

Picking is owner-level and opt-in; no edge becomes a `Node`. Hits distinguish edges and bundles, include the stable
key and source item, identify stroke, marker, geometry, or particle output, report the actual raycast intersection as
a frozen tuple, and include normalized `pathPosition` in `[0, 1]`. The original event also exposes the same value as
`vxConnector`. Each pick includes `hit.handle`, the same `{ scope, key }` used by template and graph edges.
Events on an individual central edge and its host both receive that handle; connector events are separate from
spatial-node bubbling.

`stage.connections.get({ scope, key })` and `.list({ scope? })` return frozen snapshots with `handle`, `authored`,
optional `resolved` route data, and separate `unresolved` reasons. `.portsOf(nodeId)` returns local port descriptions,
including disabled ports. Invisible ports are not pickable: a future editor can create visible handles using these
owner/name identities. Interactive creation, retargeting, deletion, and preview dragging are not implemented yet.
Keep editable relationships in reactive application data and update that data to accept a future editing request.

### Pick a route and focus its endpoints

Click a broad connector to see its key and the clicked percentage along the route. Click a box to focus its measured
world bounds, then use **Overview** to return to the whole scene.

<ClientOnly>
  <ExampleTabs title="Interaction · connector hits and camera focus" :source="connectorFocusSource">
    <ConnectorFocusScene />
  </ExampleTabs>
</ClientOnly>

## Focus measured content, not guessed coordinates

```vue
<script setup lang="ts">
const camera = ref('scene')

function inspect(id: string) {
  camera.value = camera.value === id ? 'scene' : id
}
</script>

<template>
  <Vuetrex :camera="camera">
    <vx-row>
      <ServiceNode
        v-for="service in services"
        :key="service.id"
        :service="service"
        @click="inspect(service.id)"
      />
    </vx-row>
  </Vuetrex>
</template>
```

Setting `camera` to an ID frames that node's measured **world bounds**, including nested and scaled descendants.
Setting it to `scene` returns to the overview.

The overview automatically refits after structural and layout changes and when the viewport changes. Applications do
not need breakpoint-specific scene scales.

## Tune framing once

```vue
<script setup lang="ts">
import type { VxStage } from '@exceeder/vuetrex'

function onReady(stage: VxStage) {
  stage.fitToContent({ padding: 1, duration: 0.35 })
}
</script>

<template>
  <Vuetrex @ready="onReady">
    <!-- scene -->
  </Vuetrex>
</template>
```

The chosen padding and duration are retained for later automatic refits.

## Handle pointer events as Vue events

```vue
<vx-panel
  :id="service.id"
  :name="service.label"
  @click="select(service.id)"
  @dblclick="openInspector(service.id)"
  @pointerenter="hoveredId = service.id"
  @pointerleave="hoveredId = undefined"
/>
```

`click` and `dblclick` bubble through the logical Vuetrex tree. `pointerenter` and `pointerleave` do not. The event also
contains `vxNode`, `vxPosition`, and, for an instanced item, `vxInstance`.

## Give the scene a consistent visual hierarchy

Connection layout is only part of readability. See [Designing legible data scenes](/guide/visual-design) for guidance
on ground and air routes, luminance, colour, spatially anchored cards, lighting, geometry, motion, and future focus
effects.

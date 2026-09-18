---
title: Connections and focus
description: Keep links, interaction, and camera framing tied to semantic IDs.
---

# Connections and focus

<script setup>
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

## Author one immutable connector graph

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
`vxConnector`.

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

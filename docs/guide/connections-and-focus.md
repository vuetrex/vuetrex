---
title: Connections and focus
description: Keep links, interaction, and camera framing tied to semantic IDs.
---

# Connections and focus

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

## Declare a connector separately

```vue
<vx-connector from="gateway" to="orders" type="particles" layout="orthogonal" />
<vx-connector from="orders" to="payments" type="line" layout="direct" />
```

The connector does not consume a layout slot. It resolves its named endpoints after the scene synchronizes, so endpoint
order in the template is not significant.

Available visual types are `particles` and `line`. Route layouts are `orthogonal`, `direct`, `bezier`, and `spline`;
`straight` remains a compatibility alias for `direct`.

## Attach routes to ports

Center-to-center links pass through geometry. Named ports attach to measured world-space bounds instead:

```vue
<vx-connector
  from="gateway"
  to="orders"
  from-port="right"
  to-port="left"
  layout="orthogonal"
  :avoid="0.2"
/>
```

Named ports are `auto`, `center`, `left`, `right`, `front`, `back`, `top`, and `bottom`. `auto` chooses the X or Z face
toward the other endpoint. Explicit normalized coordinates provide a precise point within the measured bounds:

```vue
<vx-connector
  from="orders"
  to="payments"
  :from-port="{ x: 1, y: 0.7, z: 0.5 }"
  :to-port="{ x: 0, y: 0.7, z: 0.5 }"
/>
```

Coordinates are clamped to `0..1`; `{ x: 1, y: 0.5, z: 0.5 }` is the centre of the right face. Bounds are measured in
world space, so nested placement, rotation, and scale are already reflected in the resolved point.

## Separate crowded routes

```vue
<vx-connector
  from="orders"
  to="payments"
  layout="bezier"
  :elevation="0.4"
  :lane="1"
  :avoid="true"
/>
```

`elevation` raises the route crest in world units. `lane` is an integer-like lane index converted using stage spacing;
parallel links use centred automatic lanes by default. `avoid="true"` adds default clearance outside endpoint bounds,
while a number sets explicit world-space clearance. It does not yet solve collisions against unrelated scene objects.

## Fan out through one bus

```vue
<vx-bus-connector
  from="gateway"
  :to="apiIds"
  side="right"
  to-port="left"
  type="line"
  :elevation="0.2"
/>
```

The bus owns one source lead, one shared trunk, and short terminal branches. Use it for gateway fan-out, queues,
service discovery, and shared data stores. `side` is a named-face shorthand for `from-port`; use `from-port` when the
source needs normalized coordinates. `side="auto"` chooses the source face from the average target position.

For a small one-way declaration, a mesh can use the `connection` shorthand:

```vue
<vx-cylinder id="worker" connection="queue" />
```

Use `<vx-connector>` when links come from data, when parallel links exist, or when connection ownership belongs to the
parent scene rather than either endpoint.

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

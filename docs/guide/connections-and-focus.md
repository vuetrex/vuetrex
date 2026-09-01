---
title: Connections and focus
description: Keep links, interaction, and camera framing tied to semantic IDs.
---

# Connections and focus

## The problem: geometry is visible but not explainable

A useful operational view must answer two questions quickly: “what is this connected to?” and “can I inspect this
specific thing?” Vuetrex uses node names as stable addresses for both.

## Name nodes with domain IDs

```vue
<vx-box name="gateway" text="gateway" />
<vx-box name="orders" text="orders" />
<vx-box name="payments" text="payments" />
```

Names should be unique inside one stage. Prefer IDs from your data over display labels or array positions.

## Declare a connector separately

```vue
<vx-connector from="gateway" to="orders" type="particles" layout="orthogonal" />
<vx-connector from="orders" to="payments" type="line" layout="direct" />
```

The connector does not consume a layout slot. It resolves its named endpoints after the scene synchronizes, so endpoint
order in the template is not significant.

Available visual types are `particles` and `line`. Available layouts are `orthogonal` and `direct`; `straight` remains
as a compatibility alias for `direct`.

For a small one-way declaration, a mesh can use the `connection` shorthand:

```vue
<vx-cylinder name="worker" connection="queue" />
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

Setting `camera` to a name frames that node's measured **world bounds**, including nested and scaled descendants.
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
  :name="service.id"
  @click="select(service.id)"
  @dblclick="openInspector(service.id)"
  @pointerenter="hoveredId = service.id"
  @pointerleave="hoveredId = undefined"
/>
```

`click` and `dblclick` bubble through the logical Vuetrex tree. `pointerenter` and `pointerleave` do not. The event also
contains `vxNode`, `vxPosition`, and, for an instanced item, `vxInstance`.

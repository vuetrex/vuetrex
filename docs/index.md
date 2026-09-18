---
title: Welcome to Vuetrex
description: Build reactive 3D diagrams with Vue components.
outline: deep
---

# Your system changed. Did the diagram?

A normal architecture diagram is already stale when a deployment scales, a service degrades, or a connection appears.
A custom Three.js view can stay current, but then your application must manage meshes, transforms, picking, labels,
camera framing, and a second scene lifecycle.

Vuetrex takes a narrower approach: **describe the scene with Vue components and let live Vue state update it**.

<script setup>
import Hello from './examples/src/Visuals.vue'
</script>

<Hello />

The example above is driven by an ordinary array. The layout buttons change one prop; selecting a service changes the
camera target; changing health updates its material. Vuetrex measures and resynchronizes the scene after each change.

## The smallest useful scene

```vue
<script setup lang="ts">
import { Vuetrex } from '@exceeder/vuetrex'

const services = [
  { id: 'gateway', healthy: true },
  { id: 'orders', healthy: false },
  { id: 'payments', healthy: true },
]
</script>

<template>
  <Vuetrex height="420px">
    <vx-row :gap="0.4">
      <vx-box
        v-for="service in services"
        :key="service.id"
        :name="service.id" :id="service.id"
        :text="service.id"
        :material="{ color: service.healthy ? 0x2f91b8 : 0xc45d4a }"
      />
    </vx-row>
  </Vuetrex>
</template>
```

The template is still Vue:

- `v-for` creates one visual node per service.
- `:key` preserves service identity as the array changes.
- Bound props update geometry, labels, and materials.
- Vuetrex containers calculate local 3D positions.
- The `<Vuetrex>` component owns the canvas, camera, and Three.js scene.

You do not need a scene recipe, a graph editor, or direct Three.js code to begin.

## Grow only when the problem grows

Vuetrex has three useful levels. Start at the first and add the next only when it removes real complexity.

| Your problem | Use |
|---|---|
| Show reactive objects in 3D | Vue templates and `vx-*` elements |
| Reuse a visual idea such as a service or deployment | Normal Vue components |
| Reuse selection, aggregation, and spatial policy | A representation recipe |

A service component can contain a panel, a pod stack, and metric markers. A recipe can later decide which services to
show and whether they belong in a row, ring, sphere, or timeline. Those responsibilities remain independent.

## Choose a path

- [Explore the Scene notebook](/examples/) through small interactive worlds, starting with a moving city block.
- [Build your first scene](/guide/) from installation to a reactive diagram.
- [Turn domain data into Vue components](/guide/live-data) without flattening everything into meshes.
- [Understand nested layouts](/guide/layouts) and local coordinate spaces.
- [Add composition recipes](/guide/composability) when view policy outgrows a template.
- [Plan for large scenes](/guide/large-scenes) with stable identities and GPU instancing.

::: tip The core idea
Use Vue components to describe what a thing looks like. Use layouts or recipes to describe where things belong. Keep
stable domain IDs between them.
:::

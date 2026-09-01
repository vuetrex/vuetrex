---
title: Live data and components
description: Turn changing application data into reusable 3D Vue components.
---

# Live data and components

## The problem: the scene becomes one large template

A `v-for` is enough for five boxes. It becomes hard to reason about when every service needs a platform, a label,
several pods, health colors, and click behavior. The usual Vue solution also works in Vuetrex: make one domain idea a
component.

## First, keep the source data ordinary

```ts
interface Service {
  id: string
  status: 'healthy' | 'degraded'
  pods: Array<{ id: string; ready: boolean }>
}

const services = ref<Service[]>([])

eventSource.addEventListener('snapshot', event => {
  services.value = JSON.parse(event.data)
})
```

Vuetrex does not require a special store or stream format. WebSockets, server-sent events, Pinia, computed values, and
plain refs all work because the scene starts as a Vue render tree.

## Give one service a visual vocabulary

```vue
<!-- ServiceNode.vue -->
<script setup lang="ts">
defineProps<{ service: Service }>()
</script>

<template>
  <vx-panel
    :name="service.id"
    :size="1.5"
    :depth="0.9"
    :lines="[service.id, service.status]"
    :material="{
      color: service.status === 'healthy' ? 0x2f6578 : 0x8b4d42,
      roughness: 0.45,
    }"
    :hover="{ emissive: 0x167f9c, emissiveIntensity: 0.5, scale: 1.03 }"
  >
    <vx-row :gap="0.04">
      <vx-box
        v-for="pod in service.pods"
        :key="pod.id"
        :size="0.24"
        :height="0.12"
        :material="{ color: pod.ready ? 0x72c69d : 0xd46e57 }"
      />
    </vx-row>
  </vx-panel>
</template>
```

The component owns the **representation of one service**. It does not decide which services are visible or where the
whole fleet belongs.

## Compose domain components like Vue components

```vue
<Vuetrex height="520px">
  <vx-layer :gap="0.7">
    <vx-row :gap="0.5">
      <ServiceNode
        v-for="service in frontendServices"
        :key="service.id"
        :service="service"
      />
    </vx-row>

    <vx-row :gap="0.5">
      <ServiceNode
        v-for="service in backendServices"
        :key="service.id"
        :service="service"
      />
    </vx-row>
  </vx-layer>
</Vuetrex>
```

Vue components used inside `<Vuetrex>` retain the outer app context, including props, provide/inject, and reactive
state. Their rendered `vx-*` children are handled by the Vuetrex renderer instead of the DOM renderer.

## Preserve identity across snapshots

Streaming systems often replace the entire array on each snapshot. Vue's `:key` and Vuetrex's `name` solve different
parts of identity:

| Value | Purpose |
|---|---|
| `:key="service.id"` | Lets Vue retain the component while arrays change |
| `:name="service.id"` | Lets cameras and connectors address the scene node |

Use domain IDs for both. Array indexes make focus and animation jump to the wrong resource after insertion or sorting.

## Keep state transitions declarative

```vue
<vx-box
  :height="0.08 + service.errorRate * 0.5"
  :material="{
    color: service.errorRate > 0.05 ? 0xc85f4b : 0x4fa184,
    emissive: selected ? 0x116b80 : 0x000000,
  }"
  @click="selectedId = service.id"
/>
```

When a bound value changes, Vuetrex updates the corresponding Three.js object. Structural changes from `v-if` and
`v-for` are batched, then parent layouts and camera bounds are recalculated.

## When to add a recipe

Stay with computed values and components while the scene policy remains local. Move to a
[composition recipe](/guide/composability) when selection, aggregation, placement, and emitted links need to be reused,
tested, generated, or changed independently from representation components.

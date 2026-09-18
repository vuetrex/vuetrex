<script setup lang="ts">
import { Vuetrex, connectors, particles } from '@exceeder/vuetrex'

const bus = connectors
  .bus('gateway', ['catalog', 'orders', 'payments'], { key: 'gateway-api-bus' })
  .route({ strategy: 'orthogonal', fromPort: 'right', toPort: 'left', elevation: 0.18 })
  .stroke({ key: 'underlay', color: 0x17343b, width: 0.075, markerEnd: false })
  .stroke({ key: 'shaft', color: 0x68d4dc, width: 0.022, markerEnd: 'arrow' })
  .flow(route => particles
    .path(route.points, { key: route.key, count: 28, distribution: 'even', spread: 0.025 })
    .appearance({ color: 0xc7fbff, size: 0.035, opacity: 0.7, blending: 'additive' })
    .motion({ speed: 0.55 }))

const replicas = [
  { id: 'orders-worker-a', from: 'orders', to: 'worker-a', channel: 'orders-workers' },
  { id: 'orders-worker-b', from: 'orders', to: 'worker-b', channel: 'orders-workers' },
]

const bundle = connectors
  .edges(replicas, {
    keyBy: ({ item }) => item.id,
    from: ({ item }) => item.from,
    to: ({ item }) => item.to,
  })
  .route({ strategy: 'bezier', elevation: 0.34 })
  .bundle({ keyBy: ({ item }) => item.channel, width: 0.09, color: 0x7358a3 })
  .stroke({ color: 0xc6a8ff, width: 0.018, markerEnd: 'arrow' })

const graph = bus.join(bundle)
</script>

<template>
  <Vuetrex
    height="440px"
    :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }"
  >
    <vx-layer :gap="0.9">
      <vx-row :gap="0.9">
        <vx-box id="gateway" text="gateway" :material="{ color: 0x28657a }" />
      </vx-row>
      <vx-row :gap="0.65">
        <vx-box id="catalog" text="catalog" :material="{ color: 0x405d68 }" />
        <vx-box id="orders" text="orders" :material="{ color: 0x754d72 }" />
        <vx-box id="payments" text="payments" :material="{ color: 0x405d68 }" />
      </vx-row>
      <vx-row :gap="0.65">
        <vx-box id="worker-a" text="worker A" :size="0.8" :material="{ color: 0x4d4768 }" />
        <vx-box id="worker-b" text="worker B" :size="0.8" :material="{ color: 0x4d4768 }" />
      </vx-row>
    </vx-layer>
    <vx-connectors :graph="graph" />
  </Vuetrex>
</template>

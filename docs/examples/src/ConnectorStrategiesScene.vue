<script setup lang="ts">
import { Vuetrex, connectors } from '@exceeder/vuetrex'

const routes = [
  { id: 'direct', strategy: 'direct', color: 0x63d3df },
  { id: 'orthogonal', strategy: 'orthogonal', color: 0x75d69c },
  { id: 'bezier', strategy: 'bezier', color: 0xffa66b },
  { id: 'spline', strategy: 'spline', color: 0xb69cff },
]

const graph = connectors
  .edges(routes, {
    keyBy: ({ item }) => item.id,
    from: ({ item }) => `${item.id}-from`,
    to: ({ item }) => `${item.id}-to`,
  })
  .route({
    strategy: ({ item }) => item.strategy,
    elevation: ({ item }) => item.strategy === 'direct' ? 0 : 0.22,
    fromPort: 'right',
    toPort: 'left',
  })
  .stroke({
    color: ({ item }) => item.color,
    width: 0.025,
    markerEnd: 'arrow',
  })
</script>

<template>
  <Vuetrex
    height="390px"
    :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }"
  >
    <vx-layer :gap="0.65">
      <vx-row v-for="route in routes" :key="route.id" :gap="1.8">
        <vx-box
          :id="`${route.id}-from`"
          :text="route.strategy"
          :size="0.78"
          :height="0.28"
          :material="{ color: 0x285f72 }"
        />
        <vx-box
          :id="`${route.id}-to`"
          text="target"
          :size="0.78"
          :height="0.28"
          :material="{ color: 0x485967 }"
        />
      </vx-row>
    </vx-layer>
    <vx-connectors :graph="graph" />
  </Vuetrex>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, connectors, particles } from '@exceeder/vuetrex'

const flowing = ref(true)
const links = [
  { id: 'gateway-orders', from: 'gateway', to: 'orders', critical: true },
  { id: 'orders-payments', from: 'orders', to: 'payments', critical: false },
]

const graph = computed(() => {
  const routes = connectors
    .edges(links, {
      keyBy: ({ item }) => item.id,
      from: ({ item }) => item.from,
      to: ({ item }) => item.to,
    })
    .route({ strategy: 'bezier', elevation: 0.28 })
    .stroke({
      color: ({ item }) => item.critical ? 0xff8a65 : 0x73cad1,
      width: 0.022,
      markerEnd: 'arrow',
    })

  return flowing.value
    ? routes.flow(route => particles
        .path(route.points, { key: route.key, item: route.item, count: 16 })
        .appearance({ color: 0xe8feff, size: 0.045 })
        .motion({ speed: 0.75 }))
    : routes
})
</script>

<template>
  <div>
    <div class="example-controls">
      <button @click="flowing = !flowing">
        {{ flowing ? 'Pause flow' : 'Show flow' }}
      </button>
    </div>

    <Vuetrex
      height="380px"
      :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, gap: 0.7 }"
    >
      <vx-row :gap="0.7">
        <vx-box id="gateway" text="gateway" :material="{ color: 0x28657a }" />
        <vx-box id="orders" text="orders" :material="{ color: 0x8c493e }" />
        <vx-box id="payments" text="payments" :material="{ color: 0x28657a }" />
      </vx-row>
      <vx-connectors :graph="graph" />
    </Vuetrex>
  </div>
</template>

<style scoped>
.example-controls {
  padding: 0.7rem;
  background: #182225;
}

button {
  border: 1px solid #42616a;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  color: #e8f0f2;
  background: #26383d;
  cursor: pointer;
}
</style>

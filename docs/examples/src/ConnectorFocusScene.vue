<script setup lang="ts">
import { ref } from 'vue'
import {
  Vuetrex,
  connectors,
  type ConnectorHit
} from '@exceeder/vuetrex'

const camera = ref('scene')
const selectedConnector = ref('none')

const graph = connectors
  .edges([
    { id: 'gateway-orders', from: 'gateway', to: 'orders', color: 0xff9a75 },
    { id: 'gateway-payments', from: 'gateway', to: 'payments', color: 0x70d4df },
  ], {
    keyBy: ({ item }) => item.id,
    from: ({ item }) => item.from,
    to: ({ item }) => item.to,
  })
  .route({ strategy: 'bezier', elevation: 0.32 })
  .stroke({ color: ({ item }) => item.color, width: 0.065, markerEnd: 'arrow' })

function focus(id: string) {
  camera.value = camera.value === id ? 'scene' : id
}

function selectConnector(hit: ConnectorHit) {
  selectedConnector.value = `${hit.key} at ${Math.round(hit.pathPosition * 100)}%`
}
</script>

<template>
  <div>
    <div class="example-status">
      <span>Connector: {{ selectedConnector }}</span>
      <span>Camera: {{ camera }}</span>
      <button @click="camera = 'scene'">Overview</button>
    </div>

    <Vuetrex
      height="360px"
      :camera="camera"
      :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }"
    >
      <vx-row :gap="0.9">
        <vx-box id="orders" text="orders" :material="{ color: 0x8c493e }" @click="focus('orders')" />
        <vx-box id="gateway" text="gateway" :material="{ color: 0x28657a }" @click="focus('gateway')" />
        <vx-box id="payments" text="payments" :material="{ color: 0x28657a }" @click="focus('payments')" />
      </vx-row>
      <vx-connectors :graph="graph" @click="selectConnector" />
    </Vuetrex>
  </div>
</template>

<style scoped>
.example-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  padding: 0.7rem;
  color: #dcebed;
  background: #182225;
  font-size: 0.85rem;
}

button {
  margin-left: auto;
  border: 1px solid #42616a;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  color: #e8f0f2;
  background: #26383d;
  cursor: pointer;
}
</style>

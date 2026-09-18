<script setup lang="ts">
import { ref } from 'vue'
import { Vuetrex } from '@exceeder/vuetrex'

const layout = ref<'row' | 'ring'>('row')
const selected = ref<string>()
const services = ref([
  { id: 'gateway', healthy: true },
  { id: 'orders', healthy: false },
  { id: 'payments', healthy: true },
])

function toggleHealth(id: string) {
  const service = services.value.find(item => item.id === id)
  if (service) service.healthy = !service.healthy
}
</script>

<template>
  <div class="example-scene">
    <div class="example-controls">
      <button @click="layout = layout === 'row' ? 'ring' : 'row'">
        Use {{ layout === 'row' ? 'ring' : 'row' }} layout
      </button>
      <button @click="toggleHealth('orders')">Toggle orders health</button>
    </div>

    <Vuetrex
      height="340px"
      :camera="selected || 'scene'"
      :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, gap: 0.4 }"
    >
      <vx-group :layout="layout" :gap="0.4">
        <vx-box
          v-for="service in services"
          :key="service.id"
          :id="service.id"
          :text="service.id"
          :material="{ color: service.healthy ? 0x2f91b8 : 0xc45d4a, roughness: 0.45 }"
          :hover="{ emissive: 0x157c85, emissiveIntensity: 0.6, scale: 1.04 }"
          @click="selected = selected === service.id ? undefined : service.id"
        />
      </vx-group>
    </Vuetrex>
  </div>
</template>

<style scoped>
.example-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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

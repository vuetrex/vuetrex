<script setup lang="ts">
import { computed, ref } from 'vue'

type Layout = 'row' | 'ring'
type Status = 'healthy' | 'degraded'

const layout = ref<Layout>('ring')
const camera = ref('scene')
const services = ref([
  { id: 'gateway', status: 'healthy' as Status, pods: 3 },
  { id: 'catalog', status: 'healthy' as Status, pods: 4 },
  { id: 'orders', status: 'degraded' as Status, pods: 3 },
  { id: 'payments', status: 'healthy' as Status, pods: 2 },
  { id: 'events', status: 'healthy' as Status, pods: 5 },
])

const sceneSettings = {
  backgroundColor: 0x111719,
  floorColor: 0x263338,
  gap: 0.32,
}

function focus(id: string) {
  camera.value = camera.value === id ? 'scene' : id
}

function toggleIncident() {
  const orders = services.value.find(service => service.id === 'orders')
  if (orders) orders.status = orders.status === 'healthy' ? 'degraded' : 'healthy'
}

const incidentLabel = computed(() =>
  services.value.find(service => service.id === 'orders')?.status === 'healthy'
    ? 'Degrade orders'
    : 'Recover orders',
)
</script>

<template>
  <div class="welcome-example">
    <div class="welcome-controls" aria-label="Scene controls">
      <button :class="{ active: layout === 'ring' }" @click="layout = 'ring'">Ring</button>
      <button :class="{ active: layout === 'row' }" @click="layout = 'row'">Row</button>
      <button @click="toggleIncident">{{ incidentLabel }}</button>
      <button :disabled="camera === 'scene'" @click="camera = 'scene'">Overview</button>
    </div>

    <Vuetrex height="440px" :camera="camera" :settings="sceneSettings">
      <vx-group
        :layout="layout"
        :gap="layout === 'row' ? 0.38 : 0.28"
        start-angle="-72"
      >
        <vx-panel
          v-for="service in services"
          :key="service.id"
          :name="service.id" :id="service.id"
          :size="1.1"
          :depth="0.72"
          :height="0.16"
          :lines="[service.id, service.status]"
          :label-share="0.48"
          :material="{
            color: service.status === 'healthy' ? 0x28657a : 0x8c493e,
            roughness: 0.48,
          }"
          :hover="{ emissive: 0x167f9c, emissiveIntensity: 0.45, scale: 1.03 }"
          @click="focus(service.id)"
        >
          <vx-row :gap="0.04">
            <vx-box
              v-for="pod in service.pods"
              :key="pod"
              :size="0.16"
              :height="0.11"
              :material="{ color: service.status === 'healthy' ? 0x73c7a1 : 0xdf8a68 }"
            />
          </vx-row>
        </vx-panel>
      </vx-group>
    </Vuetrex>
  </div>
</template>

<style scoped>
.welcome-example {
  margin: 1.5rem 0 2rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: #111719;
}

.welcome-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #182125;
  border-bottom: 1px solid #334148;
}

.welcome-controls button {
  border: 1px solid #496069;
  border-radius: 5px;
  padding: 0.4rem 0.7rem;
  color: #e5edef;
  background: #26343a;
  cursor: pointer;
}

.welcome-controls button:hover,
.welcome-controls button.active {
  border-color: #58b7c0;
  background: #24535b;
}

.welcome-controls button:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>

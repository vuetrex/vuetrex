<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Vuetrex,
  connectors,
  type ConnectorPort,
} from '@exceeder/vuetrex'

interface PortPair {
  label: string
  from: ConnectorPort
  to: ConnectorPort
}

const choices: PortPair[] = [
  { label: 'Facing sides', from: 'right', to: 'left' },
  { label: 'Top surfaces', from: 'top', to: 'top' },
  { label: 'Front → back', from: 'front', to: 'back' },
  {
    label: 'Exact top corners',
    from: { x: 1, y: 1, z: 0.5 },
    to: { x: 0, y: 1, z: 0.5 },
  },
]

const selected = ref(0)
const ports = computed(() => choices[selected.value])
const graph = computed(() => connectors
  .edge(
    { node: 'producer', port: ports.value.from },
    { node: 'consumer', port: ports.value.to },
    { key: 'selected-ports' },
  )
  .route({ strategy: 'bezier', elevation: 0.28 })
  .stroke({ color: 0x78dbe3, width: 0.03, markerStart: 'dot', markerEnd: 'arrow' }))
</script>

<template>
  <div>
    <div class="example-controls" aria-label="Connector port pair">
      <button
        v-for="(choice, index) in choices"
        :key="choice.label"
        :class="{ active: selected === index }"
        @click="selected = index"
      >
        {{ choice.label }}
      </button>
    </div>

    <Vuetrex
      height="340px"
      :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }"
    >
      <vx-row :gap="2">
        <vx-box id="producer" text="producer" :size="1.15" :height="0.5" :material="{ color: 0x28657a }" />
        <vx-box id="consumer" text="consumer" :size="1.15" :height="0.5" :material="{ color: 0x4f6170 }" />
      </vx-row>
      <vx-connectors :graph="graph" />
    </Vuetrex>
  </div>
</template>

<style scoped>
.example-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.7rem;
  background: #182225;
}

button {
  border: 1px solid #42616a;
  border-radius: 6px;
  padding: 0.4rem 0.65rem;
  color: #e8f0f2;
  background: #26383d;
  cursor: pointer;
}

button.active {
  border-color: #78dbe3;
  background: #24535b;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Quaternion, Vector3 } from 'three'
import { Vuetrex, defineVxStyleSheet } from '@exceeder/vuetrex'
import Cafe3D from './Cafe3D.vue'

const rotated = ref(true)
const wide = ref(false)
const placement = computed(() => ({
  position: new Vector3(-1.8, 0, 0),
  orientation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotated.value ? Math.PI / 4 : 0),
  scale: new Vector3(1, 1, 1),
}))
const services = { position: new Vector3(2, 0, 0), orientation: new Quaternion(), scale: new Vector3(1, 1, 1) }
const styles = defineVxStyleSheet({ common: { connectors: {
  network: { routeStrategy: 'bezier', strokeColor: '#88dce8', strokeWidth: 0.035 },
  water: { routeStrategy: 'orthogonal', clearance: 0.35, strokeColor: '#6ea5ff', strokeWidth: 0.025 },
} } })
</script>

<template>
  <div>
    <div class="template-controls">
      <button @click="rotated = !rotated">{{ rotated ? 'Straighten cafe' : 'Rotate cafe 45°' }}</button>
      <button @click="wide = !wide">{{ wide ? 'Narrow cafe' : 'Widen cafe' }}</button>
    </div>
    <Vuetrex height="380px" :sheets="[styles]" :settings="{ backgroundColor: 0x101719, floorMirror: false, shadows: false }">
      <vx-group :placement="placement">
        <Cafe3D id="cafe" :width="wide ? 2.6 : 1.8">
          <template #ports>
            <vx-port name="delivery" face="front" :at="[0.8, 0.2]" />
          </template>
          <template #connections>
            <vx-edge key="internet" to="router" from-port="internet" appearance="network" />
          </template>
        </Cafe3D>
      </vx-group>
      <vx-layer :placement="services" :gap="0.8">
        <vx-box id="router" text="Router" :height="0.5" :size="0.8" :material="{ color: '#387e8c' }" />
        <vx-box id="pump" text="Water" :height="0.5" :size="0.8" :material="{ color: '#4167a0' }" />
      </vx-layer>
      <vx-connectors scope="utilities" appearance="water">
        <vx-edge key="water-cafe" from="pump" to="cafe" to-port="waterMain" />
        <vx-edge key="delivery-cafe" from="router" to="cafe" to-port="delivery" stroke-color="#e8b77d" />
      </vx-connectors>
    </Vuetrex>
  </div>
</template>

<style scoped>
.template-controls { display: flex; gap: 0.6rem; padding: 0.75rem; background: #182225; }
button { padding: 0.4rem 0.7rem; border: 1px solid #628490; border-radius: 6px; color: #ecf6fa; }
</style>

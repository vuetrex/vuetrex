<template>
  <div class="quads-demo">
    <div class="quads-controls">
      <label>Shrink <input v-model.number="shrink" type="range" min="0.3" max="0.52" step="0.01" /></label>
      <label>Pipe length <input v-model.number="spacing" type="range" min="0.25" max="0.75" step="0.01" /></label>
    </div>

    <Vuetrex
      height="72vh"
      width="100%"
      :settings="{ backgroundColor: 0xefefef, floorColor: 0xc5c5c5, shadows: true, floorMirror: false }"
    >
      <vx-geometry
        id="recursive-quads"
        :graph="quadGeometry"
        anchor="origin"
        :materials="{
          cube: { color: 0x6f88a8, roughness: 0.72, metalness: 0.04 },
          pipe: { color: 0x9a9a9a, roughness: 0.82, metalness: 0.02 },
        }"
      />
    </Vuetrex>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex } from '@/lib-components/index.js'
import { quads } from '../geometry/quads.js'

const shrink = ref(0.42)
const spacing = ref(0.5)

const quadGeometry = computed(() => quads({
  size: 1.8,
  shrink: shrink.value,
  spacing: spacing.value,
}))
</script>

<style scoped>
.quads-controls {
  display: flex;
  justify-content: center;
  gap: 1.2rem;
  padding: 0.65rem;
}

.quads-controls label {
  display: grid;
  gap: 0.2rem;
  min-width: 10rem;
  text-align: left;
  font-size: 0.82rem;
}
</style>

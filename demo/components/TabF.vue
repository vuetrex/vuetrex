<template>
  <div class="plant-demo">
    <div class="plant-controls">
      <label>Seed <input v-model.number="seed" type="range" min="1" max="100" /></label>
      <label>Branches <input v-model.number="branchCount" type="range" min="3" max="18" /></label>
      <label>Branch spread <input v-model.number="spread" type="range" min="0.35" max="1.25" step="0.05" /></label>
      <label>Branch forks <input v-model.number="forkCount" type="range" min="1" max="3" /></label>
      <label>Leaves <input v-model.number="leafCount" type="range" min="2" max="12" /></label>
    </div>

    <Vuetrex
      height="72vh"
      width="100%"
      :settings="{
        backgroundColor: 0xefefef,
        floorColor: 0xc5c5c5,
        color: 0xffffff,
        shadows: true,
        floorMirror: false
      }"
    >
      <vx-geometry
        id="procedural-tree"
        :graph="plantGeometry"
        anchor="base"
        :material="{ color: 0xffffff, roughness: 0.76, metalness: 0.02 }"
        :materials="{
          bark: { color: 0x656545, roughness: 0.92, metalness: 0 },
          foliage: { color: 0xffffff, roughness: 0.68, metalness: 0.01 },
        }"
      />
      <vx-particles
        :graph="fireflies"
        anchor="origin"
        :participates-in-layout="false"
      />
    </Vuetrex>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, geo, particles } from '@/lib-components/index.js'
import { tree } from '../geometry/plant.js'

const seed = ref(31)
const branchCount = ref(10)
const spread = ref(0.82)
const forkCount = ref(2)
const leafCount = ref(7)

const plantGeometry = computed(() =>
  geo.transform(tree({
    height: 4.6,
    trunkRadius: 0.15,
    branchCount: branchCount.value,
    branchLength: 1.7,
    forkCount: forkCount.value,
    leafCount: leafCount.value,
    leafSize: 0.16,
    spread: spread.value,
    seed: seed.value,
  }), {
    rotate: [0, seed.value * 0.053, 0],
  }),
)

const fireflies = computed(() =>
  particles.cloud('procedural-tree', {
    count: 1024,
    radius: 'bounds',
    distribution: 'surface',
    seed: `plant-fireflies-${seed.value}`,
  })
    .appearance({
      color: ({ random }) => random > 0.68 ? 0xd9822b : 0x27845d,
      size: ({ random }) => 0.11 + random * 0.1,
      opacity: ({ random }) => 0.8 + random * 0.18,
      blending: 'normal',
    })
    .motion({
      turbulence: ({ random }) => 0.025 + random * 0.04,
      turbulenceScale: 1.35,
      orbit: { axis: [0, 1, 0], speed: 0.11 },
    })
    .named('plant-fireflies'),
)
</script>

<style scoped>
.plant-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem 1.2rem;
  padding: 0.65rem;
}

.plant-controls label {
  display: grid;
  gap: 0.2rem;
  min-width: 9rem;
  text-align: left;
  font-size: 0.82rem;
}
</style>

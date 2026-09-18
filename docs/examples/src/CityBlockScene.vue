<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Vuetrex } from '@exceeder/vuetrex'
import { cityMaterials, createCityBlock, trafficParameters } from './cityBlock.js'

const seed = ref(1)
const skyline = ref(1)
const carCount = ref(12)
const speed = ref(1)
const running = ref(true)
const distance = ref(0)
const container = ref<HTMLElement>()

// Only seed/count changes author a new graph. Each animation tick supplies values.
const city = computed(() => createCityBlock(seed.value, carCount.value))
const parameters = computed(() => ({
  skyline: [1, skyline.value, 1],
  ...trafficParameters(carCount.value, distance.value),
}))
const settings = {
  backgroundColor: 0x1e3038, floorColor: 0x263b43,
  floorMirror: false, floorGrid: false, floorCaptions: false,
  lightColor1: 0xffe6c2, lightColor2: 0xd8f1ff,
}

let frame = 0
let observer: IntersectionObserver | undefined
onMounted(() => {
  running.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let visible = true
  observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
  if (container.value) observer.observe(container.value)
  let previous = performance.now()
  function tick(now: number) {
    const elapsed = now - previous
    if (elapsed >= 1000 / 30) {
      if (running.value && visible && !document.hidden) {
        distance.value += Math.min(elapsed, 100) / 1000 * speed.value
      }
      previous = now
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
})
</script>

<template>
  <div ref="container" class="city-example">
    <div class="city-toolbar">
      <div><span class="city-eyebrow">SCENE NOTEBOOK / 01</span><strong>A block in motion</strong></div>
      <button :aria-pressed="!running" @click="running = !running">{{ running ? 'Pause traffic' : 'Resume traffic' }}</button>
    </div>
    <Vuetrex height="440px" :settings="settings">
      <vx-geometry :graph="city" :parameters="parameters" :materials="cityMaterials" anchor="origin" />
    </Vuetrex>
    <div class="city-controls">
      <label>Skyline <output>{{ skyline.toFixed(1) }}×</output>
        <input v-model.number="skyline" aria-label="Skyline height" type="range" min="0.6" max="1.6" step="0.1">
      </label>
      <label>Traffic <output>{{ carCount }} cars</output>
        <input v-model.number="carCount" aria-label="Number of cars" type="range" min="0" max="24" step="1">
      </label>
      <label>Speed <output>{{ speed.toFixed(1) }}×</output>
        <input v-model.number="speed" aria-label="Traffic speed" type="range" min="0.2" max="2" step="0.2">
      </label>
      <button @click="seed++">New skyline</button>
    </div>
    <p class="city-hint">Drag to orbit · Scroll over the scene to zoom · Cars follow a loop, not traffic physics.</p>
  </div>
</template>

<style scoped>
.city-example { display: flex; flex-direction: column; color: #e2eeed; background: #1e3038; }
.city-toolbar, .city-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.2rem; }
.city-toolbar { justify-content: space-between; border-bottom: 1px solid #415359; }
.city-toolbar strong { display: block; margin-top: 0.2rem; font-size: 1.1rem; }
.city-eyebrow { color: #a9c7c8; font-size: 0.65rem; letter-spacing: 0.14em; }
.city-controls { background: #17272e; }
.city-controls label { flex: 1 1 120px; font-size: 0.8rem; }
.city-controls output { float: right; color: #ebc287; font-variant-numeric: tabular-nums; }
.city-controls input { display: block; width: 100%; margin-top: 0.5rem; accent-color: #ebc287; }
button { border: 1px solid #6d8588; border-radius: 6px; padding: 0.4rem 0.7rem; font: inherit; font-size: 0.8rem; background: #2e454c; color: #f1f6ef; cursor: pointer; }
button:hover { background: #3f5960; }
button:focus-visible, input:focus-visible { outline: 2px solid #ebc287; outline-offset: 3px; }
.city-hint { margin: 0; padding: 0.65rem 1.2rem; font-size: 0.72rem; color: #b3c8ca; }
</style>

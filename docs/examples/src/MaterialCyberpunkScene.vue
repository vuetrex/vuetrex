<script setup lang="ts">
import { computed, ref } from 'vue'
import { DoubleSide } from 'three'
import { Vuetrex, VxStyleSheet, defineVxStyleSheet, defineGeometry, geo, finishes, useCanvasTexture } from '@exceeder/vuetrex'

// — Controls and palettes —
const palettes = {
  graphite: { name: 'Graphite / copper', primary: '#4f7180', secondary: '#b88357', armor: '#969fa3', body: '#747e83', ceramic: '#d9d5c9' },
  porcelain: { name: 'Porcelain / navy', primary: '#344f76', secondary: '#8b969e', armor: '#c7c5ba', body: '#9ea9ae', ceramic: '#e9e4d8' },
  olive: { name: 'Field / brass', primary: '#65755d', secondary: '#b39c60', armor: '#8b9282', body: '#7c8375', ceramic: '#d7cfb7' },
}
const palette = ref<keyof typeof palettes>('graphite')
const power = ref(0.12)
const glassOpacity = ref(0.18)
const wireframe = ref(false)
const studioReflections = ref(true)
const surfaceRelief = ref(0.35)

// — Texture artwork —
// useCanvasTexture owns creation, redraw, linear/sRGB color space, and disposal.
// A deterministic height pattern gives the platform a fine cast-stone surface.
function stoneNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const grain = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const top = grain(ix, iy) * (1 - u) + grain(ix + 1, iy) * u
  const bottom = grain(ix, iy + 1) * (1 - u) + grain(ix + 1, iy + 1) * u
  return top * (1 - v) + bottom * v
}
function surfaceHeight(x: number, y: number) {
  return stoneNoise(x / 5, y / 5) * 0.7 + stoneNoise(x / 2, y / 2) * 0.3
}
const maps = {
  relief: useCanvasTexture(ctx => {
    // Grayscale encodes height, not color. The material's bumpScale controls relief.
    // Paint once: moving the slider changes a uniform without redrawing this texture.
    const image = ctx.createImageData(512, 512)
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const height = surfaceHeight(x, y) * 255
        const i = (y * 512 + x) * 4
        image.data[i] = image.data[i + 1] = image.data[i + 2] = height
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, { purpose: 'bump', width: 512, height: 512 }),
  circuit: useCanvasTexture(ctx => {
    ctx.fillStyle = '#72787b'; ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = '#9da5a7'; ctx.lineWidth = 2
    for (let i = 0; i < 8; i++) {
      const x = 12 + i * 32
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 75 + i * 12)
      ctx.lineTo(x + 16, 91 + i * 12); ctx.lineTo(x + 16, 256); ctx.stroke()
      ctx.fillStyle = '#d2cec2'; ctx.fillRect(x - 3, 44 + i * 12, 6, 10)
    }
    ctx.fillStyle = '#c2c5bd'; ctx.fillRect(24, 218, 68, 5)
    ctx.fillRect(24, 230, 40, 3)
  }, { purpose: 'color' }),
  roughness: useCanvasTexture(ctx => {
    ctx.fillStyle = '#c5c5c5'; ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#b9b9b9'
    for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1)
  }, { purpose: 'roughness' }),
  normal: useCanvasTexture(ctx => {
    ctx.fillStyle = 'rgb(128,128,255)'; ctx.fillRect(0, 0, 256, 256)
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = 'rgb(124,128,255)'; ctx.fillRect(x, 0, 2, 256)
      ctx.fillStyle = 'rgb(132,128,255)'; ctx.fillRect(x + 2, 0, 2, 256)
    }
  }, { purpose: 'normal' }),
  scan: useCanvasTexture(ctx => {
    // alphaMap reads the green channel, not the canvas alpha channel.
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = '#fff'
    for (let y = 0; y < 256; y += 10) ctx.fillRect(0, y, 256, 3)
    ctx.fillRect(0, 0, 4, 256); ctx.fillRect(252, 0, 4, 256)
    ctx.fillRect(18, 30, 95, 15); ctx.fillRect(18, 54, 64, 7)
  }, { purpose: 'alpha' }),
}

// — Procedural geometry —
// Material names here are semantic channel keys resolved by the scene stylesheet.
// This graph is authored once; the controls only replace appearance descriptors.
function box(size: readonly [number, number, number], position: readonly [number, number, number], channel: string) {
  return geo.box().transform({ scale: size, translate: position }).material(channel)
}
function ring(radius: number, height: number, count: number, channel: string) {
  return box([0.08, 0.055, 2 * Math.PI * radius / count * 0.64], [0, 0, 0], channel).distribute({
    items: Array.from({ length: count }, (_, i) => ({ id: `segment-${i}`, angle: i * Math.PI * 2 / count })),
    keyBy: 'id',
    position: ({ item }) => [Math.cos(item.angle) * radius, height, Math.sin(item.angle) * radius],
    rotation: ({ item }) => [0, -item.angle, 0],
  })
}
const pylons = Array.from({ length: 8 }, (_, i) => ({
  id: `pylon-${i}`, angle: i * Math.PI / 4, height: i % 2 ? 1.6 : 2.15,
}))
const pylon = geo.join([
  box([0.48, 1, 0.48], [0, 0.5, 0], 'circuits'),
  box([0.54, 0.06, 0.54], [0, 1.03, 0], 'armor'),
  box([0.065, 0.84, 0.025], [-0.16, 0.5, 0.255], 'trim'),
  box([0.065, 0.84, 0.025], [0.16, 0.5, 0.255], 'ceramic'),
  box([0.56, 0.05, 0.56], [0, 0.08, 0], 'ceramic'),
]).distribute({
  items: pylons, keyBy: 'id',
  position: ({ item }) => [Math.cos(item.angle) * 2.35, 0.24, Math.sin(item.angle) * 2.35],
  rotation: ({ item }) => [0, -item.angle + Math.PI / 2, 0],
  scale: ({ item }) => [1, item.height, 1],
})
const createFoundry = defineGeometry('foundry', () => geo.join([
  box([6.4, 0.16, 6.4], [0, 0.08, 0], 'recess'),
  box([5.95, 0.035, 5.95], [0, 0.18, 0], 'ceramic'),
  box([5.8, 0.09, 5.8], [0, 0.24, 0], 'platform'),
  box([1.7, 0.2, 1.7], [0, 0.39, 0], 'circuits'),
  ring(1.0, 0.54, 32, 'trim'), ring(1.35, 1.25, 40, 'ceramic'), ring(1.35, 2.35, 40, 'trim'),
  ring(2.85, 0.32, 64, 'ceramic'),
  geo.icosphere({ radius: 0.72, detail: 0 }).transform({ translate: [0, 1.8, 0] }).material('core'),
  geo.icosphere({ radius: 0.94, detail: 1 }).transform({ translate: [0, 1.8, 0] }).material('cage'),
  pylon,
  ...[-1, 1].map(side => geo.join([
    box([1.1, 1.6, 0.025], [side * 1.72, 1.55, 0], 'glass'),
    box([0.96, 1.4, 0.012], [side * 1.72, 1.55, 0.026], 'hologram'),
  ]).transform({ rotate: [0, side * Math.PI / 7, 0] })),
  // Repeated floor traces emphasize the material contrast against the dark plinth.
  box([0.028, 0.012, 1.1], [0, 0.294, 0], 'trim').distribute({
    pattern: 'grid', count: [7, 2], spacing: [0.7, 3.9],
  }),
]))
const graph = createFoundry({})

// — Material stylesheet —
// Styles name the surface's role, independent of geometry and palette.
const sheet = computed(() => {
  const { primary, secondary, armor, body, ceramic } = palettes[palette.value]
  return defineVxStyleSheet({ common: { materials: {
    metal: { base: finishes.satinMetal({ color: armor,
      normalMap: maps.normal.value, roughnessMap: maps.roughness.value }) },
    armor: { extends: 'metal' },
    circuits: { extends: 'metal', base: { color: body, metalness: 0.65, roughness: 0.46,
      map: maps.circuit.value, emissive: '#b5c8ca', emissiveMap: maps.circuit.value,
      emissiveIntensity: power.value * 0.08 } },
    recess: { base: { color: '#252a2c', roughness: 0.92, metalness: 0 } },
    // Only the foundry deck uses this relief; the scene's mirror stays unchanged.
    platform: { base: finishes.matteCeramic({ color: body, roughness: 0.86,
      metalness: 0, bumpMap: maps.relief.value, bumpScale: surfaceRelief.value }) },
    ceramic: { base: finishes.matteCeramic({ color: ceramic }) },
    trim: { base: finishes.polishedMetal({ color: secondary }) },
    core: { base: finishes.glazedCeramic({ color: primary, flatShading: true, wireframe: wireframe.value }) },
    cage: { base: finishes.polishedMetal({ metalness: 0.95, roughness: 0.2, wireframe: true }) },
    glass: { base: finishes.tintedGlass({ opacity: glassOpacity.value }) },
    hologram: { base: { color: '#839f9f', emissive: '#94b8b3', emissiveIntensity: power.value,
      metalness: 0.05, roughness: 0.55, alphaMode: 'mask', alphaTest: 0.5,
      alphaMap: maps.scan.value, side: DoubleSide } },
  } } })
})
// — Scene setup —
const settings = {
  backgroundColor: 0x292d30, shadows: true,
  lightColor1: 0xe4edf2, lightColor2: 0xfff4e5,
}
</script>

<template>
  <div class="foundry">
    <div class="heading"><div><span class="eyebrow">MATERIAL LAB / 01</span><strong>Precision foundry</strong></div><span class="badge">10 material channels</span></div>
    <VxStyleSheet :sheets="[sheet]">
      <Vuetrex height="460px" :settings="settings">
        <vx-environment preset="studio" :enabled="studioReflections" :intensity="0.25" />
        <vx-camera :direction="[8, 6, 11]" fit="content" />
        <vx-floor finish="mirror" :color="0x646b70" :reflection="0.4" />
        <vx-geometry :graph="graph" anchor="origin" />
      </Vuetrex>
    </VxStyleSheet>
    <div class="controls">
      <label>Palette<select v-model="palette"><option v-for="(value, key) in palettes" :key="key" :value="key">{{ value.name }}</option></select></label>
      <label>Surface relief <output>{{ surfaceRelief.toFixed(2) }}</output><input v-model.number="surfaceRelief" aria-label="Platform surface relief" type="range" min="0" max="1" step="0.05" /></label>
      <label>Instrument light <output>{{ power.toFixed(2) }}</output><input v-model.number="power" aria-label="Instrument light strength" type="range" min="0" max="0.6" step="0.02" /></label>
      <label>Glass <output>{{ glassOpacity.toFixed(2) }}</output><input v-model.number="glassOpacity" aria-label="Glass opacity" type="range" min="0" max="0.6" step="0.02" /></label>
    </div>
    <div class="footer"><label><input v-model="studioReflections" type="checkbox" /> Studio reflections</label><label><input v-model="wireframe" type="checkbox" /> Core wireframe</label><span>⌘ + drag to orbit · Scroll to zoom</span></div>
  </div>
</template>

<style scoped>
.foundry { display: flex; flex-direction: column; color: #e1e3e1; background: #252a2d; }
.heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.8rem; padding: 1rem 1.2rem; border-bottom: 1px solid #454c50; }
.eyebrow { color: #bfc9c7; font: 0.65rem monospace; letter-spacing: 0.16em; }
.heading strong { display: block; margin-top: 0.2rem; font-size: 1.25rem; letter-spacing: -0.02em; }
.badge { border: 1px solid #505a5e; border-radius: 20px; padding: 0.25rem 0.6rem; color: #c6b397; font: 0.65rem monospace; }
.controls { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.2rem; border-top: 1px solid #454c50; background: #303639; }
.controls label { flex: 1 1 130px; font-size: 0.75rem; }
.controls output { float: right; color: #d4c4a9; font-variant-numeric: tabular-nums; }
.controls input, select { display: block; width: 100%; margin-top: 0.4rem; accent-color: #9eb7b1; }
select { border: 1px solid #626c70; border-radius: 4px; padding: 0.3rem; color: #e4e6e2; background: #3b4347; font-size: 0.75rem; }
.footer { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; padding: 0.7rem 1.2rem; font-size: 0.72rem; color: #bec5c5; }
.footer label { display: flex; gap: 0.4rem; align-items: center; }
.footer input { accent-color: #9eb7b1; }
.footer span { margin-left: auto; color: #adb6b7; }
input:focus-visible, select:focus-visible { outline: 2px solid #9eb7b1; outline-offset: 4px; }
</style>

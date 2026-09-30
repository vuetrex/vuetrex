<template>
  <main class="workshop">
    <a class="back" href="/">&larr; workshops</a>

    <section class="scene-card" aria-label="Data infrastructure diagram">
      <vuetrex height="76vh" width="100%" :settings="settings" :elements="elements" :camera="cameraView"
                @ready="onStageReady">
        <vx-composer v-if="effectsEnabled"
          preset="studio"
          quality="high"
          :max-pixel-ratio="2"
          :output="{ toneMapping: 'aces', exposure: 1 }"
          :depth-of-field="{ focus: displayFocused ? 'operations-wall' : monitorOpen ? 'hub' : 'core', aperture: 0.00008, maxBlur: 0.013 }"
          :grading="{ contrast: 1.025, saturation: 0.96 }"
          :vignette="{ strength: 0.08, offset: 0.95 }"
          :bloom="{ mode: 'selected', strength: 0.22, radius: 0.24, threshold: 0 }"
          :outlines="false"
          :protect-annotations="true"
        />
<!--        :ambient-occlusion="{ intensity: 0.32, radius: 0.28 }"-->
        <!--         -->
        <vx-lighting :key-intensity="2.7" :fill-intensity="0.65" shadow-quality="high" />
        <vx-environment preset="studio" :intensity="0.48" :rotation="0.65" />
        <vx-floor
          finish="matte"
          :color="0xf3f4f6"
          :reflection="0.08"
          :grid="false"
          :captions="false"
          :fade-start="11"
          :fade-end="18"
        />

        <!-- A rounded presentation plinth (a local MeshNode extension). Its texture is made with Vuetrex's
             canvas-texture feature, so the grid remains part of the material. -->
        <vx-group :placement="at(0, 0, 0)">
          <vx-workshop-plinth :size="9.6" :depth="8" :height="platformTop" :material="platformMaterial" />
        </vx-group>

        <RearDisplay id="display" :platform-top="platformTop" @toggle-view="displayFocused = !displayFocused" />


        <!-- Central stacked data store. -->
        <vx-stack id="core" :placement="at(0.1, platformTop, -1.25)" :gap="0.008"
                  :effects="{ outline: 'include' }" @click="toggleDatabase">
          <vx-cylinder
            v-for="layer in databaseLayers"
            :id="layer.id"
            :key="layer.id"
            :size="layer.size"
            :height="layer.height"
            :material="layer.material"
            :effects="layer.effects"
          />
          <FloorPorts :width="1.2" :depth="1.2" />
        </vx-stack>

        <!-- Two pale server blocks on the left. -->
        <vx-stack
          v-for="server in servers"
          :id="server.id"
          :key="server.id"
          :placement="at(server.x, platformTop, server.z)"
          :gap="0.025"
        >
          <vx-box :size="0.92" :depth="0.74" :height="0.13" :material="materials.darkBase" />
          <vx-box :size="0.68" :depth="0.68" :height="0.72" :material="materials.white" />
          <vx-box :size="0.61" :depth="0.61" :height="0.06" :material="materials.whiteTop" />
          <FloorPorts :width="0.92" :depth="0.74" />
        </vx-stack>

        <vx-group v-for="server in servers" :key="`${server.id}-details`" :placement="at(server.x, platformTop, server.z)" fit="none">
          <vx-group v-for="slot in 5" :key="slot" :placement="at(0, 0.24 + slot * 0.095, 0.345)">
            <vx-box :size="0.47" :height="0.017" :depth="0.012" :material="materials.vent" />
          </vx-group>
          <vx-group :placement="at(0.22, 0.81, 0.35)">
            <vx-box :size="0.035" :height="0.035" :depth="0.012" :material="materials.status" :effects="{ bloom: 'include', bloomGain: 0.35 }" />
          </vx-group>
        </vx-group>

        <!-- Compact metallic processing hub unfolds into a three-part monitor. -->
        <MonitorHub :platform-top="platformTop" :open="monitorOpen" @toggle="monitorOpen = !monitorOpen" />

        <!-- Three metric columns echo the chart on the right of the reference. -->
        <vx-row id="metrics" :placement="at(3, platformTop, -1.5)" :gap="0.15">
          <vx-stack v-for="bar in bars" :key="bar.color" :gap="0.02">
            <vx-box :size="0.46" :depth="0.55" :height="0.1" :material="materials.darkBase" />
            <vx-box :size="0.3" :depth="0.32" :height="bar.height" :material="bar.material" />
            <vx-box :size="0.26" :depth="0.28" :height="0.045" :material="bar.top" />
          </vx-stack>
          <FloorPorts :width="1.68" :depth="0.55" />
        </vx-row>

        <!-- Small colored terminal cubes. -->
        <vx-stack
          v-for="terminal in terminals"
          :id="terminal.id"
          :key="terminal.id"
          :placement="at(terminal.x, platformTop, terminal.z)"
          :gap="0.02"
        >
          <vx-box :size="0.82" :depth="0.68" :height="0.1" :material="materials.darkBase" />
          <vx-box :size="0.58" :depth="0.55" :height="0.55" :material="terminal.material" />
          <vx-box :size="0.51" :depth="0.49" :height="0.045" :material="terminal.top" />
          <FloorPorts :width="0.82" :depth="0.68" />
        </vx-stack>

        <!-- Low satellite stores create the small puck-like endpoints. -->
        <vx-stack
          v-for="store in stores"
          :id="store.id"
          :key="store.id"
          :placement="at(store.x, platformTop, store.z)"
          :gap="0.018"
        >
          <vx-cylinder :size="0.62" :height="0.08" :material="materials.darkBase" />
          <vx-cylinder :size="0.55" :height="0.18" :material="materials.metal" />
          <vx-cylinder :size="0.5" :height="0.055" :material="store.top" />
          <FloorPorts :width="0.62" :depth="0.62" />
        </vx-stack>

        <vx-connectors scope="workshop-2" :graph="diagram" />
      </vuetrex>

      <div class="scene-footer">
        <div><div class="eyebrow">WORKSHOP 02 / INFRASTRUCTURE</div><h1 class="caption">The data floor.</h1></div>
        <button class="effects-toggle" type="button" role="switch" :aria-checked="effectsEnabled"
                aria-label="Composer effects" @click="effectsEnabled = !effectsEnabled">
          <span class="switch-track" aria-hidden="true"><span /></span>
          Composer effects <strong>{{ effectsEnabled ? 'On' : 'Off' }}</strong>
        </button>
      </div>
      <p class="comparison-note">{{ effectsEnabled ? 'Studio finish · contact shading, subtle glow and lens depth.' : 'Original rendering · all composer passes removed.' }}</p>
      <button class="monitor-toggle" type="button" :aria-expanded="monitorOpen" @click="monitorOpen = !monitorOpen">
        {{ monitorOpen ? 'Close hub monitor' : 'Open hub monitor' }}
      </button>
      <span class="monitor-hint">or click the metallic hub</span>
    </section>
  </main>
</template>

<script setup lang="ts">
import { Vuetrex, connectors, useCanvasTexture, type VxSettings, type VxStage } from '@/lib-components'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import gsap from 'gsap'
import { Quaternion, Vector3 } from 'three'

import { workshopElements } from './elements.config.js'
import { Plinth } from './things/Plinth.js'
import FloorPorts from './things/FloorPorts.vue'
import MonitorHub from './things/MonitorHub.vue'
import RearDisplay from './things/RearDisplay.vue'

const displayFocused = ref(false)
const effectsEnabled = ref(true)
const monitorOpen = ref(false)
const databaseOpen = ref(false)
let stage: VxStage | undefined
let databaseAnimating = false

function onStageReady(value: VxStage) {
  stage = value
}
// Animate one complete camera pose instead of refitting changing monitor bounds.
const overview = { x: 0, y: 0.75, z: -0.3, height: 9.5, radius: 14, azimuth: 25 }
const hubCloseup = { x: -0.35, y: 0.8, z: 1.4, height: 2.7, radius: 3.4, azimuth: 0 }
const displayCloseup = {x: 0, y: 1.55, z: -3.35, height: 1.55, radius: 4, azimuth: 0 }
const cameraPose = reactive({ ...overview })
const cameraView = computed(() => ({ orbit: {
  target: [cameraPose.x, cameraPose.y, cameraPose.z] as const,
  height: cameraPose.height, radius: cameraPose.radius, azimuth: cameraPose.azimuth,
} }))
let cameraTween: gsap.core.Tween | undefined
watch([monitorOpen, displayFocused], ([hubOpen, displayOpen]) => {
  cameraTween?.kill()

  const destination = displayOpen
      ? displayCloseup
      : hubOpen
          ? hubCloseup
          : overview

  cameraTween = gsap.to(cameraPose, {...destination, duration: 1.2, ease: 'sine.inOut',})
})
onBeforeUnmount(() => cameraTween?.kill())

const elements = workshopElements.defineElements({ 'vx-workshop-plinth': Plinth })
const platformTop = 0.18

const at = (x: number, y: number, z: number) => ({
  position: new Vector3(x, y, z),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
})

const settings: VxSettings = {
  backgroundColor: 0xf7f7f8,
  floorColor: 0xf3f4f6,
  captionColor: 0xa7adb5,
  lightColor1: 0xffffff,
  lightColor2: 0xdceaff,
  mirrorOpacity: 0.94,
  floorGrid: false,
  floorMirror: false,
  floorCaptions: false,
  shadows: true,
  gap: 0.22,
}

const materials = {
  vent: { color: 0x24323d, roughness: 0.65, metalness: 0.35 },
  status: { color: 0x79e8c4, emissive: 0x35dba4, emissiveIntensity: 0.7, roughness: 0.4 },
  darkBase: { color: 0x667582, roughness: 0.4, metalness: 0.65 },
  metal: { color: 0xb3bcc5, roughness: 0.28, metalness: 0.78 },
  white: { color: 0xf2f3f4, roughness: 0.68, metalness: 0.04 },
  whiteTop: { color: 0xffffff, roughness: 0.48, metalness: 0.03 },
  whiteBand: { color: 0xc9eeff, emissive: 0x18aaff, emissiveIntensity: 0.55, roughness: 0.46, metalness: 0.08 },
  blue: { color: 0x168bdf, roughness: 0.3, metalness: 0.18 },
  blueTop: { color: 0x71a9e1, roughness: 0.3, metalness: 0.26 },
  cyan: { color: 0x18aeda, roughness: 0.32, metalness: 0.2 },
  cyanTop: { color: 0x68d6ef, roughness: 0.28, metalness: 0.18 },
  coral: { color: 0xff7f73, roughness: 0.38, metalness: 0.1 },
  coralTop: { color: 0xffada5, roughness: 0.34, metalness: 0.08 },
}

const databaseGap = 0.008
const databaseLayers = [
  { id: 'core-layer-base', size: 1.2, height: 0.13, material: materials.darkBase },
  { id: 'core-layer-blue-1', size: 1.12, height: 0.25, material: materials.blue },
  { id: 'core-layer-band-1', size: 1.12, height: 0.025, material: materials.whiteBand,
    effects: { bloom: 'include' as const, bloomGain: 0.55 } },
  { id: 'core-layer-blue-2', size: 1.12, height: 0.25, material: materials.blue },
  { id: 'core-layer-band-2', size: 1.12, height: 0.025, material: materials.whiteBand,
    effects: { bloom: 'include' as const, bloomGain: 0.55 } },
  { id: 'core-layer-blue-3', size: 1.12, height: 0.25, material: materials.blue },
  { id: 'core-layer-cap', size: 1.02, height: 0.12, material: materials.white },
  { id: 'core-layer-top', size: 0.68, height: 0.055, material: materials.blueTop },
].map((layer, index, layers) => ({
  ...layer,
  baseY: layers.slice(0, index).reduce((y, previous) => y + previous.height + databaseGap, 0),
}))

function toggleDatabase() {
  if (!stage || databaseAnimating) return
  const opening = !databaseOpen.value
  databaseOpen.value = opening
  databaseAnimating = true
  const radius = 1.50
  const raisedY = 1.59
  const finalIndex = opening ? databaseLayers.length - 1 : 0

  databaseLayers.forEach((layer, index) => {
    const angle = index / databaseLayers.length * Math.PI * 2
    stage?.animateTo(layer.id, {
      positionX: opening ? Math.sin(angle) * radius : 0,
      positionY: opening ? raisedY : layer.baseY,
      positionZ: opening ? Math.cos(angle) * radius : 0,
    }, {
      duration: 0.72,
      delay: (opening ? index : databaseLayers.length - 1 - index) * 0.035,
      ease: opening ? 'back.out(1.2)' : 'power2.inOut',
      ...(index === finalIndex && { onComplete: () => { databaseAnimating = false } }),
    })
  })
}

const gridTexture = useCanvasTexture(ctx => {
  const size = ctx.canvas.width
  ctx.fillStyle = '#d8dde0'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#bdc6cc'
  // Keep the authored grid spacing and weight as texture resolution increases.
  const textureScale = size / 256
  ctx.lineWidth = textureScale * 0.45
  for (let point = 0; point <= size; point += 12 * textureScale) {
    ctx.beginPath()
    ctx.moveTo(point, 0)
    ctx.lineTo(point, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, point)
    ctx.lineTo(size, point)
    ctx.stroke()
  }
}, { width: 2048, height: 2048, purpose: 'color' })

// Deterministic fine grain gives grazing highlights a subtle machined finish.
const grainTexture = useCanvasTexture(ctx => {
  const { width, height } = ctx.canvas
  for (let y = 0; y < height; y++) {
    const shade = 170 + ((y * 73 + 19) % 53)
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`
    ctx.fillRect(0, y, width, 1)
  }
}, { width: 512, height: 512, purpose: 'bump' })
watch(gridTexture, texture => { if (texture) texture.anisotropy = 8 })

const platformMaterial = computed(() => ({
  color: 0xffffff,
  map: gridTexture.value,
  roughness: 0.72,
  metalness: 0.12,
  bumpMap: grainTexture.value,
  bumpScale: 0.003,
}))

const servers = [
  { id: 'server-a', x: -3.0, z: 0.4 },
  { id: 'server-b', x: -3.0, z: -1.9 },
]

const bars = [
  { color: 'cyan', height: 0.58, material: materials.cyan, top: materials.cyanTop },
  { color: 'blue', height: 1.08, material: materials.blue, top: materials.blueTop },
  { color: 'coral', height: 0.62, material: materials.coral, top: materials.coralTop },
]

const terminals = [
  { id: 'terminal-coral', x: 2.2, z: 1.9, material: materials.coral, top: materials.coralTop },
]

const stores = [
  { id: 'store-left', x: -2.0, z: 3.0, top: materials.blueTop },
  { id: 'store-front', x: 0.7, z: 3.4, top: materials.whiteTop },
]

// Explicit ports and a few authored bends keep the illustration legible while
// connections still resolve their endpoints from the real Vuetrex nodes.
const links = [
  { id: 'server-a-core', from: 'server-a', to: 'core', start: 'right', end: 'left', color: 0x008ff5, width: 0.035, bends: [[-1.4, 0.4], [-1.4, -1.25]] },
  { id: 'server-b-core', from: 'server-b', to: 'core', start: 'right', end: 'back', color: 0x36586e, width: 0.024, bends: [[-1.3, -1.9], [-1.3, -2.1], [0.1, -2.1]] },
  { id: 'core-hub', from: 'core', to: 'hub', start: 'front', end: 'right', color: 0x00aeff, width: 0.04, bends: [[0.75, -0.35], [0.75, 1.45]] },
  { id: 'server-store-left', from: 'server-a', to: 'store-left', start: 'front', end: 'back', color: 0x26343d, width: 0.032, bends: [[-3, 1.5], [-2, 1.5]] },
  { id: 'hub-store-front', from: 'hub', to: 'store-front', start: 'front', end: 'back', color: 0x26343d, width: 0.032, bends: [[-0.35, 2.6], [0.7, 2.6]] },
  { id: 'core-metrics', from: 'core', to: 'metrics', start: 'right', end: 'left', color: 0x26343d, width: 0.032, bends: [[1.65, -1.25], [1.65, -1.5]] },
  { id: 'metrics-coral', from: 'metrics', to: 'terminal-coral', start: 'front', end: 'back', color: 0x26343d, width: 0.032, bends: [[3, 0.65], [2.2, 0.65]] },
]

const linkPort = (node: string, name: string) => ({ node, port: { name } })

const diagram = connectors
  .edges(links, {
    keyBy: ({ item }) => item.id,
    from: ({ item }) => linkPort(item.from, item.start),
    to: ({ item }) => linkPort(item.to, item.end),
  })
  .route({
    strategy: 'manual', surface: 'ground', lane: 0, obstacles: 'none',
    waypoints: ({ item }) => item.bends.map(([x, z]) => [x, platformTop + 0.045, z] as const),
  })
  .stroke({
    color: ({ item }) => item.color,
    width: ({ item }) => item.width,
    opacity: 0.92,
    markerEnd: 'arrow',
  })
</script>

<style scoped>
.workshop {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 0 1.25rem 1.5rem;
  background: #f7f7f8;
  color: #18232c;
}

.back {
  position: absolute;
  z-index: 2;
  top: 1rem;
  left: 1.25rem;
  color: #65717b;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-decoration: none;
  text-transform: uppercase;
}

.scene-card {
  max-width: 1400px;
  margin: 0 auto;
}

.scene-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.eyebrow { color: #65717b; font-size: 0.7rem; letter-spacing: 0.16em; font-weight: 700; }
.effects-toggle { display: flex; align-items: center; gap: 0.65rem; padding: 0.75rem 1rem; border: 1px solid #cad2d8; border-radius: 2rem; background: #fff; color: #243b4b; font: inherit; cursor: pointer; }
.effects-toggle strong { min-width: 1.7rem; font-size: 0.8rem; }
.switch-track { width: 2rem; height: 1.15rem; border-radius: 1rem; background: #a2adb5; padding: 0.15rem; box-sizing: border-box; }
.switch-track span { display: block; width: 0.85rem; height: 0.85rem; border-radius: 50%; background: #fff; transition: transform 150ms; }
[aria-checked="true"] .switch-track { background: #187fb0; }
[aria-checked="true"] .switch-track span { transform: translateX(0.85rem); }
.effects-toggle:focus-visible { outline: 2px solid #168bdf; outline-offset: 3px; }
.comparison-note { color: #65717b; font-size: 0.85rem; margin: 0.3rem 0; }
.caption {
  margin: 0.35rem 0;
  color: #18232c;
  font-size: clamp(1.4rem, 2.4vw, 2rem);
  font-weight: 800;
  letter-spacing: 0.025em;
}

.monitor-toggle {
  margin-top: 0.75rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid #8d9eac;
  border-radius: 0.4rem;
  background: #eef3f7;
  color: #173b55;
  font: inherit;
  cursor: pointer;
}
.monitor-toggle:focus-visible { outline: 2px solid #168bdf; outline-offset: 3px; }
.monitor-hint { margin-left: 0.75rem; color: #65717b; font-size: 0.85rem; }

@media (max-width: 700px) {
  .workshop { padding-inline: 0; }
  .back { left: 0.8rem; }
  .scene-footer { flex-wrap: wrap; }
  .scene-footer, .comparison-note { padding-inline: 1rem; }
}
</style>

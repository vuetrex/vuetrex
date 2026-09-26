<template>
  <main class="workshop">
    <a class="back" href="/">&larr; workshops</a>

    <section class="scene-card" aria-label="Data infrastructure diagram">
      <vuetrex height="76vh" width="100%" :settings="settings" :elements="elements">
        <vx-environment preset="studio" :intensity="0.48" :rotation="0.3" />
        <vx-camera :direction="[7, 8, 10]" fit="content" :padding="0.2" :duration="0" />
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

        <!-- Central stacked data store. -->
        <vx-stack id="core" :placement="at(0.1, platformTop, -1.25)" :gap="0.008">
          <vx-cylinder :size="1.2" :height="0.13" :material="materials.darkBase" />
          <vx-cylinder :size="1.12" :height="0.25" :material="materials.blue" />
          <vx-cylinder :size="1.12" :height="0.025" :material="materials.whiteBand" />
          <vx-cylinder :size="1.12" :height="0.25" :material="materials.blue" />
          <vx-cylinder :size="1.12" :height="0.025" :material="materials.whiteBand" />
          <vx-cylinder :size="1.12" :height="0.25" :material="materials.blue" />
          <vx-cylinder :size="1.02" :height="0.12" :material="materials.white" />
          <vx-cylinder :size="0.68" :height="0.055" :material="materials.blueTop" />
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

        <!-- Compact metallic processing hub. -->
        <vx-stack id="hub" :placement="at(-0.35, platformTop, 1.45)" :gap="0.025">
          <vx-box :size="0.96" :depth="0.82" :height="0.12" :material="materials.darkBase" />
          <vx-box :size="0.78" :depth="0.68" :height="0.19" :material="materials.metal" />
          <vx-box :size="0.76" :depth="0.66" :height="0.025" :material="materials.blue" />
          <vx-box :size="0.78" :depth="0.68" :height="0.18" :material="materials.metal" />
          <vx-box :size="0.5" :depth="0.46" :height="0.055" :material="materials.metal" />
          <FloorPorts :width="0.96" :depth="0.82" />
        </vx-stack>

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

      <div class="caption">DATA FLOOR</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { Vuetrex, connectors, useCanvasTexture, type VxSettings } from '@/lib-components'
import { computed } from 'vue'
import { Quaternion, Vector3 } from 'three'

import { Plinth } from './Plinth.js'
import FloorPorts from './FloorPorts.vue'

const elements = { 'vx-workshop-plinth': Plinth }
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
  darkBase: { color: 0x9da4ac, roughness: 0.54, metalness: 0.24 },
  metal: { color: 0xaeb8c4, roughness: 0.34, metalness: 0.48 },
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

const gridTexture = useCanvasTexture(ctx => {
  const size = ctx.canvas.width
  ctx.fillStyle = '#e5e3e0'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#c6c4c2'
  ctx.lineWidth = 1
  for (let point = 0; point <= size; point += 12) {
    ctx.beginPath()
    ctx.moveTo(point, 0)
    ctx.lineTo(point, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, point)
    ctx.lineTo(size, point)
    ctx.stroke()
  }
}, { width: 256, height: 256, purpose: 'color' })

const platformMaterial = computed(() => ({
  color: 0xffffff,
  map: gridTexture.value,
  roughness: 0.86,
  metalness: 0.02,
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
  max-width: 1180px;
  margin: 0 auto;
}

.caption {
  margin-top: -0.3rem;
  color: #18232c;
  font-size: clamp(1.4rem, 2.4vw, 2rem);
  font-weight: 800;
  letter-spacing: 0.025em;
}

@media (max-width: 700px) {
  .workshop { padding-inline: 0; }
  .back { left: 0.8rem; }
}
</style>

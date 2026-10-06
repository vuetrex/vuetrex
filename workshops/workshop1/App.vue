<template>
  <main class="workshop">
    <a class="back" href="/">&larr; workshops</a>
    <section class="scene-card">
      <vuetrex height="79vh" width="100%" :settings="settings" :camera="{ orbit }" :sheets="[styles]"
               @ready="initStage">
        <vx-composer
            preset="studio"
            quality="high"
            :bloom="{ mode: 'selected', strength: 0.35, radius: 0.3, threshold: 0 }"
        />
        <vx-layer elevation="0.1">
          <vx-row>
            <VNode :body="text" header="Camera" :footer="footer1" id="node1">
              <vx-port name="trigger" face="front" :at="[0.5, 0.1]"/>
              <vx-edge key="n1-n2" from="node1.output" to="node2.input" appearance="primary"/>
            </VNode>
            <VNode body="" header="Config" :footer="footer2" id="node2">
              <vx-port name="trigger" face="front" :at="[0.5, 0.1]"/>
            </VNode>
            <VNode body="" header="Composer" id="node3"/>
          </vx-row>
          <vx-row :gap="1.4">
            <VColumns id="c1">
              <vx-port name="left" face="left" :at="[0.5, 0.1]"/>
              <vx-port name="back" face="back" :at="[0.5, 0.1]"/>
              <vx-particles
                id="saturn-particles"
                :graph="saturnRings"
                anchor="origin"
                :paused="particlesPaused"
                :time-scale="particleSpeed"
                :interactive="false"
                :effects="{ bloom: 'include' }"
                :participates-in-layout="false"
              />
            </VColumns>
          </vx-row>

        </vx-layer>
        <vx-connectors scope="workshop" appearance="secondary">
          <vx-edge key="c-n1" from="c1.left" to="node1.trigger"/>
          <vx-edge key="c-n2" from="c1.back" to="node2.trigger"/>
        </vx-connectors>
      </vuetrex>
    </section>
    <section class="particle-controls" aria-label="Particle controls">
      <div class="particle-summary">
        <h1>Saturn swarm</h1>
        <p>{{ particleCount.toLocaleString() }} particles orbiting in three luminous bands.</p>
      </div>
      <label>
        Particle count
        <select v-model.number="particleCount">
          <option :value="60000">60,000</option>
          <option :value="300000">300,000</option>
          <option :value="600000">600,000</option>
          <option :value="1000000">1,000,000</option>
        </select>
      </label>
      <label>
        Orbit speed · {{ particleSpeed.toFixed(1) }}×
        <input v-model.number="particleSpeed" type="range" min="0.1" max="3" step="0.1" />
      </label>
      <button type="button" @click="particlesPaused = !particlesPaused">
        {{ particlesPaused ? 'Resume particles' : 'Pause particles' }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import {Vuetrex, type VxSettings, type VxStage, type VxCameraOrbit} from '@/lib-components'
import {defineVxStyleSheet} from "@/lib-components";
import VColumns from './things/VColumns.vue'
import VNode from './things/VNode.vue'
import {ref, reactive, computed, onBeforeUnmount} from 'vue';
import {workshopOrbitGraph, registerWorkshopGpuOrbits} from './gpuOrbits.js';
import * as THREE from 'three';

const settings: VxSettings = {
  backgroundColor: 0x85898d,
  floorFadeStart: 20,
  floorFadeEnd: 50,
}

const orbit = {
  target: [0, 0, 0],
  height: 4,
  radius: 9,
  azimuth: -10,
} satisfies VxCameraOrbit;

const styles = defineVxStyleSheet({
  common: {
    connectors: {
      primary: {
        routeStrategy: 'orthogonal',
        clearance: 0.5,
        strokeColor: '#ffffff',
        strokeWidth: 0.05,
        markerEnd: 'arrow'
      },
      secondary: {routeStrategy: 'bezier', clearance: 0.5, strokeColor: '#a5d6db', strokeWidth: 0.025},
    },
  },
})

const debug = reactive({c: [0, 0, 0], t: [0, 0, 0], f: 0});

const text = computed(() =>
    `  Position
    X: ${debug.c[0].toFixed(2)}
    Y: ${debug.c[1].toFixed(2)}
    Z: ${debug.c[2].toFixed(2)}
  Frame: ${debug.f.toFixed(0)}
  Target:
    X: ${debug.t[0].toFixed(2)}
    Y: ${debug.t[0].toFixed(2)}
    Z: ${debug.t[0].toFixed(2)}
  `)


function startCameraOrbit(stage: VxStage) {
  stage.camera
      .timeline({repeat: -1, yoyo: true})
      .to({azimuth: 30}, {duration: 60, ease: 'none'})
}

function initStage(stage: VxStage) {
  startCameraOrbit(stage)
  stage.onEachFrame(n => {
    const debugStage = stage as VxStage & {
      renderCamera: THREE.PerspectiveCamera
      cameraTarget: THREE.Vector3
    }
    debugStage.renderCamera.position.toArray(debug.c)
    debugStage.cameraTarget.toArray(debug.t)
    debug.f = n
  })
}

//--------- particles --------------

const unregisterGpuOrbits = registerWorkshopGpuOrbits()
const particleCount = ref(300000)
const particleSpeed = ref(1)
const particlesPaused = ref(false)
const saturnRings = computed(() => workshopOrbitGraph(particleCount.value))
onBeforeUnmount(unregisterGpuOrbits)

//--------- nodes -------

const footer1 = ref("")
const footer2 = ref("")
const n1 = ref(0)
const n2 = ref(0)

const timer = setInterval(() => {
  footer1.value = "Loading: " + (n1.value++) + "%"
  if (Math.random() > 0.5) {
    footer2.value = "Loading: " + (n2.value++) + "%"
  }
  if (n1.value > 100) n1.value = 100
  if (n2.value >= 100) {
    clearInterval(timer)
    footer1.value = "Ready"
    footer2.value = "Steady"
  }
}, 50)
onBeforeUnmount(() => clearInterval(timer))

</script>
<style>
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
.particle-controls {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem 0;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
  text-align: left;
}
.particle-summary { flex: 1; min-width: 240px; }
.particle-summary h1 { margin: 0; font-size: 1.3rem; }
.particle-summary p { margin: 0.35rem 0 0; color: #65717b; font-size: 0.9rem; }
.particle-controls label { display: grid; gap: 0.4rem; font-size: 0.85rem; }
.particle-controls select, .particle-controls button {
  border: 1px solid #c9d1d8;
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  background: white;
  color: #18232c;
  font: inherit;
}
.particle-controls input { accent-color: #427cc2; }
@media (max-width: 700px) {
  .workshop { padding-inline: 0; }
  .back { left: 0.8rem; }
}
</style>

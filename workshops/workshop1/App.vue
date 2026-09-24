<template>
  <h1>Workshop 1</h1>
  <section>
    <vuetrex height="79vh" width="100%" :settings="settings" :camera="{ orbit }" :sheets="[styles]" @ready="initStage">
      <vx-layer elevation="0.1">
        <vx-row>
          <VNode :body="text" header="Camera" :footer="footer1" id="node1">
            <template #ports>
              <vx-port name="trigger" face="front" :at="[0.5, 0.8]" />
            </template>
            <template #connections>
              <vx-edge key="n1-n2" to="node2" from-port="output" to-port="input" appearance="primary" />
            </template>
          </VNode>
          <VNode body="" header="Config" :footer="footer2" id="node2"/>
        </vx-row>
        <vx-row :gap="1.4">
          <VColumns id="c1"/>
        </vx-row>
        <vx-particles :graph="fireflies" anchor="origin" :participates-in-layout="false"/>
      </vx-layer>
      <vx-connectors scope="workshop" appearance="secondary">
        <vx-edge key="c-n1" from="c1" to="node1" to-port="trigger" />
        <vx-edge key="c-n2" from="c1" to="node2" to-port="input" />
      </vx-connectors>
    </vuetrex>
  </section>
</template>

<script setup lang="ts">
import {Vuetrex, type VxSettings, type VxStage, type VxCameraOrbit} from '@/lib-components'
import {particles, defineVxStyleSheet} from "@/lib-components";
import VColumns from './things/VColumns.vue'
import VNode from './things/VNode.vue'
import {ref, reactive, computed} from 'vue';
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
      primary: { routeStrategy: 'orthogonal', clearance: 0.5, strokeColor: '#ffffff', strokeWidth: 0.05, markerEnd: 'arrow' },
      secondary: { routeStrategy: 'bezier', clearance: 0.5, strokeColor: '#a5d6db', strokeWidth: 0.025 },
    },
  },
})

const debug = reactive({c:[0,0,0], t:[0,0,0], f:0});

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

const fireflies = computed(() =>
    particles.cloud('fireflies', {count: 4096, radius: 1.5, distribution: 'surface', seed: 42,})
    .appearance({
      color: ({random}) => random > 0.78 ? 0x8989d9 : 0x272d84,
      size: ({random}) => 0.02 + random * 0.1,
      opacity: ({random}) => 0.5 + random * 0.18, blending: 'additive'
    })
    .motion({
      turbulence: ({random}) => 0.025 + random * 0.04,
      turbulenceScale: 1.35,
      orbit: {axis: [0, 1, 0], speed: 0.11}
    })
    .named('plant-fireflies'),
)

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

</script>

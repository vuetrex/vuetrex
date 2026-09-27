<template>
  <main class="workshop">
    <a class="back" href="/">&larr; workshops</a>
    <section class="scene-card">
      <vuetrex height="79vh" width="100%" :settings="settings" :camera="{ orbit }" :sheets="[styles]"
               @ready="initStage">
        <vx-composer
            preset="editorial"
            quality="high"
            :bloom="{ mode: 'selected', strength: 0.35, radius: 0.3, threshold: 0 }"
        />
        <vx-layer elevation="0.1">
          <vx-row>
            <VNode :body="text" header="Camera" :footer="footer1" id="node1"
                   :effects="{ bloom: 'include' }">
              <vx-port name="trigger" face="front" :at="[0.5, 0.1]"/>
              <vx-edge key="n1-n2" from="node1.output" to="node2.input" appearance="primary"/>
            </VNode>
            <VNode body="" header="Config" :footer="footer2" id="node2"
                   :effects="{ bloom: 'include' }">
              <vx-port name="trigger" face="front" :at="[0.5, 0.1]"/>
            </VNode>
            <VNode body="" header="Composer" id="node3" :effects="{ bloom: 'include' }"/>
          </vx-row>
          <vx-row :gap="1.4">
            <VColumns id="c1">
              <vx-port name="left" face="left" :at="[0.5, 0.1]"/>
              <vx-port name="back" face="back" :at="[0.5, 0.1]"/>
              <vx-particles :graph="torusParticles" anchor="origin" :participates-in-layout="false"/>
            </VColumns>
          </vx-row>

        </vx-layer>
        <vx-connectors scope="workshop" appearance="secondary">
          <vx-edge key="c-n1" from="c1.left" to="node1.trigger"/>
          <vx-edge key="c-n2" from="c1.back" to="node2.trigger"/>
        </vx-connectors>
      </vuetrex>
    </section>
    <h1>Experiment</h1>
  </main>
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

const fireflies = computed(() =>
    particles.cloud([0, 0.5, 0], {count: 8192, radius: 2.0, distribution: 'surface', seed: 42,})
        .appearance({
          color: ({random}) => random > 0.78 ? 0x8989d9 : 0x272d84,
          size: ({random}) => 0.01 + random * 0.09,
          opacity: ({random}) => 0.3 + random * 0.5, blending: 'additive'
        })
        .motion({
          turbulence: ({random}) => 0.025 + random * 0.04,
          turbulenceScale: 1.35,
          orbit: {axis: [0, 1, 0], speed: 0.11}
        })
        .named('plant-fireflies'),
)

const ringPoints = (radius: number, tilt = -0.11): [number, number, number][] =>
    Array.from({length: 32}, (_, i) => {
      const angle = 2 * Math.PI * i / 32
      const x = radius * Math.cos(angle)
      const z = radius * Math.sin(angle)
      return [x, 1.5 + z * Math.sin(tilt), z * Math.cos(tilt)]
    })

const saturnRings = particles.paths([1.15, 1.35, 1.75].map((radius, i) => ({
      key: `ring-${i}`,
      points: ringPoints(radius),
      closed: true,
    })),
    {count: 1024, spread: 0.145, distribution: 'random', seed: 42},
);

const torusParticles = particles.path(ringPoints(1.3), {closed: true, count: 10000, spread: 0.22})
    .appearance({color: 0xa9b5e8, size: 0.025, opacity: 0.7})
    .motion({speed: 0.25})

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
@media (max-width: 700px) {
  .workshop { padding-inline: 0; }
  .back { left: 0.8rem; }
}
</style>

<template>
  <main class="workshop">
    <a class="back" href="/">&larr; workshops</a>

    <section class="scene-card" aria-label="Procedural organic spline bundle">
      <Vuetrex height="80vh" width="100%" :settings="settings">
        <vx-composer
          preset="luminous"
          quality="high"
          :max-pixel-ratio="2"
          :output="{ toneMapping: 'aces', exposure: 1.08 }"
          :ambient-occlusion="{ intensity: 0.72, radius: 0.36 }"
          :bloom="{ mode: 'selected', strength: 0.34, radius: 0.32, threshold: 0 }"
          :grading="{ contrast: 0.98, saturation: 0.75 }"
          :vignette="{ strength: 0.3, offset: 0.12 }"
          :depth-of-field="{ focus: 'organism', aperture: 0.000045, maxBlur: 0.008 }"
          :outlines="false"
        />
        <vx-lighting :key-intensity="3.5" :fill-intensity="0.44" shadow-quality="high" />
        <vx-environment preset="studio" :intensity="0.3" :rotation="2.2" />
        <vx-camera fit="content" :direction="[0.15, 0.55, 1]" motion="orbit" :padding="0.72" />
        <vx-floor
          finish="matte"
          :color="0x222828"
          :reflection="0.14"
          :grid="false"
          :captions="false"
          :fade-start="8"
          :fade-end="14"
        />

        <vx-geometry
          id="organism"
          :graph="bundle"
          :materials="materials"
          :material-effects="effects"
          anchor="base"
        />
      </Vuetrex>

      <div class="overlay">
        <div class="title-block">
          <div class="eyebrow">WORKSHOP 03 / PROCEDURAL ORGANICS</div>
          <h1>A living cable.</h1>
          <p>Disk roots transported along one guide spline, with each strand twisting, pulsing, and occasionally escaping the bundle.</p>
        </div>

        <div class="controls" aria-label="Organic bundle controls">
          <label>
            <span>Twist <output>{{ twistTurns.toFixed(1) }} turns</output></span>
            <input v-model.number="twistTurns" type="range" min="0" max="5" step="0.1" />
          </label>
          <label>
            <span>Growth <output>{{ Math.round(growth * 100) }}%</output></span>
            <input v-model.number="growth" type="range" min="0.16" max="1" step="0.01" />
          </label>
          <label>
            <span>Strands <output>{{ strandCount }}</output></span>
            <input v-model.number="strandCount" type="range" min="12" max="48" step="1" />
          </label>
          <button type="button" @click="seed += 1">Mutate seed <span>{{ seed }}</span></button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, type GeometryEffectChannels, type GeometryMaterialChannels, type VxSettings } from '@/lib-components/index.js'
import { organicBundle } from './organicBundle.js'

const twistTurns = ref(2.35)
const growth = ref(1)
const strandCount = ref(34)
const seed = ref(37)

const bundle = computed(() => organicBundle({
  strands: strandCount.value,
  samples: 58,
  twistTurns: twistTurns.value,
  growth: growth.value,
  seed: seed.value,
}))

const settings: VxSettings = {
  backgroundColor: 0x202629,
  floorColor: 0x222828,
  lightColor1: 0xffd2a8,
  lightColor2: 0x7fa6b6,
  floorGrid: false,
  floorMirror: false,
  floorCaptions: false,
  shadows: true,
}

const materials: GeometryMaterialChannels = {
  marrow: { color: 0x3d221c, roughness: 0.74, metalness: 0.02 },
  core: { color: 0xb34333, roughness: 0.58, metalness: 0.02 },
  sinew: { color: 0x54231e, roughness: 0.7, metalness: 0.04 },
  nerve: { color: 0xff9a5a, emissive: 0xb33b1e, emissiveIntensity: 0.34, roughness: 0.42 },
  tips: { color: 0xffdc80, emissive: 0xff6a32, emissiveIntensity: 1.25, roughness: 0.28 },
}

const effects: GeometryEffectChannels = {
  nerve: { bloom: 'include', bloomGain: 0.4 },
  tips: { bloom: 'include', bloomGain: 0.85 },
}
</script>

<style scoped>
.workshop {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 0 1.25rem 1.5rem;
  overflow: hidden;
  background:
    radial-gradient(circle at 53% 42%, rgba(91, 48, 34, 0.18), transparent 42%),
    #202629;
  color: #ede7df;
}

.back {
  position: absolute;
  z-index: 3;
  top: 1rem;
  left: 1.25rem;
  color: #a59c92;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-decoration: none;
  text-transform: uppercase;
}

.scene-card { position: relative; width: 100%; max-width: 1500px; margin: 0 auto; overflow: hidden; }
.scene-card :deep(canvas) { cursor: grab; }
.scene-card :deep(canvas:active) { cursor: grabbing; }

.overlay {
  position: absolute;
  z-index: 2;
  inset: auto 1.1rem 1.15rem;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  pointer-events: none;
}

.title-block { max-width: 31rem; text-shadow: 0 2px 18px #000; }
.eyebrow { color: #bf8066; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.2em; }
h1 { margin: 0.32rem 0 0; font: 500 clamp(2.2rem, 5vw, 4.6rem)/0.95 Georgia, serif; letter-spacing: -0.045em; }
.title-block p { max-width: 29rem; margin: 0.8rem 0 0; color: #bdb4aa; font-size: 0.87rem; line-height: 1.5; }

.controls {
  box-sizing: border-box;
  width: min(19rem, 36vw);
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 221, 196, 0.12);
  border-radius: 0.75rem;
  background: rgba(14, 15, 15, 0.72);
  box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
  pointer-events: auto;
}

label { display: block; margin-bottom: 0.72rem; }
label > span { display: flex; justify-content: space-between; color: #d2c8bf; font-size: 0.72rem; letter-spacing: 0.04em; }
output { color: #b86f52; font-variant-numeric: tabular-nums; }
input { width: 100%; margin: 0.42rem 0 0; accent-color: #c65d3e; }
button {
  display: flex;
  width: 100%;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  border: 1px solid #654236;
  border-radius: 0.42rem;
  background: #291b17;
  color: #e7c6b7;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
button:hover { background: #38231d; }
button:focus-visible, input:focus-visible { outline: 2px solid #dc7958; outline-offset: 3px; }

@media (max-width: 760px) {
  .workshop { padding-inline: 0; }
  .back { left: 0.8rem; }
  .overlay { inset-inline: 0.9rem; flex-direction: column; align-items: stretch; gap: 1rem; }
  .title-block p { display: none; }
  .controls { width: auto; }
}
</style>

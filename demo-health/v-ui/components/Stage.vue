<template>
  <section class="scene-shell">
    <Vuetrex
      :key="stageKey"
      height="100%"
      width="100%"
      :camera="camera"
      :settings="settings"
      @ready="onReady"
    >
      <BackgroundWall
        :deployments="deployments"
        :relations="relations"
        :current-time="currentTime"
        :theme="theme"
      />
      <MainStage
        :deployments="deployments"
        :relations="relations"
        :composition="composition"
        :current-time="currentTime"
        :selected-id="selected?.id ?? ''"
        :theme="theme"
        @select-deployment="emit('selectDeployment', $event)"
        @select-pod="(deploymentId, podId) => emit('selectPod', deploymentId, podId)"
      />
    </Vuetrex>

    <div v-if="error" class="error-banner">
      <span>{{ error }}</span>
      <button type="button" @click="emit('reconnect')">Reconnect</button>
    </div>

    <aside class="scene-summary">
      <span><strong>{{ visibleDeploymentCount }}</strong> visible deployments</span>
      <span><strong>{{ visiblePodCount }}</strong> visible pods</span>
      <span><strong>{{ readyPodCount }}</strong> ready</span>
      <span v-if="lightingProgress > 0" class="studio-light">
        <strong>{{ lightingProgress < 1 ? `${Math.round(lightingProgress * 100)}%` : 'ready' }}</strong>
        studio light
      </span>
    </aside>

    <aside v-if="selected" class="inspector">
      <button class="close" type="button" aria-label="Close inspector" @click="emit('clearSelection')">×</button>
      <p>{{ selected.namespace }} / {{ selected.team }}</p>
      <h2>{{ selected.id }}</h2>
      <dl>
        <div><dt>Status</dt><dd :class="selected.status">{{ selected.status }}</dd></div>
        <div><dt>Replicas</dt><dd>{{ selected.readyReplicas }}/{{ selected.desiredReplicas }}</dd></div>
        <div><dt>Requests</dt><dd>{{ Math.round(selected.metrics.requestsPerSecond) }}/s</dd></div>
        <div><dt>p95 latency</dt><dd>{{ Math.round(selected.metrics.latencyP95Ms) }} ms</dd></div>
        <div><dt>Error rate</dt><dd>{{ (selected.metrics.errorRate * 100).toFixed(2) }}%</dd></div>
        <template v-if="selectedPod">
          <div><dt>Pod</dt><dd>{{ selectedPod.id }}</dd></div>
          <div><dt>Phase</dt><dd>{{ selectedPod.phase }}</dd></div>
          <div><dt>Restarts</dt><dd>{{ selectedPod.restarts }}</dd></div>
          <div><dt>Memory</dt><dd>{{ Math.round(selectedPod.metrics.memoryMb) }} MB</dd></div>
        </template>
      </dl>
    </aside>

    <ol v-if="recentEvents.length" class="events" aria-label="Recent lifecycle events">
      <li v-for="event in recentEvents.slice(0, 4)" :key="event.id" :class="event.severity">
        <time>t={{ event.t }}</time>
        <strong>{{ event.reason }}</strong>
        <span>{{ event.resource.id }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AdditiveBlending, NormalBlending } from 'three'
import { Vuetrex, type VuetrexStage, type VxSettings, type VxStage } from '@/lib-components/index.js'
import BackgroundWall from './scene/BackgroundWall.vue'
import MainStage from './scene/MainStage.vue'
import {
  startProgressiveStudioLight,
  type ProgressiveStudioLight,
} from '../lighting/progressiveStudioLight.js'
import {
  createSelectedPodLight,
  type SelectedPodLight,
} from '../lighting/selectedPodLight.js'
import type {
  CompositionPattern,
  DeploymentViewModel,
  HealthEvent,
  MetricPodSample,
  RenderFeatures,
  RelationViewModel,
  ThemeMode,
} from '../types.js'

const props = defineProps<{
  camera: string
  composition: CompositionPattern
  diagnostics: boolean
  renderFeatures: RenderFeatures
  theme: ThemeMode
  currentTime: number
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  selected: DeploymentViewModel | null
  selectedPod: (MetricPodSample & { ordinal: number }) | null
  recentEvents: HealthEvent[]
  error: string
}>()

const emit = defineEmits<{
  selectDeployment: [id: string]
  selectPod: [deploymentId: string, podId: string]
  clearSelection: []
  reconnect: []
}>()

const settings = computed<VxSettings>(() => ({
  unit: 1,
  distance: 0.34,
  gap: 0.34,
  color: props.theme === 'light' ? 0x737d85 : 0x38434a,
  backgroundColor: props.theme === 'light' ? 0xffffff : 0x111719,
  fog: {
    color: props.theme === 'light' ? 0xffffff : 0x111719,
    near: 18,
    far: 38,
  },
  highlightColor: props.theme === 'light' ? 0x2588df : 0x4e9cbe,
  floorColor: props.theme === 'light' ? 0xf7f6f3 : 0x171b1d,
  captionColor: props.theme === 'light' ? 0x273039 : 0xe8ecee,
  connectorColor: props.theme === 'light' ? 0x26313a : 0xa0ffff,
  particleColor: props.theme === 'light' ? 0x26313a : 0x72d6e8,
  particleBlending: props.theme === 'light' ? NormalBlending : AdditiveBlending,
  lightColor1: props.theme === 'light' ? 0xfffbf5 : 0x9ac7d6,
  lightColor2: props.theme === 'light' ? 0xe2edff : 0xffffff,
  mirrorOpacity: 0.76,
  particleSpread: 0.016,
  particleVolume: 36,
  floorGrid: props.renderFeatures.floorGrid,
  floorMirror: props.renderFeatures.floorMirror,
  floorCaptions: props.renderFeatures.floorCaptions,
  shadows: props.renderFeatures.shadows,
}))

// Stage-level render features are construction settings. A keyed remount keeps
// the demo control simple while preserving application-owned camera state.
const stageKey = computed(() => [
  props.theme,
  props.renderFeatures.floorGrid,
  props.renderFeatures.floorMirror,
  props.renderFeatures.floorCaptions,
  props.renderFeatures.shadows,
].map(value => value ? '1' : '0').join(''))

let stage: VxStage | undefined
let studioLight: ProgressiveStudioLight | undefined
let podLight: SelectedPodLight | undefined
let studioLightTimer: ReturnType<typeof setTimeout> | undefined
const lightingProgress = ref(0)
const visiblePodCount = computed(() =>
  props.deployments.reduce((count, item) => count + item.pods.length, 0),
)
const visibleDeploymentCount = computed(() =>
  props.deployments.filter(item => item.currentReplicas > 0).length,
)
const readyPodCount = computed(() =>
  props.deployments.reduce((count, item) => count + item.readyReplicas, 0),
)

function onReady(value: VxStage) {
  disposeStudioLight()
  podLight?.dispose()
  stage = value
  stage.setDiagnostics(props.diagnostics)
  podLight = createSelectedPodLight(value as VuetrexStage, { theme: props.theme })
  syncSelectedPodLight()
  scheduleStudioLight()
}

watch(() => props.diagnostics, enabled => stage?.setDiagnostics(enabled))
watch(
  () => [props.selected?.id, props.selectedPod?.id, props.camera],
  syncSelectedPodLight,
  { flush: 'post' },
)
watch(
  () => [visibleDeploymentCount.value, props.composition],
  scheduleStudioLight,
  { flush: 'post' },
)

function syncSelectedPodLight() {
  podLight?.setTarget(
    props.selected?.id,
    props.selectedPod?.id,
    Boolean(props.selectedPod && props.camera !== 'scene'),
  )
}

function scheduleStudioLight() {
  if (studioLightTimer !== undefined) clearTimeout(studioLightTimer)
  if (!stage || visibleDeploymentCount.value === 0) return
  studioLightTimer = setTimeout(() => {
    studioLight?.dispose()
    lightingProgress.value = 0.001
    studioLight = startProgressiveStudioLight(stage as VuetrexStage, {
      theme: props.theme,
      onProgress(progress) {
        lightingProgress.value = progress
      },
    })
    if (!studioLight) lightingProgress.value = 0
  }, 500)
}

function disposeStudioLight() {
  if (studioLightTimer !== undefined) {
    clearTimeout(studioLightTimer)
    studioLightTimer = undefined
  }
  studioLight?.dispose()
  studioLight = undefined
  lightingProgress.value = 0
}

onBeforeUnmount(() => {
  disposeStudioLight()
  podLight?.dispose()
  podLight = undefined
})
</script>

<style scoped>
.scene-shell { position: relative; min-width: 0; min-height: 0; }
.scene-shell :deep(canvas) { display: block; }
.scene-summary, .inspector, .events, .error-banner {
  position: absolute;
  border: 1px solid var(--border);
  background: var(--overlay);
}
.scene-summary {
  top: 24px;
  left: 20px;
  display: flex;
  gap: 18px;
  padding: 10px 13px;
  color: var(--text-muted);
  font-size: 11px;
}
.scene-summary strong { color: var(--text-strong); }
.scene-summary .studio-light { color: var(--accent); }
.inspector { top: 24px; right: 20px; width: 260px; padding: 16px; }
.inspector p {
  margin: 0 0 4px;
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.inspector h2 { margin: 4px 0 15px; font-size: 18px; }
.close {
  position: absolute;
  top: 7px;
  right: 7px;
  min-height: 27px;
  padding: 1px 8px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
  font-size: 17px;
}
.inspector dl, .inspector dl div { margin: 0; }
.inspector dl div {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--border-soft);
  font-size: 12px;
}
.inspector dt { color: var(--text-subtle); }
.inspector dd { margin: 0; font-weight: 700; }
.inspector dd.healthy { color: #6ed393; }
.inspector dd.degraded { color: #e5ad4c; }
.inspector dd.unavailable { color: #ee6670; }
.events {
  right: 20px;
  bottom: 20px;
  width: 350px;
  margin: 0;
  padding: 8px 12px;
  list-style: none;
}
.events li {
  display: grid;
  grid-template-columns: 48px 1fr 1.2fr;
  gap: 8px;
  padding: 6px 0;
  color: var(--text-muted);
  border-top: 1px solid var(--border-soft);
  font-size: 11px;
}
.events li:first-child { border-top: 0; }
.events time { color: #6faec0; }
.events .warning strong { color: #e4ae53; }
.events .critical strong { color: #ed6871; }
.error-banner {
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  color: #ffd8d8;
  transform: translateX(-50%);
}
.error-banner button {
  min-height: 29px;
  padding: 4px 8px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
}

@media (max-width: 900px) {
  .scene-summary { top: 10px; left: 10px; }
  .inspector { top: 58px; right: 10px; width: min(260px, calc(100% - 20px)); }
  .events { right: 10px; bottom: 10px; width: min(350px, calc(100% - 20px)); }
}

@media (max-width: 560px) {
  .scene-summary { gap: 10px; font-size: 10px; }
  .events { display: none; }
}
</style>

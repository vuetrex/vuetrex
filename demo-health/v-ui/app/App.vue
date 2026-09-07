<template>
  <main class="app-shell" :data-theme="theme">
    <Header
      :state="state"
      :current-time="currentTime"
      :connection="connection"
      :composition="composition"
      :diagnostics="diagnostics"
      :render-features="renderFeatures"
      :theme="theme"
      @patch="updateState"
      @composition="composition = $event"
      @diagnostics="diagnostics = $event"
      @render-features="renderFeatures = $event"
      @theme="theme = $event"
      @overview="showOverview"
    />

    <Stage
      :key="theme"
      :camera="camera"
      :composition="composition"
      :diagnostics="diagnostics"
      :render-features="renderFeatures"
      :theme="theme"
      :current-time="currentTime"
      :deployments="deployments"
      :relations="relations"
      :selected="selected"
      :selected-pod="selectedPod"
      :recent-events="recentEvents"
      :error="error"
      @select-deployment="selectDeployment"
      @select-pod="selectPod"
      @clear-selection="clearSelection"
      @reconnect="connect"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Header from '../components/Header.vue'
import Stage from '../components/Stage.vue'
import { useHealthFixture } from '../composables/useHealthFixture.js'
import { useResearchScene } from '../model/sceneModel.js'
import type { CompositionPattern, RenderFeatures, ThemeMode } from '../types.js'

const selectedId = ref('')
const selectedPodId = ref('')
const camera = ref('scene')
const composition = ref<CompositionPattern>('radial')
const diagnostics = ref(false)
const theme = ref<ThemeMode>(initialTheme())
const renderFeatures = ref<RenderFeatures>({
  floorGrid: true,
  floorMirror: false,
  floorCaptions: false,
  shadows: false,
})

const {
  catalog,
  snapshot,
  metrics,
  state,
  currentTime,
  recentEvents,
  connection,
  error,
  connect,
  updateState,
} = useHealthFixture()

const { deployments, relations, selected } = useResearchScene(
  catalog,
  snapshot,
  metrics,
  selectedId,
)

const selectedPod = computed(() =>
  selected.value?.pods.find(pod => pod.id === selectedPodId.value) ?? null,
)

function selectDeployment(id: string) {
  selectedId.value = id
  selectedPodId.value = ''
  camera.value = composition.value === 'radial' ? 'main-stage' : id
}

function selectPod(deploymentId: string, podId: string) {
  selectedId.value = deploymentId
  selectedPodId.value = podId
  camera.value = composition.value === 'radial' ? 'main-stage' : deploymentId
}

function clearSelection() {
  selectedId.value = ''
  selectedPodId.value = ''
  camera.value = 'scene'
}

function showOverview() {
  clearSelection()
}

watch(composition, pattern => {
  camera.value = selectedId.value
    ? pattern === 'radial' ? 'main-stage' : selectedId.value
    : 'scene'
})

watch(theme, value => {
  document.documentElement.dataset.theme = value
  window.localStorage.setItem('vuetrex-health-theme', value)
}, { immediate: true })

function initialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('vuetrex-health-theme')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

onMounted(() => void connect())
</script>

<style>
:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
  color-scheme: dark;
  --app-bg: #141719;
  --toolbar-bg: #1b2023;
  --surface: #263036;
  --surface-hover: #303d43;
  --overlay: rgba(25, 31, 34, 0.92);
  --border: #47535a;
  --border-soft: #343b3f;
  --text: #e8ecee;
  --text-strong: #edf2f4;
  --text-muted: #aab5ba;
  --text-subtle: #9ba7ad;
  --accent: #68aabe;
  --accent-strong: #54a5bd;
  --menu-bg: #20282c;
  --shadow: rgba(0, 0, 0, 0.28);
}

:root[data-theme='light'] {
  color-scheme: light;
  --app-bg: #dfe6e8;
  --toolbar-bg: #f5f7f8;
  --surface: #ffffff;
  --surface-hover: #e7eef0;
  --overlay: rgba(250, 252, 252, 0.94);
  --border: #aebbc0;
  --border-soft: #cbd4d7;
  --text: #17242b;
  --text-strong: #101b20;
  --text-muted: #52636b;
  --text-subtle: #687980;
  --accent: #247f9d;
  --accent-strong: #1687a8;
  --menu-bg: #f8fafb;
  --shadow: rgba(31, 48, 56, 0.18);
}

* { box-sizing: border-box; }
body { min-width: 360px; margin: 0; overflow: hidden; color: var(--text); background: var(--app-bg); }
button, select, input { font: inherit; }

.app-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
  color: var(--text);
  background: var(--app-bg);
}
</style>

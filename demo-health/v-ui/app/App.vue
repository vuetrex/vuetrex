<template>
  <main class="app-shell">
    <Header
      :state="state"
      :current-time="currentTime"
      :connection="connection"
      :composition="composition"
      :wall-mode="wallMode"
      :diagnostics="diagnostics"
      :render-features="renderFeatures"
      @patch="updateState"
      @composition="composition = $event"
      @wall-mode="wallMode = $event"
      @diagnostics="diagnostics = $event"
      @render-features="renderFeatures = $event"
      @overview="showOverview"
    />

    <Stage
      :camera="camera"
      :composition="composition"
      :wall-mode="wallMode"
      :diagnostics="diagnostics"
      :render-features="renderFeatures"
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
import type { CompositionPattern, RenderFeatures, WallDisplayMode } from '../types.js'

const selectedId = ref('')
const selectedPodId = ref('')
const camera = ref('scene')
const composition = ref<CompositionPattern>('radial')
const wallMode = ref<WallDisplayMode>('continuous')
const diagnostics = ref(false)
const renderFeatures = ref<RenderFeatures>({
  floorGrid: true,
  floorMirror: false,
  floorCaptions: false,
  shadows: true,
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

onMounted(() => void connect())
</script>

<style>
:root {
  color: #e8ecee;
  background: #141719;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
body { min-width: 360px; margin: 0; overflow: hidden; }
button, select, input { font: inherit; }

.app-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
  background: #141719;
}
</style>

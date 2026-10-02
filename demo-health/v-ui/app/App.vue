<template>
  <main class="health-showcase">
    <Stage
      :deployments="deployments"
      :relations="relations"
      :current-time="currentTime"
      :connection="connection"
      :error="error"
      @reconnect="connect"
    />
    <Header
      :state="state"
      :current-time="currentTime"
      :connection="connection"
      @patch="updateState"
    />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Header from '../components/Header.vue'
import Stage from '../components/Stage.vue'
import { useHealthFixture } from '../composables/useHealthFixture.js'
import { useResearchScene } from '../model/sceneModel.js'

const noSelection = ref('')
const {
  catalog,
  snapshot,
  metrics,
  state,
  currentTime,
  connection,
  error,
  connect,
  updateState,
} = useHealthFixture()
const { deployments, relations } = useResearchScene(catalog, snapshot, metrics, noSelection)

onMounted(() => void connect())
</script>

<style>
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #16232c;
  background: #f7f7f8;
  font-synthesis: none;
}
* { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; }
button, select, input { font: inherit; }
.health-showcase {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at 50% 32%, rgba(153, 215, 242, 0.18), transparent 34%), #f7f7f8;
}
</style>

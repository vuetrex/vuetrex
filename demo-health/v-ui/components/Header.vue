<template>
  <div class="header-shell">
    <header class="toolbar">
      <div class="title-block">
        <p>VUETREX HEALTH LAB</p>
        <h1>Five-service checkout path</h1>
      </div>

      <div class="timeline" aria-label="Simulation controls">
        <button type="button" @click="restart">Restart</button>
        <button type="button" @click="togglePlayback">
          {{ state?.playing ? 'Pause' : 'Play' }}
        </button>

        <label>
          Scenario
          <select :value="state?.scenario" @change="changeScenario">
            <option v-for="scenario in state?.availableScenarios" :key="scenario.id" :value="scenario.id">
              {{ scenario.label }}
            </option>
          </select>
        </label>

        <label>
          Rate
          <select :value="state?.rate" @change="changeRate">
            <option :value="0.5">0.5x</option>
            <option :value="1">1x</option>
            <option :value="2">2x</option>
            <option :value="5">5x</option>
          </select>
        </label>

        <label>
          Composition
          <select :value="composition" @change="changeComposition">
            <option v-for="pattern in compositionPatterns" :key="pattern.id" :value="pattern.id">
              {{ pattern.label }}
            </option>
          </select>
        </label>

        <label>
          Wall
          <select :value="wallMode" @change="changeWallMode">
            <option value="continuous">Canvas wall</option>
            <option value="displays">Display set</option>
          </select>
        </label>

        <button type="button" @click="seekToIncident">t=120</button>
        <button type="button" :aria-pressed="diagnostics" @click="emit('diagnostics', !diagnostics)">
          Diagnostics
        </button>

        <details class="render-menu">
          <summary>Render</summary>
          <div class="render-options">
            <label>
              <input
                type="checkbox"
                :checked="renderFeatures.floorGrid"
                @change="changeRenderFeature('floorGrid', $event)"
              />
              Floor grid
            </label>
            <label>
              <input
                type="checkbox"
                :checked="renderFeatures.floorMirror"
                @change="changeRenderFeature('floorMirror', $event)"
              />
              Mirror
            </label>
            <label>
              <input
                type="checkbox"
                :checked="renderFeatures.floorCaptions"
                @change="changeRenderFeature('floorCaptions', $event)"
              />
              Floor labels
            </label>
            <label>
              <input
                type="checkbox"
                :checked="renderFeatures.shadows"
                @change="changeRenderFeature('shadows', $event)"
              />
              Shadows
            </label>
          </div>
        </details>
        <label class="theme-control">
          <input
            class="theme-toggle"
            type="checkbox"
            role="switch"
            :checked="theme === 'light'"
            aria-label="Light mode"
            @change="changeTheme"
          />
          <span class="theme-track" aria-hidden="true"><span /></span>
          <span>{{ theme === 'light' ? 'Light' : 'Dark' }}</span>
        </label>
        <button type="button" @click="emit('overview')">Overview</button>
      </div>

      <div class="clock">
        <span :class="['connection', connection]">{{ connection }}</span>
        <strong>t={{ currentTime.toFixed(1) }}</strong>
      </div>
    </header>

    <div class="scrubber">
      <input
        type="range"
        min="0"
        max="300"
        step="1"
        :value="currentTime"
        aria-label="Simulation time"
        @change="changeTime"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  CompositionPattern,
  ConnectionStatus,
  ControlState,
  RenderFeatures,
  TimelinePatch,
  ThemeMode,
  WallDisplayMode,
} from '../types.js'

const props = defineProps<{
  state: ControlState | null
  currentTime: number
  connection: ConnectionStatus
  composition: CompositionPattern
  wallMode: WallDisplayMode
  diagnostics: boolean
  renderFeatures: RenderFeatures
  theme: ThemeMode
}>()

const emit = defineEmits<{
  patch: [patch: TimelinePatch]
  composition: [pattern: CompositionPattern]
  wallMode: [mode: WallDisplayMode]
  diagnostics: [enabled: boolean]
  renderFeatures: [features: RenderFeatures]
  theme: [mode: ThemeMode]
  overview: []
}>()

const compositionPatterns: Array<{ id: CompositionPattern, label: string }> = [
  { id: 'row', label: 'Service row' },
  { id: 'radial', label: 'Radial focus' },
  { id: 'temporal', label: 'Temporal depth' },
]

function restart() {
  emit('patch', { t: 0, playing: true })
}

function togglePlayback() {
  emit('patch', { playing: !props.state?.playing })
}

function seekToIncident() {
  emit('patch', { t: 120, playing: false })
}

function changeScenario(event: Event) {
  emit('patch', { scenario: (event.target as HTMLSelectElement).value })
}

function changeRate(event: Event) {
  emit('patch', { rate: Number((event.target as HTMLSelectElement).value) })
}

function changeComposition(event: Event) {
  emit('composition', (event.target as HTMLSelectElement).value as CompositionPattern)
}

function changeWallMode(event: Event) {
  emit('wallMode', (event.target as HTMLSelectElement).value as WallDisplayMode)
}

function changeTime(event: Event) {
  emit('patch', {
    t: Number((event.target as HTMLInputElement).value),
    playing: false,
  })
}

function changeTheme(event: Event) {
  emit('theme', (event.target as HTMLInputElement).checked ? 'light' : 'dark')
}

function changeRenderFeature(feature: keyof RenderFeatures, event: Event) {
  emit('renderFeatures', {
    ...props.renderFeatures,
    [feature]: (event.target as HTMLInputElement).checked,
  })
}
</script>

<style scoped>
.header-shell { min-width: 0; }
.toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto minmax(150px, 0.45fr);
  align-items: center;
  min-height: 104px;
  width: 100%;
  min-width: 0;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--toolbar-bg);
}
.toolbar > *, .timeline, .timeline label { min-width: 0; }
.title-block p {
  margin: 0 0 4px;
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.title-block h1 { margin: 0; font-size: 21px; letter-spacing: 0; }
.timeline { display: flex; width: 100%; align-items: end; gap: 8px; }
.timeline label { display: grid; gap: 4px; color: var(--text-subtle); font-size: 10px; }
select { max-width: 100%; }
button, select {
  min-height: 34px;
  padding: 7px 10px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
}
button { cursor: pointer; }
button:hover, select:hover { border-color: var(--accent); background: var(--surface-hover); }
.render-menu { position: relative; }
.render-menu summary {
  min-height: 34px;
  padding: 7px 10px;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
  list-style: none;
}
.render-menu summary::-webkit-details-marker { display: none; }
.render-menu[open] summary { border-color: var(--accent); background: var(--surface-hover); }
.render-options {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  min-width: 170px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: var(--menu-bg);
  box-shadow: 0 12px 28px var(--shadow);
}
.render-options label {
  display: flex;
  grid-template-columns: none;
  flex-direction: row;
  align-items: center;
  gap: 9px;
  min-height: 30px;
  color: var(--text);
  font-size: 11px;
}
.render-options input { width: 14px; height: 14px; margin: 0; accent-color: #54a5bd; }
.theme-control {
  position: relative;
  display: flex !important;
  grid-template-columns: none !important;
  flex-direction: row;
  align-items: center;
  flex: 0 0 78px !important;
  gap: 7px !important;
  min-height: 34px;
  padding: 5px 8px;
  color: var(--text) !important;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  cursor: pointer;
  font-size: 11px !important;
}
.theme-toggle { position: absolute; width: 1px; height: 1px; opacity: 0; }
.theme-track {
  position: relative;
  flex: 0 0 28px;
  width: 28px;
  height: 16px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-hover);
}
.theme-track span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform 140ms ease, background 140ms ease;
}
.theme-toggle:checked + .theme-track span { background: var(--accent-strong); transform: translateX(12px); }
.theme-toggle:focus-visible + .theme-track { outline: 2px solid var(--accent); outline-offset: 2px; }
.clock { display: grid; justify-items: end; gap: 7px; font-variant-numeric: tabular-nums; }
.connection { color: var(--text-muted); font-size: 11px; }
.connection.connected { color: #6ecb8d; }
.connection.reconnecting { color: #e1ae55; }
.scrubber { z-index: 4; width: 100%; min-width: 0; height: 12px; }
.scrubber input { display: block; width: 100%; height: 12px; margin: 0; accent-color: #54a5bd; }

@media (max-width: 900px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding: 12px 14px;
  }
  .timeline {
    grid-column: 1 / -1;
    grid-row: 2;
    flex-wrap: wrap;
    align-items: end;
  }
  .timeline label:first-of-type { flex: 1 1 180px; }
  .timeline label:first-of-type select { width: 100%; }
  .title-block h1 { font-size: 18px; }
}

@media (max-width: 560px) {
  .timeline { gap: 6px; }
  .timeline label { flex: 1 1 130px; }
  button, select { min-height: 32px; padding: 6px 8px; }
}
</style>

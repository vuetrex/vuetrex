<template>
  <header class="hud">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <div><p>VUETREX / LIVE SYSTEM</p><h1>Commerce pulse</h1></div>
    </div>

    <div class="transport" aria-label="Simulation controls">
      <button class="round" type="button" :aria-label="state?.playing ? 'Pause' : 'Play'" @click="togglePlayback">
        {{ state?.playing ? 'Ⅱ' : '▶' }}
      </button>
      <div class="time"><strong>{{ formatTime(currentTime) }}</strong><span>SIMULATION TIME</span></div>
      <input type="range" min="0" max="300" step="1" :value="currentTime" aria-label="Simulation time" @input="seek" />
      <button class="text-button" type="button" @click="restart">Restart</button>
    </div>

    <div class="controls">
      <label><span>Scenario</span><select :value="state?.scenario" @change="changeScenario">
        <option v-for="scenario in state?.availableScenarios" :key="scenario.id" :value="scenario.id">{{ scenario.label }}</option>
      </select></label>
      <label><span>Speed</span><select :value="state?.rate" @change="changeRate">
        <option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option><option :value="5">5×</option>
      </select></label>
      <span :class="['connection', connection]"><i />{{ connection }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { ConnectionStatus, ControlState, TimelinePatch } from '../types.js'
const props = defineProps<{ state: ControlState | null; currentTime: number; connection: ConnectionStatus }>()
const emit = defineEmits<{ patch: [patch: TimelinePatch] }>()
function togglePlayback() { emit('patch', { playing: !props.state?.playing }) }
function restart() { emit('patch', { t: 0, playing: true }) }
function seek(event: Event) { emit('patch', { t: Number((event.target as HTMLInputElement).value), playing: false }) }
function changeScenario(event: Event) { emit('patch', { scenario: (event.target as HTMLSelectElement).value }) }
function changeRate(event: Event) { emit('patch', { rate: Number((event.target as HTMLSelectElement).value) }) }
function formatTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`
}
</script>

<style scoped>
.hud{position:absolute;z-index:10;top:18px;right:22px;left:22px;display:grid;grid-template-columns:minmax(230px,.8fr) minmax(390px,1.4fr) minmax(300px,1fr);align-items:center;gap:24px;min-height:76px;padding:12px 16px;border:1px solid rgba(129,151,164,.25);border-radius:18px;background:rgba(251,252,253,.86);box-shadow:0 18px 55px rgba(59,76,86,.12);backdrop-filter:blur(18px) saturate(1.15)}
.brand,.transport,.controls{display:flex;align-items:center}.brand{gap:12px}.brand-mark{display:flex;align-items:end;gap:3px;width:34px;height:34px;padding:6px;border-radius:10px;background:#172a36}.brand-mark i{display:block;width:5px;border-radius:4px;background:#52c8e8}.brand-mark i:nth-child(1){height:11px}.brand-mark i:nth-child(2){height:21px;background:#187fbe}.brand-mark i:nth-child(3){height:15px;background:#ff8176}.brand p,.brand h1{margin:0}.brand p{color:#778791;font-size:9px;font-weight:800;letter-spacing:.16em}.brand h1{margin-top:2px;font-size:20px;letter-spacing:-.025em}
.transport{gap:13px}button{cursor:pointer}.round{width:40px;height:30px;border:0;border-radius:50%;color:white;background:#168bdf;box-shadow:0 6px 16px rgba(22,139,223,.25)}.time{display:grid;min-width:62px}.time strong{font-size:15px;font-variant-numeric:tabular-nums}.time span,label>span{color:#89969e;font-size:8px;font-weight:800;letter-spacing:.12em}input[type="range"]{min-width:110px;width:100%;accent-color:#168bdf}.text-button{padding:7px 10px;border:1px solid #d2dce1;border-radius:8px;color:#3c4d57;background:white}
.controls{justify-content:flex-end;gap:10px}label{display:grid;gap:3px}select{height:34px;max-width:145px;padding:0 28px 0 9px;border:1px solid #d2dce1;border-radius:8px;color:#293943;background:white}.connection{display:inline-flex;align-items:center;gap:6px;color:#73838c;font-size:10px;font-weight:750;text-transform:uppercase}.connection i{width:7px;height:7px;border-radius:50%;background:#a9b3b8}.connection.connected i{background:#43c49a;box-shadow:0 0 0 4px rgba(67,196,154,.12)}.connection.reconnecting i{background:#f2ad55}
@media(max-width:1050px){.hud{grid-template-columns:1fr 1.4fr}.controls{display:none}}@media(max-width:700px){.hud{right:10px;left:10px;grid-template-columns:1fr;gap:9px}.transport{width:100%}.brand h1{font-size:17px}}
</style>

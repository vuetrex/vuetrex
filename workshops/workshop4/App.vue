<template>
  <main :style="{ colorScheme: dark ? 'dark' : 'light', background: dark ? '#181d24' : '#f3f4f6', color: dark ? '#e8edf3' : '#202630' }">
    <header>
      <a href="/">← Workshops</a> <strong>Workshop 4 · Postprocessing lab</strong>
      <label><input v-model="dark" type="checkbox" /> Dark mode</label>
      <button v-for="target in ['scene', ...objects.map(o => o.id)]" :key="target" :aria-pressed="focused === target" @click="focus(target)">{{ target === 'scene' ? 'Overview' : target }}</button>
      <button @click="reset">Reset composer</button>
    </header>
    <div class="layout">
      <section aria-label="Composition preview">
        <Vuetrex :key="String(dark)" width="100%" height="70vh" :settings="settings" :scheme="dark ? 'dark' : 'light'" @ready="stage = $event">
          <vx-composer v-bind="applied" />
          <vx-camera fit="content" :direction="[0.25, 0.6, 1]" :padding="0.8" />
          <vx-lighting :key-intensity="2.7" :fill-intensity="0.7" shadow-quality="high" />
          <vx-environment preset="studio" :intensity="0.6" />
          <vx-floor :color="dark ? 0x181d24 : 0xe7e9ec" finish="matte" :grid="false" :captions="false" />
          <vx-group :placement="at(0, 0, 0)">
            <vx-box :size="8" :depth="6.8" :height="0.25" :material="{ color: dark ? '#394452' : '#d1d7df', roughness: 0.8, metalness: 0.08 }" />
          </vx-group>
          <vx-group :placement="at(0, 1.65, 2.1)">
            <vx-display-wall id="wall" shape="curved" :radius="5" :arc="85" :height="2.6" :thickness="0.12" :bezel="0.05"
              :frame-color="dark ? 0x586574 : 0x475362" :surface="{ background: dark ? '#26394c' : '#bdd2e2' }"
              :screen-style="{ brightness: 0.8, effects: { bloom: 'exclude' } }" />
          </vx-group>
          <vx-group v-for="object in objects" :key="object.id" :placement="at(object.x, 0.25, object.z)">
            <component :is="object.shape" :id="object.id" :size="1.5" :height="object.height" :material="object.material" :effects="object.effects" @click="focus(object.id)" />
          </vx-group>
        </Vuetrex>
        <p>Click a shape to focus; Overview restores the full scene. Matte box in front, metal and emissive cylinders behind.</p>
        <p role="status">{{ error || 'Changes apply immediately. Invalid combinations keep the last valid preview.' }}</p>
        <details><summary>Effective composer values (quality may cap pixel ratio)</summary><pre>{{ effective }}</pre></details>
        <details><summary>Per-object materials and effects</summary>
          <fieldset v-for="object in objects" :key="object.id"><legend>{{ object.id }}</legend>
            <Fields v-model="object.material" /><Fields v-model="object.effects" />
          </fieldset>
        </details>
      </section>
      <aside aria-label="Postprocessing controls">
        <fieldset><legend>Composer</legend>
          <label>preset <select v-model="preset"><option v-for="p in presets" :key="p">{{ p }}</option></select></label>
          <Fields v-model="general" />
          <p>Preset changes reset output and effect overrides. “Preset” inherits; “On” uses defaults; “Custom” exposes every value.</p>
        </fieldset>
        <fieldset><legend>Output</legend><Fields v-model="output" /></fieldset>
        <fieldset v-for="(effect, name) in effects" :key="name"><legend>{{ name }}</legend>
          <label>State <select v-model="effect.mode"><option v-for="m in ['preset', 'off', 'on', 'custom']" :key="m">{{ m }}</option></select></label>
          <Fields v-if="effect.mode === 'custom'" v-model="effect.values" />
        </fieldset>
      </aside>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Quaternion, Vector3 } from 'three'
import { Vuetrex, composer, type VxComposerOptions, type VxComposerPreset, type VxStage } from '@/lib-components'
import { resolveComposerOptions } from '@/lib-components/scene/composer.js'
import Fields from './Fields.vue'

const presets: VxComposerPreset[] = ['technical', 'studio', 'luminous', 'editorial']
const preset = ref<VxComposerPreset>('studio')
const dark = ref(false)
const focused = ref('scene')
// Stage settings are construction-only; theme changes recreate the scene.
watch(dark, () => { focused.value = 'scene' })
let stage: VxStage | undefined
function focus(id: string) { focused.value = id; stage?.sendCameraTo(id) }
const at = (x: number, y: number, z: number) => ({ position: new Vector3(x, y, z), orientation: new Quaternion(), scale: new Vector3(1, 1, 1) })
const settings = computed(() => ({ backgroundColor: dark.value ? 0x181d24 : 0xf3f4f6, floorGrid: false, floorMirror: false, floorCaptions: false, shadows: true }))
const objects = ref([
  { id: 'box', shape: 'vx-box', x: 0, z: 1.4, height: 1.4, material: { color: '#dc7057', roughness: 0.82, metalness: 0, emissive: '#000000', emissiveIntensity: 0 }, effects: { bloom: 'auto', bloomGain: 1 } },
  { id: 'metal-cylinder', shape: 'vx-cylinder', x: -1.8, z: -0.9, height: 1.9, material: { color: '#b7c9e0', roughness: 0.18, metalness: 0.95, emissive: '#000000', emissiveIntensity: 0 }, effects: { bloom: 'exclude', bloomGain: 1 } },
  { id: 'glow-cylinder', shape: 'vx-cylinder', x: 1.8, z: -0.9, height: 1.65, material: { color: '#53cbb8', roughness: 0.35, metalness: 0.2, emissive: '#26ba91', emissiveIntensity: 1.2 }, effects: { bloom: 'include', bloomGain: 1 } },
])
const general = ref<Record<string, any>>({})
const output = ref<Record<string, any>>({})
const defaults = {
  bloom: { mode: 'selected', strength: 0.3, radius: 0.3, threshold: 0 },
  ambientOcclusion: { intensity: 0.2, radius: 0.25 }, grading: { contrast: 1, saturation: 1 },
  vignette: { strength: 0.1, offset: 0.8 },
}
const effects = ref<Record<string, { mode: string; values: Record<string, any> }>>({})
function reset() {
  const resolved = resolveComposerOptions({ preset: preset.value })!
  general.value = { enabled: true, quality: 'high', maxPixelRatio: 2, reducedEffects: 'system', protectAnnotations: false, antialias: 'auto' }
  output.value = { ...resolved.output }
  effects.value = Object.fromEntries(Object.entries(defaults).map(([key, values]) => [key, { mode: 'preset', values: { ...values, ...(typeof resolved[key as keyof typeof resolved] === 'object' ? resolved[key as keyof typeof resolved] as object : {}) } }]))
}
watch(preset, reset)
reset()
const applied = shallowRef<VxComposerOptions>({ preset: 'studio' })
const error = ref('')
watch([general, output, effects, preset], () => {
  const options: VxComposerOptions = { preset: preset.value, ...general.value, output: output.value,
    ...Object.fromEntries(Object.entries(effects.value).map(([key, effect]) => [key, effect.mode === 'preset' ? undefined : effect.mode === 'off' ? false : effect.mode === 'on' ? true : { ...effect.values }])),
  }
  try { applied.value = composer(options).build(); error.value = '' } catch (e) { error.value = String(e) }
}, { deep: true, immediate: true })
const effective = computed(() => JSON.stringify(resolveComposerOptions(applied.value), null, 2))
</script>

<style scoped>
main { min-height: 100vh; padding: 1rem; font: 14px system-ui, sans-serif; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
a { color: inherit; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 310px; gap: 1rem; margin-top: 1rem; }
aside { max-height: 88vh; overflow: auto; }
fieldset { margin: 0 0 0.7rem; }
:deep(label) { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.35rem 0; }
:deep(input:not([type=checkbox])), :deep(select) { width: 135px; box-sizing: border-box; }
p { font-size: 12px; } pre { overflow: auto; } button[aria-pressed=true] { font-weight: bold; }
@media (max-width: 800px) { .layout { grid-template-columns: 1fr; } aside { max-height: none; } }
</style>

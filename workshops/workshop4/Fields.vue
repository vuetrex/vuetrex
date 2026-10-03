<template>
  <label v-for="(value, key) in modelValue" :key="key">
    {{ key }}
    <select v-if="choices[key]" :value="String(value)" @change="update(key, ($event.target as HTMLSelectElement).value)">
      <option v-for="option in choices[key]" :key="String(option)" :value="String(option)">{{ option }}</option>
    </select>
    <input v-else-if="typeof value === 'boolean'" type="checkbox" :checked="value" @change="emit('update:modelValue', { ...modelValue, [key]: ($event.target as HTMLInputElement).checked })" />
    <input v-else :type="typeof value === 'number' ? 'number' : 'text'" :value="value" step="any"
      :min="limits[key]?.[0]" :max="limits[key]?.[1]" @change="update(key, ($event.target as HTMLInputElement).value, $event.target as HTMLInputElement)" />
  </label>
</template>
<script setup lang="ts">
const props = defineProps<{ modelValue: Record<string, any> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, any>] }>()
const choices: Record<string, (string | boolean)[]> = {
  quality: ['low', 'balanced', 'high'], reducedEffects: ['system', false, true],
  antialias: ['auto', 'off', 'fxaa'],
  mode: ['selected', 'luminance'], bloom: ['auto', 'include', 'exclude'],
}
const limits: Record<string, number[]> = {
  maxPixelRatio: [0.5, 3], exposure: [0.000001], intensity: [0, 1], contrast: [0, 2], saturation: [0, 2],
  bloomGain: [0, 4], threshold: [0],
}
function update(key: string | number, raw: string, input?: HTMLInputElement) {
  if (input && !input.reportValidity()) return
  const old = props.modelValue[key]
  const value = key === 'reducedEffects' ? (raw === 'system' ? raw : raw === 'true') : typeof old === 'number' ? Number(raw) : raw
  if (typeof old === 'number' && (!raw.trim() || !Number.isFinite(value))) return
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

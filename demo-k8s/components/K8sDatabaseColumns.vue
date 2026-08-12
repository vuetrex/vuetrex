<template>
  <vx-stack :gap="0.02" @click="$emit('select', id)">
    <vx-box
      :name="id"
      :text="label"
      :size="size"
      :height="0.18"
      :material="baseMaterial"
      :hover="{ color: 0x397fc2, emissive: 0x173d63, emissiveIntensity: 0.35, scale: 1.03, transition: 0.16 }"
    />
    <vx-group layout="grid" :gap="columnGap">
      <vx-box
        v-for="(height, index) in columnHeights"
        :key="index"
        :size="columnSize"
        :depth="columnSize"
        :height="height"
        :material="columnMaterial"
        :hover="{ color: 0x68b9ff, emissive: 0x226aa8, emissiveIntensity: 0.42, scale: 1.05, transition: 0.16 }"
      />
    </vx-group>
  </vx-stack>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DatabaseStatus } from './K8sDatabase.vue'

const props = withDefaults(defineProps<{
  id: string
  label: string
  status?: DatabaseStatus
  load?: number
  size?: number
}>(), {
  status: 'healthy',
  load: 0,
  size: 1.15,
})

defineEmits<{ select: [id: string] }>()

const columnSize = computed(() => props.size * 0.18)
const columnGap = computed(() => props.size * 0.055)

// The profile gives the database a recognizable skyline while load controls
// its bounded overall intensity. It is ready for the event emulator to drive.
const columnHeights = computed(() => {
  const load = Math.max(0, Math.min(1, props.load))
  const amplitude = 0.24 + load * 0.58
  return [0.62, 1.0, 0.76, 0.88, 1.28, 0.72, 1.08, 0.92, 0.68]
    .map(profile => amplitude * profile)
})

const statusColor = computed(() => {
  if (props.status === 'critical') return 0xa52e38
  if (props.status === 'degraded') return 0xa97826
  return 0x276a9d
})

const baseMaterial = computed(() => ({
  color: 0x172a3b,
  roughness: 0.48,
  metalness: 0.3,
  emissive: statusColor.value,
  emissiveIntensity: props.status === 'healthy' ? 0.08 : 0.2,
}))

const columnMaterial = computed(() => ({
  color: statusColor.value,
  roughness: Math.max(0.2, 0.42 - props.load * 0.14),
  metalness: 0.4,
  emissive: statusColor.value,
  emissiveIntensity: 0.14 + props.load * 0.12,
}))
</script>

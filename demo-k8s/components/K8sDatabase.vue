<template>
  <stack :gap="0.025" @click="$emit('select', id)">
    <cylinder
      v-for="level in 3"
      :key="level"
      :name="level === 1 ? id : `${id}-layer-${level}`"
      :text="level === 1 ? label : ''"
      :size="size"
      :height="0.2"
      :lines="level === 3 ? [label] : []"
      label-face="top"
      :label-font-size="0.13"
      :label-color="0xffffff"
      :material="material"
      :hover="{ color: 0xbcc6d1, emissive: 0x4f6579, emissiveIntensity: 0.3, scale: 1.04, transition: 0.16 }"
    />
  </stack>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type DatabaseStatus = 'healthy' | 'degraded' | 'critical'

const props = withDefaults(defineProps<{
  id: string
  label: string
  status?: DatabaseStatus
  load?: number
  size?: number
}>(), {
  status: 'healthy',
  load: 0,
  size: 1.05,
})

defineEmits<{ select: [id: string] }>()

const material = computed(() => {
  const color = props.status === 'critical' ? 0xa52e38 : props.status === 'degraded' ? 0x9a762c : 0x7a8794
  return {
    color,
    roughness: Math.max(0.2, 0.42 - props.load * 0.12),
    metalness: 0.58,
    emissive: color,
    emissiveIntensity: props.status === 'healthy' ? 0.04 : 0.18,
  }
})
</script>

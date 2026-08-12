<template>
  <stack :gap="0.025" @click="$emit('select', id)">
    <box
      v-for="level in 2"
      :key="level"
      :name="level === 1 ? id : `${id}-layer-${level}`"
      :size="size"
      :depth="size * 0.78"
      :height="0.2"
      :lines="level === 2 ? [label] : []"
      label-face="top"
      :label-font-size="0.13"
      :label-color="0xffffff"
      :material="material"
      :hover="{ color: hoverColor, emissive: hoverColor, emissiveIntensity: 0.35, scale: 1.05, transition: 0.16 }"
    />
  </stack>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  id: string
  label: string
  kind?: 'cache' | 'coordination'
  status?: 'healthy' | 'degraded' | 'critical'
  size?: number
}>(), {
  kind: 'cache',
  status: 'healthy',
  size: 0.92,
})

defineEmits<{ select: [id: string] }>()

const baseColor = computed(() => {
  if (props.status === 'critical') return 0xaa2433
  if (props.status === 'degraded') return 0xc37b1e
  return props.kind === 'coordination' ? 0x31a93a : 0xd72d38
})

const hoverColor = computed(() => props.kind === 'coordination' ? 0x58df63 : 0xff4854)
const material = computed(() => ({
  color: baseColor.value,
  roughness: 0.34,
  metalness: 0.28,
  emissive: baseColor.value,
  emissiveIntensity: 0.14,
}))
</script>

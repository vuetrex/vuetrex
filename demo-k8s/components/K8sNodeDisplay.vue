<template>
  <vx-stack :gap="0.018" @click="$emit('select', id)">
    <vx-box
      :size="width"
      :depth="0.2"
      :height="0.24"
      :lines="footerLines"
      label-align="left"
      :label-color="0xd9ecfb"
      :label-font-size="0.105"
      :label-padding="0.1"
      :material="footerMaterial"
      :hover="hover"
    />
    <vx-box
      :name="id" :id="id"
      :size="width"
      :depth="0.2"
      :height="0.92"
      :lines="bodyLines"
      label-align="left"
      :label-color="0xdce9f3"
      :label-font-size="0.105"
      :label-padding="0.1"
      :label-line-height="1.35"
      :material="bodyMaterial"
      :hover="hover"
    />
    <vx-box
      :size="width"
      :depth="0.2"
      :height="0.28"
      :lines="[label]"
      :label-color="0xffffff"
      :label-font-size="0.14"
      :material="headerMaterial"
      :hover="hover"
    />
  </vx-stack>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkloadStatus } from './K8sWorkload.vue'

const props = withDefaults(defineProps<{
  id: string
  label: string
  status?: WorkloadStatus
  replicas?: number
  desiredReplicas?: number
  throughput?: number
  latencyMs?: number
  width?: number
}>(), {
  status: 'healthy',
  replicas: 1,
  desiredReplicas: 1,
  throughput: 0,
  latencyMs: 0,
  width: 1.55,
})

defineEmits<{ select: [id: string] }>()

const statusColor = computed(() => {
  if (props.status === 'critical') return 0xa52e38
  if (props.status === 'degraded') return 0xa97826
  return 0x287848
})

const bodyLines = computed(() => [
  `  replicas   ${props.replicas}/${props.desiredReplicas}`,
  `  events/s   ${props.throughput}`,
  `  p99        ${props.latencyMs} ms`,
])
const footerLines = computed(() => [`status: ${props.status}`])

const headerMaterial = computed(() => ({
  color: statusColor.value,
  roughness: 0.42,
  metalness: 0.12,
  emissive: statusColor.value,
  emissiveIntensity: 0.16,
}))
const bodyMaterial = computed(() => ({
  color: 0x18232d,
  roughness: 0.56,
  metalness: 0.08,
  emissive: statusColor.value,
  emissiveIntensity: props.status === 'healthy' ? 0.04 : 0.12,
}))
const footerMaterial = computed(() => ({
  color: 0x24528c,
  roughness: 0.46,
  metalness: 0.12,
}))
const hover = computed(() => ({
  color: props.status === 'healthy' ? 0x3b8bba : statusColor.value,
  emissive: statusColor.value,
  emissiveIntensity: 0.34,
  scale: 1.025,
  transition: 0.16,
}))
</script>

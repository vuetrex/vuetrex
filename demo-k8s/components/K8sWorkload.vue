<template>
  <panel
    :name="id"
    :size="width"
    :depth="depth"
    :height="0.22"
    :lines="[label]"
    label-region="south"
    :label-share="0.4"
    :label-font-size="0.14"
    :label-color="0xffffff"
    :material="cardMaterial"
    :hover="{ color: 0x318fee, emissive: 0x103d66, emissiveIntensity: 0.35, scale: 1.04, transition: 0.16 }"
    @click="$emit('select', id)"
  >
    <stack :gap="0.025">
      <box
        v-for="layer in visiblePodLayers"
        :key="layer"
        :size="0.42"
        :depth="0.42"
        :height="podLayerHeight"
        :material="podMaterial"
        :hover="{ color: 0x42a5ff, emissive: 0x0b4578, emissiveIntensity: 0.45, transition: 0.16 }"
      />
    </stack>
  </panel>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type WorkloadStatus = 'healthy' | 'degraded' | 'critical'

const props = withDefaults(defineProps<{
  id: string
  label: string
  status?: WorkloadStatus
  replicas?: number
  desiredReplicas?: number
  throughput?: number
  latencyMs?: number
  width?: number
  depth?: number
}>(), {
  status: 'healthy',
  replicas: 1,
  desiredReplicas: 1,
  throughput: 0,
  latencyMs: 0,
  width: 1.55,
  depth: 0.92,
})

defineEmits<{ select: [id: string] }>()

const cardMaterial = computed(() => {
  const color = props.status === 'critical' ? 0x9e2833 : props.status === 'degraded' ? 0x8a651c : 0x174f88
  return { color, roughness: 0.34, metalness: 0.32, emissive: color, emissiveIntensity: 0.12 }
})

const podMaterial = computed(() => {
  const shortfall = props.desiredReplicas > props.replicas
  const color = props.status === 'critical' ? 0xea3e4c : shortfall || props.status === 'degraded' ? 0xe5a42b : 0x158ee2
  return { color, roughness: 0.28, metalness: 0.25, emissive: color, emissiveIntensity: 0.18 }
})

// Load and replica count produce a small, bounded visual signal. This is ready
// for the event emulator without allowing transient metrics to destroy layout.
const podHeight = computed(() => {
  const load = Math.min(0.22, props.throughput / 4000)
  const replicaSignal = Math.min(0.12, Math.max(0, props.replicas - 1) * 0.025)
  return 0.32 + load + replicaSignal
})

const visiblePodLayers = computed(() => Math.min(4, Math.max(1, props.replicas)))
const podLayerHeight = computed(() => {
  const gaps = (visiblePodLayers.value - 1) * 0.025
  return Math.max(0.07, (podHeight.value - gaps) / visiblePodLayers.value)
})
</script>

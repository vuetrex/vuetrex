<template>
  <vx-panel
    :name="deployment.id"
    :size="1.55"
    :depth="0.92"
    :height="0.18"
    :lines="[displayName]"
    label-region="south"
    :label-share="0.34"
    :label-font-size="0.13"
    :label-color="0xf4f7f9"
    :material="panelMaterial"
    :hover="hoverMaterial"
    @click="selectDeployment"
  >
    <vx-instances
      :items="deployment.pods"
      key-by="id"
      :encoding="podEncoding"
      :material="podBatchMaterial"
      :geometry="podGeometry"
      @click="selectPod"
    />
  </vx-panel>
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { computed } from 'vue'
import type { InstanceEncoding, InstanceHit, VxMouseEvent } from '@/lib-components/index.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { DeploymentViewModel } from '../../types.js'

const podGeometry = () => new RoundedBoxGeometry(1, 1, 1, 3, 0.08)
type Pod = DeploymentViewModel['pods'][number]

const props = defineProps<{
  deployment: DeploymentViewModel
}>()

const emit = defineEmits<{
  select: [id: string]
  selectPod: [deploymentId: string, podId: string]
}>()

const displayName = computed(() => props.deployment.id.replaceAll('-', ' '))
const statusColor = computed(() => {
  if (props.deployment.status === 'unavailable') return 0xa7333d
  if (props.deployment.status === 'degraded') return 0xb57b24
  return 0x2d7a55
})
const panelMaterial = computed(() => ({
  color: 0x26313a,
  roughness: 0.55,
  metalness: 0.12,
  emissive: statusColor.value,
  emissiveIntensity: props.deployment.status === 'healthy' ? 0.05 : 0.18,
}))
const hoverMaterial = computed(() => ({
  color: 0x3e5968,
  emissive: statusColor.value,
  emissiveIntensity: 0.28,
  scale: 1.035,
  transition: 0.16,
}))
const podBatchMaterial = {
  color: 0xffffff,
  roughness: 0.34,
  metalness: 0.18,
}

const podEncoding = computed<InstanceEncoding<Pod>>(() => {
  const heights = props.deployment.pods.map(podHeight)
  const centers: number[] = []
  let y = 0
  for (const height of heights) {
    centers.push(y + height / 2)
    y += height + 0.018
  }

  return {
    transform(_pod, index) {
      return new THREE.Matrix4().compose(
        new THREE.Vector3(0, centers[index], 0),
        new THREE.Quaternion(),
        new THREE.Vector3(0.36, heights[index], 0.36),
      )
    },
    color(pod) {
      return !pod.ready ? 0xb13942 : pod.restarts > 0 ? 0xc58a2b : 0x3e91c7
    },
  }
})

function selectPod(event: VxMouseEvent) {
  const hit = event.vxInstance as InstanceHit<Pod> | undefined
  if (hit) emit('selectPod', props.deployment.id, hit.id)
}

function selectDeployment(event: VxMouseEvent) {
  if (!event.vxInstance) emit('select', props.deployment.id)
}

function podHeight(pod: DeploymentViewModel['pods'][number]) {
  const memorySignal = Math.min(0.14, pod.metrics.memoryMb / 4000)
  return 0.09 + memorySignal
}
</script>

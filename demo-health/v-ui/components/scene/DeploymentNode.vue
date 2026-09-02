<template>
  <vx-panel
    :id="deployment.id"
    :name="displayName"
    :size="1.55"
    :depth="0.92"
    :height="0.18"
    :lines="[displayName, summaryLine]"
    label-region="south"
    label-align="left"
    :label-share="0.38"
    :label-font-size="0.10"
    :label-line-height="1.22"
    :label-color="0xf4f7f9"
    :material="panelMaterial"
    :hover="hoverMaterial"
    :disabled="deployment.currentReplicas === 0"
    @click="selectDeployment"
  >
    <vx-row :id="`${deployment.id}:content`" :name="`${displayName} content`" :gap="0.08">
      <vx-instances
        :id="`${deployment.id}:pods`"
        :name="`${displayName} pods`"
        :items="deployment.pods"
        key-by="id"
        :encoding="podEncoding"
        :material="podBatchMaterial"
        :geometry="podGeometry"
        @click="selectPod"
      />

      <vx-spacer
        :id="`${deployment.id}:metric-gap`"
        :name="`${displayName} metric gap`"
        :width="0.08"
        :height="0.34"
        :depth="0.34"
      />

      <vx-row :id="`${deployment.id}:signals`" :name="`${displayName} signals`" :gap="0.035">
        <vx-box
          :id="`${deployment.id}:traffic`"
          :name="`${displayName} traffic`"
          :size="0.14"
          :depth="0.14"
          :height="trafficHeight"
          :material="trafficMaterial"
          disabled
        />
        <vx-box
          :id="`${deployment.id}:latency`"
          :name="`${displayName} latency`"
          :size="0.14"
          :depth="0.14"
          :height="latencyHeight"
          :material="latencyMaterial"
          disabled
        />
      </vx-row>

      <vx-cylinder
        :id="`${deployment.id}:status`"
        :name="`${displayName} status`"
        :size="0.15"
        :height="0.055"
        :elevation="0.43"
        :text="displayName"
        :material="statusMaterial"
        :participates-in-layout="false"
        disabled
      />
    </vx-row>
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
  selected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  selectPod: [deploymentId: string, podId: string]
}>()

const displayName = computed(() => props.deployment.id.replaceAll('-', ' '))
const summaryLine = computed(() =>
  `${props.deployment.readyReplicas}/${props.deployment.desiredReplicas} ready | ${Math.round(props.deployment.metrics.requestsPerSecond)}/s`,
)
const statusColor = computed(() => {
  if (props.deployment.status === 'unavailable') return 0xa7333d
  if (props.deployment.status === 'degraded') return 0xb57b24
  return 0x2d7a55
})
const panelMaterial = computed(() => ({
  color: props.selected ? 0x315064 : 0x26313a,
  roughness: 0.55,
  metalness: 0.12,
  emissive: statusColor.value,
  emissiveIntensity: props.selected ? 0.24 : props.deployment.status === 'healthy' ? 0.05 : 0.18,
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
const trafficMaterial = {
  color: 0x3e91c7,
  roughness: 0.42,
  metalness: 0.1,
  emissive: 0x1d5978,
  emissiveIntensity: 0.16,
}
const latencyMaterial = computed(() => ({
  color: props.deployment.metrics.latencyP95Ms > 180 ? 0xc17a32 : 0x6a91a5,
  roughness: 0.42,
  metalness: 0.1,
  emissive: props.deployment.metrics.latencyP95Ms > 180 ? 0x6f341e : 0x294c5e,
  emissiveIntensity: 0.18,
}))
const statusMaterial = computed(() => ({
  color: statusColor.value,
  roughness: 0.32,
  metalness: 0.12,
  emissive: statusColor.value,
  emissiveIntensity: props.deployment.status === 'healthy' ? 0.25 : 0.5,
}))
const trafficHeight = computed(() =>
  0.10 + Math.min(0.24, props.deployment.metrics.requestsPerSecond / 1400),
)
const latencyHeight = computed(() =>
  0.10 + Math.min(0.24, props.deployment.metrics.latencyP95Ms / 800),
)

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

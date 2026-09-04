<template>
  <vx-group id="main-stage" name="Main stage" :placement="originPlacement">
    <vx-group id="stage-platform" name="Stage platform" :placement="platformPlacement">
      <vx-cylinder
        id="stage-platform-surface"
        name="Stage platform surface"
        :size="14"
        :height="0.2"
        :material="platformMaterial"
        disabled
      />
    </vx-group>

    <vx-layer id="deployment-layer" name="Deployment layer" :gap="0.25">
      <vx-group
        v-for="node in compositionNodes"
        :key="node.id"
        :id="`placement:${node.id}`"
        :name="`Placement: ${displayName(node.id)}`"
        :placement="node.placement"
        :visible="node.data.currentReplicas > 0"
      >
        <DeploymentNode
          :deployment="node.data"
          :selected="node.id === selectedId"
          :theme="theme"
          @select="emit('selectDeployment', $event)"
          @select-pod="(deploymentId, podId) => emit('selectPod', deploymentId, podId)"
        />
      </vx-group>
    </vx-layer>

    <vx-bus-connector
      v-if="gatewayTargets.length"
      id="gateway-api-bus"
      name="Gateway API bus"
      from="edge-gateway"
      :to="gatewayTargets"
      :side="composition === 'row' ? 'right' : 'auto'"
      to-port="auto"
      type="line"
      :elevation="0.12"
      :avoid="0.2"
    />

    <vx-connector
      v-for="(relation, index) in pointRelations"
      :key="relation.id"
      :id="`route:${relation.id}`"
      :name="`Route: ${displayName(relation.from)} to ${displayName(relation.to)}`"
      :from="relation.from"
      :to="relation.to"
      :type="relation.renderer"
      :layout="composition === 'temporal' ? 'spline' : 'bezier'"
      :from-port="{ x: 0.5, y: 0.72, z: 1 }"
      :to-port="{ x: 0.5, y: 0.72, z: 0 }"
      :elevation="0.34"
      :lane="index"
      :avoid="0.2"
    />
  </vx-group>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Quaternion, Vector3 } from 'three'
import { compose, type Placement } from '@/lib-components/index.js'
import DeploymentNode from './DeploymentNode.vue'
import { deploymentRecipe } from '../../recipes/deploymentRecipe.js'
import type {
  CompositionPattern,
  DeploymentViewModel,
  RelationViewModel,
  ThemeMode,
} from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  composition: CompositionPattern
  currentTime: number
  selectedId: string
  theme: ThemeMode
}>()

const emit = defineEmits<{
  selectDeployment: [id: string]
  selectPod: [deploymentId: string, podId: string]
}>()

const originPlacement: Placement = {
  position: new Vector3(),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
}

const platformPlacement: Placement = {
  position: new Vector3(0, -0.2, 0),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 0.68),
}

const platformMaterial = computed(() => ({
  color: props.theme === 'light' ? 0xb8c4c8 : 0x566267,
  roughness: 0.72,
  metalness: 0.08,
  transparent: true,
  opacity: props.theme === 'light' ? 0.52 : 0.34,
}))

const compositionNodes = computed(() => compose(deploymentRecipe, {
  deployments: props.deployments,
  relations: props.relations,
}, {
  time: props.currentTime,
  selectedId: props.selectedId || undefined,
  parameters: { pattern: props.composition },
}).fragment.nodes)

const activeRelations = computed(() => {
  const activeIds = new Set(props.deployments
    .filter(deployment => deployment.currentReplicas > 0)
    .map(deployment => deployment.id))
  return props.relations.filter(relation => activeIds.has(relation.from) && activeIds.has(relation.to))
})

const gatewayTargets = computed(() => activeRelations.value
  .filter(relation => relation.from === 'edge-gateway')
  .map(relation => relation.to))

const pointRelations = computed(() => activeRelations.value
  .filter(relation => relation.from !== 'edge-gateway'))

function displayName(id: string) {
  return id.replaceAll('-', ' ')
}
</script>

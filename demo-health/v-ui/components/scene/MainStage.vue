<template>
  <vx-group id="main-stage" name="Main stage" :placement="originPlacement">
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
          @select="emit('selectDeployment', $event)"
          @select-pod="(deploymentId, podId) => emit('selectPod', deploymentId, podId)"
        />
      </vx-group>
    </vx-layer>

    <!-- Relation metrics can later become direct connector encodings. -->
    <vx-connector
      v-for="relation in activeRelations"
      :key="relation.id"
      :from="relation.from"
      :to="relation.to"
      :type="relation.renderer"
      :layout="relation.layout"
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
} from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  composition: CompositionPattern
  currentTime: number
  selectedId: string
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

function displayName(id: string) {
  return id.replaceAll('-', ' ')
}
</script>

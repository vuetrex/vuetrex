<template>
  <vx-group name="main-stage" :placement="originPlacement">
    <vx-layer :gap="0.25">
      <vx-group
        v-for="node in compositionNodes"
        :key="node.id"
        :name="`placement-${node.id}`"
        :placement="node.placement"
      >
        <DeploymentNode
          :deployment="node.data"
          @select="emit('selectDeployment', $event)"
          @select-pod="(deploymentId, podId) => emit('selectPod', deploymentId, podId)"
        />
      </vx-group>
    </vx-layer>

    <!-- Relation metrics can later become direct connector encodings. -->
    <vx-connector
      v-for="relation in relations"
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
</script>

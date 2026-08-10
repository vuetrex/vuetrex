<template>
  <vuetrex height="79vh" width="100%">
    <layer :gap="1">
      <row align-x="start" :gap="0.4">
        <box text="align: start" size="1.2" />
        <box text="row" size="0.8" />
        <box text="+X slots" size="1" />
      </row>

      <ring :radius="0.7" start-angle="15" direction="reverse" :gap-ratio="0.5">
        <wedge
          v-for="item in 4"
          :key="item"
          :text="String(item)"
          height="0.35"
          :thickness="0.11"
        />
      </ring>

      <group layout="depth" :gap="0.35">
        <cylinder text="group" size="0.7" height="0.3" />
        <cylinder text="layout=depth" size="0.7" height="0.3" />
      </group>

       Concept previews: concepts/stacked1.png (VColumns) and concepts/stacked2.png (VNode).
      <row :gap="1.4">
        <VColumns />
        <VNode body=
"        Geometry
        Selection
        Position
          X
          Y
          Z
        Offset
          X
          Y
          Z"/>
        <!--
          SSE-friendly compound components. Defaults are static, but each
          prop can be driven live from a monitoring / k8s / CI event stream.
        -->
        <VPod
          name="checkout-7d9c"
          namespace="prod"
          phase="Running"
          :containers="[
            { name: 'app',     ready: true,  restarts: 0, state: 'running' },
            { name: 'sidecar', ready: true,  restarts: 2, state: 'running' },
            { name: 'metrics', ready: false, restarts: 5, state: 'waiting' },
          ]"
        />
        <VService
          service-name="checkout-api"
          :rps="180"
          :p99-ms="140"
          :replicas="3"
          :desired-replicas="4"
          status="degraded"
        />
        <VPipeline
          repo="acme/checkout"
          branch="main"
          :percent="72"
          :stages="[
            { name: 'lint',   status: 'success', durationS: 11 },
            { name: 'build',  status: 'success', durationS: 96 },
            { name: 'test',   status: 'running', durationS: 55 },
            { name: 'deploy', status: 'pending', durationS: 0 },
          ]"
        />
      </row>
    </layer>
  </vuetrex>
</template>

<script lang="ts">
import { Vuetrex } from '@/lib-components/index.js'
import VColumns from './things/VColumns.vue'
import VNode from './things/VNode.vue'
import VPod from './things/VPod.vue'
import VService from './things/VService.vue'
import VPipeline from './things/VPipeline.vue'

export default {
  components: { Vuetrex, VColumns, VNode, VPod, VService, VPipeline },
}
</script>

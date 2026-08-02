<template>
  <vuetrex height="79vh" width="100%">
    <layer :gap="1">
      <row align-x="start" :gap="0.4">
        <box text="align: start" size="1.2" />
        <box text="row" size="0.8" />
        <box text="+X slots" size="1" />
      </row>

      <ring start-angle="45" direction="reverse" :gap="0.35">
        <wedge
          v-for="item in 4"
          :key="item"
          :text="String(item)"
          size="0.8"
          height="0.35"
        />
      </ring>

      <group layout="depth" :gap="0.35">
        <cylinder text="group" size="0.7" height="0.3" />
        <cylinder text="layout=depth" size="0.7" height="0.3" />
      </group>

      <!-- Concept previews: concepts/stacked1.png and concepts/stacked2.png -->
      <row :gap="1.4">
        <Stacked1 />
        <Stacked2 />
      </row>
    </layer>
  </vuetrex>
</template>

<script lang="ts">
import { Vuetrex } from '@/lib-components/index.js'
import Stacked1 from './Stacked1.vue'
import Stacked2 from './Stacked2.vue'

export default {
  components: { Vuetrex, Stacked1, Stacked2 },
}
</script>

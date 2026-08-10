<!--
  Vuetrex adaptation of concepts/stacked1.png:
  a labeled "databases" pedestal with a 3x3 grid of columns of varying heights.
  Used as a Vue subcomponent inside a <vuetrex> slot.
-->
<template>
  <stack :gap="0">
    <box
      text="databases"
      :size="2.4"
      :height="0.4"
      :material="{ color: 0x1e1e1e, roughness: 0.55, metalness: 0.05 }"
      :hover="{ color: 0x2f7a3a, transition: 0.2 }"
    />
    <group layout="grid" :gap="0.15">
      <box
        v-for="(h, i) in columnHeights"
        :key="i"
        :size="0.42"
        :height="h"
        :material="{ color: 0x333333, roughness: 0.5, metalness: 0.08 }"
        :hover="{ color: 0x4c7fb2, transition: 0.18, scale: 1.05 }"
      />
    </group>
  </stack>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'Stacked1',
  props: {
    // Column heights of the 3x3 grid, top-down from the reference image.
    heights: {
      type: Array as () => number[],
      default: () => [0.6, 1.4, 0.9, 1.0, 2.2, 1.2, 1.6, 1.7, 1.0],
    },
  },
  computed: {
    columnHeights(): number[] {
      return this.heights
    },
  },
})
</script>

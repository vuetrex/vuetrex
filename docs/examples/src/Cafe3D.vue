<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ width?: number; depth?: number }>(), { width: 2, depth: 1.4 })
</script>

<template>
  <vx-stack v-bind="$attrs" :gap="0.02">
    <vx-box :size="props.width" :depth="props.depth" :height="0.85"
            :lines="['CAFE']" :material="{ color: '#a66c46' }" />
    <vx-box :size="props.width + 0.12" :depth="props.depth + 0.12" :height="0.12"
            :material="{ color: '#314955' }" />
    <vx-port name="mainDoor" :position="[0, 0.15, props.depth / 2]" :normal="[0, 0, 1]" />
    <vx-port name="backDoor" :position="[0, 0.15, -props.depth / 2]" :normal="[0, 0, -1]" />
    <vx-port name="sewer" :position="[-props.width / 3, 0.05, -props.depth / 2]" :normal="[0, 0, -1]" />
    <vx-port name="waterMain" :position="[props.width / 3, 0.15, -props.depth / 2]" :normal="[0, 0, -1]" />
    <vx-port name="electrical" :position="[-props.width / 2, 0.4, 0]" :normal="[-1, 0, 0]" />
    <vx-port name="internet" :position="[props.width / 2, 0.4, 0]" :normal="[1, 0, 0]" />
    <slot name="ports" />
    <slot name="connections" />
  </vx-stack>
</template>

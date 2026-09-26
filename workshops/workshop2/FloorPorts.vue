<template>
  <vx-port name="left" :position="[-width / 2 - 0.09, 0.045, 0]" :normal="[-1, 0, 0]" />
  <vx-port name="right" :position="[width / 2 + 0.09, 0.045, 0]" :normal="[1, 0, 0]" />
  <vx-port name="front" :position="[0, 0.045, depth / 2 + 0.09]" :normal="[0, 0, 1]" />
  <vx-port name="back" :position="[0, 0.045, -depth / 2 - 0.09]" :normal="[0, 0, -1]" />
</template>

<script setup lang="ts">
defineProps<{ width: number; depth: number }>()
</script>

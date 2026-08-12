<template>
  <panel
      :size="width"
      :depth="depth"
      :height="0.08"
      label-region="south"
      :lines="[title]"
      :label-share="0.2"
      :label-font-size="0.23"
      :label-color="0xffffff"
      :material="{ color: 0x172330, roughness: 0.56, metalness: 0.28, transparent: true, opacity: 0.82 }"
  >
  <stack :gap="0.08">
<!--    <box-->
<!--      :size="width"-->
<!--      :depth="depth"-->
<!--      :height="0.08"-->

<!--      label-face="top"-->
<!--      :label-font-size="0.23"-->
<!--      :label-color="0xf5f8fb"-->
<!--      :material="{ color: 0x172330, roughness: 0.56, metalness: 0.28, transparent: true, opacity: 0.82 }"-->
<!--    />-->
    <group layout="depth" :gap="0.35">
      <slot />
    </group>
  </stack>
  </panel>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  width?: number
  depth?: number
}>(), {
  width: 4.8,
  depth: 5,
})
</script>

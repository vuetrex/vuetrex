<!--
  Vuetrex adaptation of concepts/stacked2.png:
  three thin, colored panels stacked vertically (green header, dark body, blue footer).

  Text-on-top is intentionally NOT wired here yet. The default `text` prop in
  Vuetrex is rendered as a floor caption underneath the mesh, which does not
  match the concept. We plan to add labels on the top face separately, most
  likely via one of:
    - troika-three-text (SDF text meshes, crisp at any zoom, easy to tint)
    - a CanvasTexture painted per box and applied as the top-face material
    - an HTML overlay via CSS2DRenderer for pure UI-style labels
  Left for a follow-up so we can decide together.
-->
<template>
  <stack :gap="0.02">
    <!-- footer -->
    <box
      :size="1.8"
      :depth="0.2"
      :height="0.5"
      :material="{ color: 0x2a5cb2, roughness: 0.45, metalness: 0.05 }"
      :hover="{ color: 0x3d7ce0, transition: 0.2 }"
    />

    <!-- body -->
    <box
      :size="1.8"
      :height="2.0"
      :depth="0.2"
      :material="{ color: 0x232323, roughness: 0.55, metalness: 0.05 }"
      :hover="{ color: 0x4c7fb2, transition: 0.18 }"
    />

    <!-- header -->
    <box
      :size="1.8"
      :depth="0.2"
      :height="0.5"
      :material="{ color: 0x2f7a3a, roughness: 0.45, metalness: 0.05 }"
      :hover="{ color: 0x49a457, transition: 0.2 }"
    />
  </stack>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'Stacked2',
})
</script>


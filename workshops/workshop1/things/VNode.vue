<!--
  Vuetrex adaptation of 3-bar 3D display (header, body, footer)::
  designed to look like a Blender-style node graph card.

  The middle slab renders its labels as SDF text on the +Z face via the shared
  `lines` prop on <vx-box>. See MeshNode's label watchEffect for the mechanism —
  it lazily creates a troika-three-text Text parented to the box mesh, so it
  inherits transforms (including hover scale) and disposes with the mesh.
-->
<template>
  <vx-stack v-bind="$attrs" :gap="0.02">
    <!-- footer -->
    <vx-box
      :size="1.8"
      :depth="0.2"
      :height="0.5"
      :lines="footerLines"
      :label-align="'left'"
      :label-color="0xffffff"
      :label-font-size="0.15"
      :label-padding="0.12"
      :material="{ color: 0x2a5cb2, roughness: 0.45, metalness: 0.05 }"
      :hover="{ color: 0x3d7ce0, transition: 0.2 }"
    />

    <!-- body -->
    <vx-box
      :size="1.8"
      :height="2.0"
      :depth="0.2"
      :lines="bodyLines"
      :label-color="0xd8d8d8"
      :label-align="'left'"
      :label-padding="0.1"
      :label-line-height="1.35"
      :material="{ color: 0x232323, roughness: 0.55, metalness: 0.05 }"
      :hover="{ color: 0x4c7fb2, transition: 0.18 }"
    />

    <!-- header -->
    <vx-box
      :size="1.8"
      :depth="0.2"
      :height="0.5"
      :lines="headerLines"
      :label-color="0xffffff"
      :label-font-size="0.22"

      :material="{ color: 0x2f7a3a, roughness: 0.45, metalness: 0.05 }"
      :hover="{ color: 0x49a457, transition: 0.2 }"
    />
    <vx-port name="input" face="left" />
    <vx-port name="output" face="right" />
    <slot name="ports" />
    <slot name="connections" />
  </vx-stack>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'VNode',
  inheritAttrs: false,
  props: {
    // Header label (top slab). Single line of text.
    header: {
      type: String,
      default: 'Set Position',
    },
    // Body label (middle slab). Split on "\n" so callers can pass a single
    // multi-line string and get one line per newline on the +Z face.
    body: {
      type: String,
      default:
        'Data',
    },
    // Footer label (bottom slab). Single line of text.
    footer: {
      type: String,
      default: 'Loading: 0%',
    },
  },
  computed: {
    headerLines(): string[] {
      return [this.header]
    },
    bodyLines(): string[] {
      return this.body.split('\n')
    },
    footerLines(): string[] {
      return [this.footer]
    },
  },
})
</script>

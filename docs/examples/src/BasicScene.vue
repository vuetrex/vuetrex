<script setup lang="ts">
import { Vuetrex } from '@exceeder/vuetrex'

const settings = {
  backgroundColor: 0x101719,
  floorColor: 0x223035,
}
</script>

<template>
  <Vuetrex height="300px" :settings="settings">
    <vx-box
      id="gateway"
      text="gateway"
      :size="1.2"
      :height="0.45"
      :material="{ color: 0x2f91b8, roughness: 0.42 }"
    />
  </Vuetrex>
</template>

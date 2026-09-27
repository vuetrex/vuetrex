<template>
  <vx-group fit="none">
    <vx-box :size="0.78" :height="0.62" :depth="0.05" :material="shell" />
    <vx-group :placement="at(0, 0.045, 0.031)">
      <vx-box :size="0.68" :height="0.53" :depth="0.012" :material="screen" />
    </vx-group>
    <vx-group v-for="(width, index) in [0.46, 0.32, 0.41, 0.24]" :key="index"
      :placement="at(-0.27 + width / 2, 0.43 - index * 0.09, 0.043)">
      <vx-box :size="width" :height="0.022" :depth="0.008" :material="index === 0 ? heading : trace" />
    </vx-group>
  </vx-group>
</template>

<script setup lang="ts">
import { Quaternion, Vector3 } from 'three'
const at = (x: number, y: number, z: number) => ({ position: new Vector3(x, y, z), orientation: new Quaternion(), scale: new Vector3(1, 1, 1) })
const shell = { color: 0xaeb8c4, roughness: 0.34, metalness: 0.48 }
const screen = { color: 0x102d43, roughness: 0.5, metalness: 0.05 }
const heading = { color: 0x75e2ff, emissive: 0x259ec2, emissiveIntensity: 0.35, roughness: 0.6 }
const trace = { color: 0x3895b5, emissive: 0x176680, emissiveIntensity: 0.2, roughness: 0.6 }
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { CanvasTexture, DoubleSide, SRGBColorSpace } from 'three'
import { Vuetrex } from '@exceeder/vuetrex'

const modes = ['opaque', 'blend', 'mask'] as const
const opacity = ref(0.8)
const cutoff = ref(0.5)
const textured = ref(true)
const texture = shallowRef<CanvasTexture | null>(null)

onMounted(() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  // Each repeated band runs from transparent to opaque.
  for (let x = 0; x < 128; x++) {
    context.fillStyle = `rgba(130, 210, 235, ${(x % 32) / 31})`
    context.fillRect(x, 0, 1, 128)
  }
  const created = new CanvasTexture(canvas)
  created.colorSpace = SRGBColorSpace
  texture.value = created
})

// This example owns the texture; clear-map and mode changes never dispose it.
onUnmounted(() => texture.value?.dispose())
</script>

<template>
  <div>
    <div class="controls">
      <label>Opacity {{ opacity.toFixed(2) }}
        <input v-model.number="opacity" type="range" min="0.1" max="1" step="0.05" />
      </label>
      <label>Mask cutoff {{ cutoff.toFixed(2) }}
        <input v-model.number="cutoff" type="range" min="0.1" max="0.9" step="0.05" />
      </label>
      <label><input v-model="textured" type="checkbox" /> Stripe texture</label>
    </div>
    <Vuetrex height="300px" :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }">
      <vx-row :gap="0.5">
        <vx-box v-for="mode in modes" :key="mode" :text="mode" :height="0.6"
          :material="{ color: 0xffffff, roughness: 0.65, alphaMode: mode, opacity, alphaTest: cutoff,
            map: textured ? texture : null, side: DoubleSide }" />
      </vx-row>
    </Vuetrex>
    <p class="caption">One texture, three alpha policies: opaque ignores alpha, blend fades smoothly, and mask cuts holes at the threshold. Clear the texture to compare opacity alone.</p>
  </div>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; padding: 0.8rem; background: #182225; color: #e8f0f2; font-size: 0.85rem; }
label { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
input[type='range'] { width: 90px; }
.caption { margin: 0; padding: 0.7rem 0.8rem; background: #182225; color: #c6d7dc; font-size: 0.85rem; line-height: 1.5; }
</style>

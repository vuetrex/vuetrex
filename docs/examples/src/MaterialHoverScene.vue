<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, type VxHoverProps } from '@exceeder/vuetrex'

const surface = Object.freeze({ color: 0x368fbd, roughness: 0.6 })
const enabled = ref(true)
const duration = ref(0.5)
const hovered = ref('none')
// Both objects receive the same descriptor; each animates its own material.
const hover = computed<VxHoverProps | undefined>(() => enabled.value ? {
  color: 0x8bdcf5,
  emissive: 0x2573a0,
  emissiveIntensity: 0.5,
  roughness: 0.25,
  scale: 1.08,
  transition: duration.value,
} : undefined)
</script>

<template>
  <div>
    <div class="controls">
      <label><input v-model="enabled" type="checkbox" /> Hover feedback</label>
      <label>Transition
        <select v-model.number="duration">
          <option :value="0">Immediate</option>
          <option :value="0.18">0.18 seconds</option>
          <option :value="0.5">0.5 seconds</option>
          <option :value="1.5">1.5 seconds</option>
        </select>
      </label>
    </div>
    <Vuetrex height="300px" :settings="{ backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }">
      <vx-row :gap="0.75">
        <vx-box text="box" :material="surface" :hover="hover"
          @pointerenter="hovered = 'box'" @pointerleave="hovered = 'none'" />
        <vx-panel :lines="['panel']" :size="1.3" :depth="1" :height="0.25" :material="surface" :hover="hover"
          @pointerenter="hovered = 'panel'" @pointerleave="hovered = 'none'" />
      </vx-row>
    </Vuetrex>
    <p class="caption" aria-live="polite">Pointer over: {{ hovered }}. Move between the objects before a transition finishes: only the hovered object highlights, and the other returns to its base style.</p>
  </div>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; padding: 0.8rem; background: #182225; color: #e8f0f2; font-size: 0.85rem; }
label { display: flex; align-items: center; gap: 0.4rem; }
select { padding: 0.3rem; border: 1px solid #597580; border-radius: 4px; background: #26383d; color: #e8f0f2; }
.caption { margin: 0; padding: 0.7rem 0.8rem; background: #182225; color: #c6d7dc; font-size: 0.85rem; line-height: 1.5; }
</style>

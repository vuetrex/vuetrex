<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, type VxMaterialProps } from '@exceeder/vuetrex'

const surface = Object.freeze({ color: 0x368fbd, roughness: 0.65, metalness: 0.1 })
const attention = Object.freeze({ color: 0xe89c48, emissive: 0x402000, emissiveIntensity: 0.3 })
const appearance = ref<'surface' | 'attention' | 'default'>('surface')
const wireframe = ref(false)
const material = computed<VxMaterialProps | undefined>(() => {
  if (appearance.value === 'default') return undefined
  return {
    ...surface,
    ...(appearance.value === 'attention' ? attention : {}),
    ...(wireframe.value ? { wireframe: true } : {}),
  }
})
</script>

<template>
  <div>
    <div class="controls">
      <label>Edited material
        <select v-model="appearance">
          <option value="surface">Shared surface</option>
          <option value="attention">Attention override</option>
          <option value="default">Stage defaults (undefined)</option>
        </select>
      </label>
      <label><input v-model="wireframe" type="checkbox" :disabled="appearance === 'default'" /> Wireframe override</label>
    </div>
    <Vuetrex height="300px" :settings="{ color: 0x8995a3, backgroundColor: 0x101719, floorColor: 0x223035, floorMirror: false, shadows: false }">
      <vx-row :gap="0.5">
        <vx-box text="edited" :material="material" />
        <vx-box text="shared surface" :material="surface" />
        <vx-box text="stage defaults" />
      </vx-row>
    </Vuetrex>
    <p class="caption">Only the left box changes. Removing an override restores its default; choosing stage defaults removes the entire material binding.</p>
  </div>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; padding: 0.8rem; background: #182225; color: #e8f0f2; font-size: 0.85rem; }
label { display: flex; align-items: center; gap: 0.4rem; }
select { padding: 0.3rem; border: 1px solid #597580; border-radius: 4px; background: #26383d; color: #e8f0f2; }
.caption { margin: 0; padding: 0.7rem 0.8rem; background: #182225; color: #c6d7dc; font-size: 0.85rem; line-height: 1.5; }
</style>

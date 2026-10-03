<template>
  <section class="scene-shell">
    <Vuetrex height="100%" width="100%" :settings="settings" :elements="elements" :camera="cameraView">
<!--      <vx-composer preset="editorial" quality="high"-->
<!--                   :max-pixel-ratio="2"-->
<!--                   :output="{ exposure: 1.0 }"-->
<!--                   :grading="{ contrast: 1.1, saturation: 1 }"-->
<!--      />-->
      <!--                   :ambient-occlusion="{ intensity: 0.48, radius: 0.3 }"-->
<!--      :protect-annotations="true"-->
<!--      :grading="{ contrast: 1.025, saturation: 1 }"-->
      <!--     :bloom="{ mode: 'selected', strength: 0.18, radius: 0.24, threshold: 0 }" -->
      <!--    :output="{ exposure: 1.0 }"-->
      <!--    :vignette="{ strength: 0.06, offset: 0.96 }" -->

      <vx-lighting :key-intensity="1.05" :fill-intensity="0.72" shadow-quality="high" />
      <vx-environment preset="studio" :intensity="0.5" :rotation="0.65" />
      <vx-floor finish="matte" :color="0xf2f4f5" :reflection="0.1" :grid="false" :captions="false" :fade-start="12" :fade-end="20" />
      <FoundationScene :deployments="deployments" :relations="relations" :current-time="currentTime" />
    </Vuetrex>

    <div v-if="error" class="error-banner">
      <span>Live data unavailable — running in display mode.</span>
      <button type="button" @click="emit('reconnect')">Reconnect</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import {ComposerDiagnostics, Vuetrex, type VxCameraView, type VxSettings} from '@/lib-components/index.js'
import { workshopElements } from '../../../workshops/workshop2/elements.config.js'
import { Plinth } from '../../../workshops/workshop2/things/Plinth.js'
import FoundationScene from './scene/FoundationScene.vue'
import type { ConnectionStatus, DeploymentViewModel, RelationViewModel } from '../types.js'

defineProps<{ deployments: DeploymentViewModel[]; relations: RelationViewModel[]; currentTime: number; connection: ConnectionStatus; error: string }>()
const emit = defineEmits<{ reconnect: [] }>()
const elements = workshopElements.defineElements({ 'vx-workshop-plinth': Plinth })
const cameraView: VxCameraView = { orbit: { target: [0, 1.1, -0.55], height: 8.8, radius: 14, azimuth: 18 } }
const settings: VxSettings = { backgroundColor:0xf7f7f8,floorColor:0xf2f4f5,captionColor:0x87939b,lightColor1:0xffffff,lightColor2:0xdceaff,mirrorOpacity:.94,floorGrid:false,floorMirror:false,floorCaptions:false,shadows:true,gap:.22 }
const onComposerStatus = function (status: ComposerDiagnostics) {
  console.log(status)
}
</script>

<style scoped>
.scene-shell{position:absolute;inset:0;overflow:hidden}.scene-shell :deep(canvas){display:block;cursor:grab}.scene-shell :deep(canvas:active){cursor:grabbing}
.error-banner{position:absolute;z-index:5;top:112px;left:50%;display:flex;gap:12px;align-items:center;padding:9px 12px;border:1px solid rgba(142,158,167,.28);border-radius:10px;color:#7a5d37;background:rgba(255,255,255,.86);box-shadow:0 16px 45px rgba(50,68,79,.12);backdrop-filter:blur(16px);font-size:11px;transform:translateX(-50%)}.error-banner button{border:0;border-radius:6px;padding:6px 9px;color:white;background:#168bdf;cursor:pointer}
</style>

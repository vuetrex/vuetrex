<template>
  <vx-group :id="props.id" :placement="at(0, platformTop, -3.35)" fit="none" >
    <vx-group v-for="x in [-2.15, 2.15]" :key="x" :placement="at(x, 0, 0)">
      <vx-box :size="0.7" :depth="0.5" :height="0.07" :material="frame" />
      <vx-group :placement="at(0, 0.07, -0.07)">
        <vx-box :size="0.09" :depth="0.12" :height="0.65" :material="frame" />
      </vx-group>
    </vx-group>
    <vx-group :placement="at(0, 1.38, 0)" fit="none">
      <vx-display-wall id="operations-wall" shape="flat" :width="5.8" :height="1.65" @click="emit('toggle-view')"
        :thickness="0.09" :bezel="0.055" :frame-color="0x263541"
        :texture-width="2560" :texture-height="768" :surface="surface"
        :screen-style="{ brightness: 0.95, effects: { bloom: 'exclude' } }" />
    </vx-group>
  </vx-group>
</template>

<script setup lang="ts">
import { Quaternion, Vector3 } from 'three'
import type { VxDisplaySurface } from '@/lib-components'

const props = defineProps<{
  id?: string
  platformTop: number
}>()

const emit = defineEmits<{
  'toggle-view': []
}>()

const at = (x: number, y: number, z: number) => ({ position: new Vector3(x, y, z), orientation: new Quaternion(), scale: new Vector3(1, 1, 1) })
const frame = { color: 0x344652, roughness: 0.32, metalness: 0.75 }
// Static illustrative telemetry: deterministic content stays identical in both comparison modes.
const surface: VxDisplaySurface = {
  background: '#0c1b28',
  paint: ({ context: ctx, width, height }) => {
    ctx.scale(width / 2560, height / 768)
    const wash = ctx.createLinearGradient(0, 0, 2560, 768)
    wash.addColorStop(0, '#152c3e'); wash.addColorStop(1, '#08151f')
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 2560, 768)
    ctx.fillStyle = '#79d4eb'; ctx.font = '500 28px sans-serif'
    ctx.fillText('DATA FLOOR   /   OPERATIONS', 85, 85)
    ctx.fillStyle = '#71dab8'; ctx.fillText('●  ALL SYSTEMS NOMINAL', 2000, 85)
    const metrics = [['24.8', 'GB / S THROUGHPUT'], ['99.98', '% AVAILABILITY'], ['12', 'ACTIVE NODES']]
    metrics.forEach(([value, label], i) => {
      const x = 90 + i * 820
      ctx.fillStyle = '#e1eff5'; ctx.font = '500 100px sans-serif'; ctx.fillText(value, x, 230)
      ctx.fillStyle = '#7899ac'; ctx.font = '24px sans-serif'; ctx.fillText(label, x + 3, 277)
    })
    ctx.strokeStyle = '#243d4d'; ctx.lineWidth = 2
    for (let y = 365; y <= 660; y += 74) {
      ctx.beginPath(); ctx.moveTo(85, y); ctx.lineTo(2475, y); ctx.stroke()
    }
    for (const [index, color] of ['#47b9e0', '#68d2b6'].entries()) {
      ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath()
      for (let i = 0; i <= 100; i++) {
        const x = 85 + i * 23.9
        const y = 535 + index * 65 - Math.sin(i * 0.17 + index) * 44 - Math.sin(i * 0.43) * 18 - i * 0.8
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.fillStyle = '#7899ac'; ctx.font = '22px sans-serif'
    ctx.fillText('INGEST / REPLICATION', 85, 724); ctx.fillText('ILLUSTRATIVE TELEMETRY  ·  LAST 24 HOURS', 1870, 724)
  },
}
</script>

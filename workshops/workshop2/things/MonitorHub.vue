<template>
  <vx-group id="hub" :placement="at(-0.35, platformTop, 1.45)" fit="none" @click="emit('toggle')">
    <vx-box :size="0.96" :depth="0.82" :height="0.12" :material="base" />
    <vx-group :placement="at(0, 0.145, 0)">
      <vx-box :size="0.78" :depth="0.68" :height="0.12" :material="metal" />
    </vx-group>
    <vx-group :placement="at(0, 0.265, -0.34)">
      <vx-box :size="0.11" :depth="0.12" :height="0.155 + pose.lift" :material="metal" />
    </vx-group>
    <!-- The nested group origins are physical hinge locations, not mesh centers. -->
    <vx-group :placement="rearHinge" fit="none">
      <MonitorPanel />
      <vx-group :placement="leftHinge" fit="none">
        <vx-group :placement="at(-0.39, 0, 0)" fit="none"><MonitorPanel /></vx-group>
      </vx-group>
      <vx-group :placement="rightHinge" fit="none">
        <vx-group :placement="at(0.39, 0, 0)" fit="none"><MonitorPanel /></vx-group>
      </vx-group>
    </vx-group>
    <FloorPorts :width="0.96" :depth="0.82" />
  </vx-group>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { Quaternion, Vector3 } from 'three'
import gsap from 'gsap'
import FloorPorts from './FloorPorts.vue'
import MonitorPanel from './MonitorPanel.vue'

const props = defineProps<{ platformTop: number; open: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const pose = reactive({ lift: 0, rear: Math.PI / 2, left: Math.PI, right: -Math.PI })
const xAxis = new Vector3(1, 0, 0), yAxis = new Vector3(0, 1, 0)
const at = (x: number, y: number, z: number, axis = xAxis, angle = 0) => ({
  position: new Vector3(x, y, z), orientation: new Quaternion().setFromAxisAngle(axis, angle), scale: new Vector3(1, 1, 1),
})
const rearHinge = computed(() => at(0, 0.42 + pose.lift, -0.34, xAxis, pose.rear))
const leftHinge = computed(() => at(-0.39, 0, 0.065, yAxis, pose.left))
const rightHinge = computed(() => at(0.39, 0, 0.13, yAxis, pose.right))
const base = { color: 0x9da4ac, roughness: 0.54, metalness: 0.24 }
const metal = { color: 0xaeb8c4, roughness: 0.34, metalness: 0.48 }
let timeline: gsap.core.Timeline | undefined
onMounted(() => {
  // One reversible timeline also handles rapid clicks without competing tweens.
  timeline = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } })
    .to(pose, { lift: 0.24, duration: 0.35 })
    .to(pose, { rear: 0, duration: 0.75 })
    .to(pose, { right: -0.12, duration: 0.65 })
    .to(pose, { left: 0.12, duration: 0.65 })
  timeline.timeScale(2)
  if (props.open) timeline.play()
})
watch(() => props.open, open => { if (open) timeline?.play(); else timeline?.reverse() })
onBeforeUnmount(() => { timeline?.kill(); timeline = undefined })
</script>

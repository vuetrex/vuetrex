<template>
  <h1>Workshop 1</h1>
  <section>
    <vuetrex
      height="79vh"
      width="100%"
      :settings="settings"
    >
      <vx-layer elevation="0.1">
        <vx-row>
          <VNode :body="text"/>
          <VNode :body="text"/>
        </vx-row>
        <vx-row :gap="1.4">
          <VColumns/>
        </vx-row>
      </vx-layer>
    </vuetrex>
  </section>
</template>

<script setup lang="ts">
import {Vuetrex, type VuetrexStage, type VxSettings} from '@/lib-components/index.js'
import VColumns from './things/VColumns.vue'
import VNode from './things/VNode.vue'
import {onBeforeUnmount, reactive} from 'vue';
import {MathUtils} from 'three'

const settings: VxSettings = {
  fog: {
    color: 0x85898d,
    near: 10,
    far: 23,
  }
}

let stopCameraOrbit: (() => void) | undefined
let orbitSetupTimer: ReturnType<typeof window.setTimeout> | undefined

function startCameraOrbit(stage: VuetrexStage) {
  // Let the initial bounds-driven camera fit settle before preserving its
  // radius and height. The orbit then looks at the authored world origin.
  orbitSetupTimer = window.setTimeout(() => {
    const radius = Math.hypot(stage.cameraBase.x, stage.cameraBase.z)
    const height = stage.cameraBase.y
    const initialHeading = Math.atan2(stage.cameraBase.x, stage.cameraBase.z)
    let startedAt: number | undefined

    stage.cameraTarget.set(0, 0, 0)
    stopCameraOrbit = stage.onEachFrame(time => {
      startedAt ??= time
      const seconds = (time - startedAt) / 1000
      // asin(sin()) is a triangle wave. This ranges from -30° to +30°
      // with a constant slope of one degree per second between turnarounds.
      const offsetDegrees = Math.asin(Math.sin(seconds * Math.PI / 60)) * 60 / Math.PI
      const heading = initialHeading + MathUtils.degToRad(offsetDegrees)
      stage.cameraBase.set(
        radius * Math.sin(heading),
        height,
        radius * Math.cos(heading),
      )
      stage.cameraTarget.set(0, 0, 0)
    })
  }, 750)
}

onBeforeUnmount(() => {
  if (orbitSetupTimer !== undefined) window.clearTimeout(orbitSetupTimer)
  stopCameraOrbit?.()
})

const text = reactive(
    `  Geometry
  Selection
  Position
    X
    Y
    Z
  Offset
    X
    Y
    Z` as String)

</script>

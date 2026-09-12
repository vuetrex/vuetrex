<template>
  <vuetrex :camera="camera" >
    <vx-layer @click="click3d">
      <vx-row>
        <vx-stack >
          <vx-box size="1.3" height="0.25" name="s1" text="stack 1"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s2"  text="stack 2"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s3"  text="stack 2"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s4"  text="stack 2"/>
          <vx-box size="0.5"/>
        </vx-stack>
      </vx-row>
      <vx-row>
        <vx-layer :elevation="0.05" visible="false" size="5.5">
          <vx-ring>
            <vx-box text="a1" />
            <vx-box text="a2" />
            <vx-box text="a3" />
          </vx-ring>
        </vx-layer>
      </vx-row>
      <vx-row>
        <vx-stack >
          <vx-box size="1.3" height="0.25" name="t1" text="Empty Spot" connection="s1"/>

        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t2"  text="Small Deploy"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t3"  text="Complex set"/>
          <vx-box size="0.5" height="0.2"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.1"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t4"  text="Lebowsky" connection="s4"/>
          <vx-box size="0.5"/>
        </vx-stack>
      </vx-row>
    </vx-layer>
  </vuetrex>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue';
import {Vuetrex, VxSettings} from '@/lib-components/index.js';

export default defineComponent({
  components: {
    Vuetrex
  },
  props: {
    items: {
      type: Array,
      default: () => ([])
    }
  },
  setup() {
    const camera = ref("scene")
    const settings: VxSettings = {
        particleVolume: 5
    }

    function click3d(ev:any) {
      if (ev.vxNode) {
        camera.value === ev.vxNode.name ? camera.value = "scene" : camera.value = ev.vxNode.name;
      } else {
        camera.value = "scene"
      }
    }

    return {
      camera,
      settings,
      click3d
    }
  }
})
</script>

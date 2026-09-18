<template>
  <vuetrex :camera="camera" >
    <vx-layer @click="click3d">
      <vx-row>
        <vx-stack >
          <vx-box size="1.3" height="0.25" name="s1" id="s1" text="stack 1"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
          <vx-box size="0.5" height="0.25"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s2" id="s2"  text="stack 2"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s3" id="s3"  text="stack 2"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="s4" id="s4"  text="stack 2"/>
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
    <vx-connectors :graph="connections" />
      </vx-row>
      <vx-row>
        <vx-stack >
          <vx-box size="1.3" height="0.25" name="t1" id="t1" text="Empty Spot"/>

        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t2" id="t2"  text="Small Deploy"/>
          <vx-box size="0.5"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t3" id="t3"  text="Complex set"/>
          <vx-box size="0.5" height="0.2"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.3"/>
          <vx-box size="0.5" height="0.1"/>
        </vx-stack>
        <vx-stack >
          <vx-box size="1.5" height="0.25" name="t4" id="t4"  text="Lebowsky"/>
          <vx-box size="0.5"/>
        </vx-stack>
      </vx-row>
    </vx-layer>
  </vuetrex>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue';
import {Vuetrex, connectors, particles} from '@/lib-components/index.js';

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
    const connections = connectors.edges([
      { from: 't1', to: 's1' }, { from: 't4', to: 's4' },
    ], { keyBy: ({ item }) => item.from, from: ({ item }) => item.from, to: ({ item }) => item.to })
      .stroke({ opacity: 0, markerEnd: false })
      .flow(route => particles.path(route.points, { count: Math.max(1, Math.round(route.totalLength * 10)) })
        .appearance({ color: 0xa0ffff, size: 0.11 * route.scale })
        .motion({ speed: 0.5 * route.scale }))

    function click3d(ev:any) {
      if (ev.vxNode) {
        camera.value === ev.vxNode.id ? camera.value = "scene" : camera.value = ev.vxNode.id;
      } else {
        camera.value = "scene"
      }
    }

    return {
      camera,
      connections,
      click3d
    }
  }
})
</script>

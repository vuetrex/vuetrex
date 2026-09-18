<template>
  <vuetrex :camera="camera" height="75vh">
    <vx-layer>
      <vx-row>
        <vx-box v-for="(el,i) in items" :key="i" :name="'a'+i" :id="'a'+i" :text="'dynamic '+el" @click="dBoxClick"/>
      </vx-row>
      <vx-row>
        <vx-box name="b1" id="b1" text="I'm lost" @click="dBoxClick"/>
        <vx-box name="b2" id="b2" text="busy bee" @click="dBoxClick"/>
        <vx-box name="b3" id="b3" @click="dBoxClick" />
        <vx-box name="b4" id="b4" @click="dBoxClick" text="bot"/>
      </vx-row>
      <vx-row>
        <vx-box name="c1" id="c1" />
        <vx-cylinder name="c2" id="c2" :text="'clicks: ' + counter" @click="cylinderClick"/>
        <vx-cylinder name="c3" id="c3" text="new" />
      </vx-row>
      <vx-row>
        <vx-box name="d1" id="d1" size="1.2" @click="dBoxClick" />
      </vx-row>
      <vx-row v-if="extraRow">
        <vx-box name="e1" id="e1" size="1"/>
      </vx-row>
    </vx-layer>
    <vx-connectors :graph="graph" />
  </vuetrex>
</template>

<script lang="ts">
import {computed, ref} from 'vue';
import {Vuetrex} from '@/lib-components/index.js';
import {tabAConnectors} from '../connectors/tabA.js';

export default {
  components: {
    Vuetrex
  },
  props: {
    items: {
      type: Array,
      default: () => ([])
    },
    extraRow: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const counter = ref(0);
    const camera = ref("scene"); //initially point camera to the overview
    const graph = computed(() => tabAConnectors(props.items.length, props.extraRow));

    function cylinderClick(ev:any) {
      counter.value++;
    }

    function dBoxClick(ev:any) {
      console.log("Clicked: ",ev.vxNode.id)
      camera.value === ev.vxNode.id ? camera.value = "scene" : camera.value = ev.vxNode.id;
    }

    return {
      camera,
      counter,
      graph,
      cylinderClick,
      dBoxClick
    }
  }
}
</script>

<template>
  <vuetrex>
    <vx-layer>
      <vx-row>
        <vx-box name="b1" text="I'm b1"/>
        <vx-box name="b2" text="I'm b1" />
        <vx-box name="b3" />
        <vx-box name="b4" />
      </vx-row>
    </vx-layer>
  </vuetrex>
</template>

<script lang="ts">
import {defineComponent, ref} from 'vue';
import {Vuetrex} from '@/lib-components';

export default defineComponent({
  components: {
    Vuetrex
  },
  props: {
  },
  setup() {
    const counter = ref(0);
    return {
      counter
    }
  }
})
</script>

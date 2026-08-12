<template>
  <div class="hello">
    <div>{{msg}}</div>
    <Vuetrex>
      <vx-layer>
        <vx-row>
          <vx-box name="a1"/>
        </vx-row>
        <vx-row>
          <vx-box name="b1" size="2"/>
          <vx-box name="b2"/>
        </vx-row>
        <vx-row>
          <vx-box name="c1"/>
          <vx-cylinder name="c2"/>
        </vx-row>
        <vx-row>
          <vx-box name="d1" size="4"/>
        </vx-row>
        <vx-panel name="panel-1" size="2" depth="1" :lines="['Panel']" label-region="south">
          <vx-stack>
            <vx-box size="0.4" height="0.15"/>
          </vx-stack>
        </vx-panel>
      </vx-layer>
    </Vuetrex>
  </div>
</template>

<script>
import { Vuetrex } from '@exceeder/vuetrex';
import { getCurrentInstance } from 'vue';
export default {
  components: {
    Vuetrex
  },
  name: 'HelloWorld',
  props: {
    msg: String
  },
  setup() {
    console.log("Current Instance:",getCurrentInstance())
    console.log("Vuetrex loaded:",Vuetrex)
  }
}
</script>

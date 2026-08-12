<template>
  <div class="hello">
    <div>{{msg}}</div>
    <Vuetrex>
      <layer>
        <row>
          <box name="a1"/>
        </row>
        <row>
          <box name="b1" size="2"/>
          <box name="b2"/>
        </row>
        <row>
          <box name="c1"/>
          <cylinder name="c2"/>
        </row>
        <row>
          <box name="d1" size="4"/>
        </row>
        <panel name="panel-1" size="2" depth="1" :lines="['Panel']" label-region="south">
          <stack>
            <box size="0.4" height="0.15"/>
          </stack>
        </panel>
      </layer>
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

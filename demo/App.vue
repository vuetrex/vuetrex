<template>
  <img alt="Vue logo" src="./assets/logo.png" style="float:left; padding:0;margin:0">
  <tabs>
    <tab title="Simple">
        <h2>Multi-Row Setup</h2>
        <section>
          <label>
            Boxes in the first row ( {{items.length}} ):
            <input type="range" min="0" max="5" :value="items.length" @input="e => updateItems(e.target.value)">
          </label>
          <label><input type="checkbox" id="extraRow" v-model="extraRow"/> hidden row</label>
          <p/>
            <TabA :items="items" :extraRow="extraRow" />
        </section>
    </tab>
      <tab title="Nested">
      <h1>Nested layers</h1>
      <section>
        <TabB :items="items" />
      </section>
    </tab>
    <tab title="Stacks">
      <h1>Nested layers</h1>
      <section>
        <TabD :items="items" />
      </section>
    </tab>
    <tab title="Custom">
      <h1>Stacks and Connectors</h1>
      <section>
        <TabC />
      </section>
    </tab>
    <tab title="Layout options">
      <h1>Layout options</h1>
      <section>
        <TabE />
      </section>
    </tab>
  </tabs>

</template>

<script lang="ts">
import TabA from './components/TabA.vue';
import TabB from './components/TabB.vue';
import TabC from './components/TabC.vue';
import TabD from './components/TabD.vue';
import TabE from './components/TabE.vue';
import Tabs from './components/Tabs.vue';
import Tab from './components/Tab.vue';
import {defineComponent, ref, reactive} from 'vue';

export default defineComponent( {
  components: {
    TabA,
    TabB,
    TabC,
    TabD,
    TabE,
    Tabs,
    Tab
  },

  setup() {
    const items = reactive([1,2])
    const alt = ref(0.1)
    const extraRow = ref(false)

    function updateItems(n: number) {
      if (n > items.length) {
        for (let i=0; i < n - items.length; i++) items.push(items.length + 1)
      } else if ( n < items.length) {
        for (let i=0; i < items.length - n; i++) items.pop();
      }
    }

    return {
      items,
      alt,
      extraRow,
      updateItems
    }
  }
})
</script>

<style>
@import url(https://fonts.googleapis.com/css?family=Noto+Sans:400,700);
#app {
  font-family: Noto Sans, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 10px;
}
img {
  width: 7em;
}
</style>

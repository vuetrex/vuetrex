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
        <vx-geometry
          name="procedural-boxes"
          :graph="proceduralGeometry"
          :parameters="{ scale: 1.15 }"
          :materials="{ accent: { color: 0x55aadd } }"
        />
        <vx-particles name="consumer-flow" :graph="particleEffect" />
      </vx-layer>
    </Vuetrex>
  </div>
</template>

<script>
import { Vuetrex, defineGeometryOutputs, geo, inspectGeometry, particles } from '@exceeder/vuetrex';
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
    const parts = defineGeometryOutputs('consumer.parts', () => {
      const core = geo.box()
      const satellites = geo.distribute(
        geo.icosphere({ radius: 0.2 }),
        geo.radialPoints({ count: 4, radius: 1 }),
      )
      return { core, satellites, whole: geo.join([core, satellites]) }
    })({})
    const proceduralGeometry = parts.whole
      .material('accent')
      .parameterMap({ scale: geo.param('scale', 1) })
    const particleEffect = particles.path([[-1, 0.5, 0], [1, 0.5, 0]], { count: 12 })
      .appearance({ color: 0x55ccff, size: 0.06 })
      .motion({ speed: 0.4 })
    console.log("Current Instance:",getCurrentInstance())
    console.log("Vuetrex loaded:",Vuetrex)
    console.log("Procedural inspection:", inspectGeometry(proceduralGeometry, { scale: 1.15 }))
    return {
      proceduralGeometry,
      particleEffect,
    }
  }
}
</script>

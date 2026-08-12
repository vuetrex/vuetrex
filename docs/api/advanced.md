# Advanced

## Customization

If you need to dive deeper, you have access to the ThreeJS scene like this:

```vue
<template>
  <vuetrex  @ready="onStageReady">    
    <vx-box text="Example"/>
  </vuetrex>
</template>

<script type="ts">
import {VxStage} from '@exceeder/vuetrex.js'

export default {
  setup() {   
    function onStageReady(stage: VxStage) {
      //access to THREE.Scene for object loading etc.
      stage.getScene()
      //insert your own animations etc. 
      stage.onEachFrame( (time,tick) => {
        //30 fps frequency
      })
    }
    return {onStageReady} 
  }
}
</script>
```
Check [dev/components/TabC.vue] example for advanced customization. This demo
also extensively uses settings, that you can bind to the `settings` property:
```js
<vuetrex :settings="settings">...</vuetrex> 
...
setup() {
  const settings : VxSettings = {
      unit: 1.25,
      distance: 1.5,
      color: 0x334455,
      highlightColor: 0x3377bb,
      floorColor: 0xffffff,
      captionColor: 0x333333,
      particleColor: 0x707070,
      lightColor1: 0xffffff,
      lightColor2: 0xffffff,
      lightColor3: 0xffffff,
      mirrorOpacity: 0.9,
      particleSpread: 0.1,
      particleVolume: 5
  }
  return {settings}
}
```
## Architecture
For a terse description of how the library code works, check [architecture notes](../architecture.md)

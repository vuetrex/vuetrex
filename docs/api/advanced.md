# Advanced

## Experimental instance repeater

`vx-instances` keeps a keyed collection semantically addressable while drawing it as one `THREE.InstancedMesh`.
Transforms operate on a unit box by default, so the matrix controls both placement and dimensions.

```vue
<vx-instances
  :items="pods"
  key-by="id"
  :encoding="podEncoding"
  :material="{ color: 0xffffff, roughness: 0.4 }"
  @click="selectPod"
/>
```

```ts
import * as THREE from 'three'
import type { InstanceEncoding, VxMouseEvent } from '@exceeder/vuetrex.js'

const podEncoding: InstanceEncoding<Pod> = {
  transform(pod, index) {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(0, index * 0.2 + 0.1, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.4, 0.18, 0.4),
    )
  },
  color: pod => pod.ready ? 0x3e91c7 : 0xb13942,
  visible: pod => pod.phase !== 'Terminated',
}

function selectPod(event: VxMouseEvent) {
  console.log(event.vxInstance?.id, event.vxInstance?.item)
}
```

The draft supports one geometry, one shared material, per-instance transform/color/visibility, and instance-aware
pointer events. Per-instance labels, materials, hover styling, nested children, and connector endpoints are not yet
implemented. Instance colors multiply the shared material color; use white when the encoded colors should remain exact.

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

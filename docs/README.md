## Introduction

Vuetrex `/vju:treks/` integrates WebGL 3D diagrams into existing Vue UI. It is designed for anyone 
with basic knowledge of Vue. The approach uses the paradigm of html blocks but applies it to 3D space. 
It helps you to skip the complexity of transformations and projections.

Consider an example:

```xml
<template>
  <vuetrex>
    <vx-box/> <vx-cylinder/>
  </vuetrex>
</template>
```

it will render this 

![EXAMPLE 1](/screen1.png)

The reactive properties of Vue are preserved, and you can use`v-if`, `v-for`, `@click` events etc., bind
supported attributes, and build out your reactive 3D scene based on your data as you see fit. There is 
a degree of flexibility to adapt the scene to your needs as you go deeper into customization.

## Getting Started

If you don't already have a Vue 3 project, start it with the usual

```
npm install --global @vue/cli
vue create my-vue-project    # choose Vue 3.x, Vue 2.x is not supported
cd my-vue project
```
then add Vuetrex
```
npm install -s @exceeder/vuetrex
```
open `src/components/HelloWorld.vue` and add

```vue
<template>
  ...
  <vuetrex>
    <vx-box />
  </vuetrex>
  ...
</template>
<script>
//...
import { Vuetrex } from '@exceeder/vuetrex.js';

export default {
  components: {
    Vuetrex
  },
//...
}
</script> 
```
Run `npm run serve`, open your browser to the suggested url and that's it, you got your first 3d world running.
For a full example, take a look at [test/esm-module/TestApp.vue].

## Layouting

Multiple _rows_:
```vue
 <vuetrex>
    <vx-row>   <vx-box/> <vx-box/>  </vx-row>
    <vx-row>   <vx-box/> <vx-box/>  </vx-row>
    <vx-row>   <vx-box/>         </vx-row>
  </vuetrex>
```
Rows orientation is from left to right, as if they were rows in the movie theater with the screen on the left side.
![EXAMPLE 2](/screen2.png)

Nested _layers_:
```vue
 <vuetrex>
    <vx-row>
       <vx-layer> <vx-box /> <vx-box /> </vx-layer>
    </vx-row>
    <vx-row> <vx-box/> </vx-row>
    <vx-row>
      <vx-layer>
         <vx-row> <vx-box/> </vx-row>
         <vx-row> <vx-box/> </vx-row>
      </vx-layer>
    </vx-row>
  </vuetrex>
```
Note, that you can use `v-for` to bind elements to your data.

## Connectors and Captions

```vue
 <vuetrex>
    <vx-box name="a"/>
    <vx-cylinder name="b" text="Round" connection="a"/>
  </vuetrex>
```

![EXAMPLE 3](/screen3.png)

Connections are particle systems running along the connector lines. Both elements need to have a name 
property to connect.

Caption reflects the text property. Caption text is reactive in case of `:text="prop"` syntax.

## Events

```vue
  <vuetrex>   
    <vx-box :text="'['+counter+']'" @click="counter++"/>
  </vuetrex>
```
as one would expect, in `setup()` you will need a `const counter = ref(0)` that you return in this case.
There is only one possible event `click` at the moment.

## Camera

By setting a `camera` property to the name of the element you want to focus on, you will make Vuetrex zoom in on it.
If you set it to `"scene"` (default value), it will go back to overview position.

```vue
<template>
 <vuetrex :camera="camera">
   <vx-row>
     <vx-box v-for="item in list" :key="item" :text="item" @click="zoomIn"/>
   </vx-row>
 </vuetrex>
</template>
<script>
//...
export default {
  components: { Vuetrex },
  setup() {
    const camera = ref("scene") 
    const list = reactive(["Bravo", "Charlie", "Echo", "Delta"])

    function zoomIn(event) {
        //zoom in on every clicked item, unless it is already in focus,
        // in which case zoom out to a full view
        camera.value = camera.value === event.vxNode.name ? "scene" : event.vxNode.name
    }

    return { camera, list, zoomIn} 
  }
}
</script> 
```
![Example](/zoom.gif)
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
Check [demo/components/TabC.vue] example for advanced customization. This demo 
also extensively uses settings, that you can bind to the `settings` property: 
```
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

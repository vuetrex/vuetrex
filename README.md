# Vuetrex [![beta](https://img.shields.io/npm/v/@exceeder/vuetrex)](https://www.npmjs.com/package/@exceeder/vuetrex)

WebGL animated diagram visualizations in 3D for Vue 3.x
 
This project uses [Vue Custom Renderer API](https://v3.vuejs.org/api/global-api.html#createrenderer) and [Three.js](https://threejs.org/)
    
Vuetrex is currently in beta; minor interface changes may still occur before 1.0.

## Development

1.  `pnpm dev` for development
2.  `pnpm build` to rebuild the library

## Usage Example

### ES Module Browser build
For an example using in-browser ES6 modules, see the [tests](test/iife).

### Using in Vue Project
Use [Vite](https://vite.dev/) to set up your project with Vue 3.

Vuetrex supports Vue 3.5+ and Three.js 0.183+.

#### Setup
Install ThreeJS and Vuetrex:
```sh
npm install three @exceeder/vuetrex
```

#### Usage
In the script section of your .vue component:
```ts
import { Vuetrex } from '@exceeder/vuetrex';
...
components: {
  Vuetrex
}
```

Vue template example with reactive features fully supported:
```vue
<template>
 <Vuetrex>
    <layer>
      <row v-if="items.length > 0">
        <box v-for="(el,i) in items" :key="i" :name="'a'+el"/>
      </row>
      <row>
        <box name="b1" size="2"/>
        <box name="b2"/>
      </row>
      <row>
        <box name="c1"/>
        <cylinder name="c2" @click="cylinderClick"/>
      </row>
      <row>
        <box name="d1" size="4"/>
      </row>
    </layer>
 </Vuetrex>
</template>
```
### Support and Resources

Examples and explanations are in [Documentation](docs/README.md).

Rendering example:

![image](/screenshot.png)

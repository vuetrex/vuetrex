---
title: Start with a scene
description: Install Vuetrex and build a reactive 3D diagram in Vue.
---

# Start with a scene

<script setup>
import BasicScene from '../examples/src/BasicScene.vue'
import basicSceneSource from '../examples/src/BasicScene.vue?raw'
import ReactiveLayoutScene from '../examples/src/ReactiveLayoutScene.vue'
import reactiveLayoutSceneSource from '../examples/src/ReactiveLayoutScene.vue?raw'
import ConnectorFlowScene from '../examples/src/ConnectorFlowScene.vue'
import connectorFlowSceneSource from '../examples/src/ConnectorFlowScene.vue?raw'
</script>

## The problem: a diagram is separate from the app

Your Vue application already knows which services exist, which ones are unhealthy, and which item the user selected.
A screenshot or hand-maintained diagram cannot share that state. A raw Three.js scene can, but it introduces another
imperative application inside your Vue application.

Vuetrex lets a Vue template be the scene description.

## Install the library

Vuetrex requires Node 24 or newer and Vue 3.

```sh
pnpm add @exceeder/vuetrex
```

The package has peer dependencies on `vue`, `three`, `gsap`, and `troika-three-text`. A normal package-manager install
will resolve them; applications with strict peer dependency settings can add them explicitly.

## Tell Vue that `vx-*` tags are scene elements

Vuetrex interprets these tags through its custom renderer. Configure Vue's template compiler so the outer renderer
does not try to resolve each tag as a normal Vue component:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => tag.startsWith('vx-'),
        },
      },
    }),
  ],
})
```

## Render one object

This first example has one component, one scene element, and no application state. Switch to **Source** to see the
exact `.vue` file rendering in **Result**.

<ClientOnly>
  <ExampleTabs title="1 · One scene object" :source="basicSceneSource">
    <BasicScene />
  </ExampleTabs>
</ClientOnly>

`<Vuetrex>` renders one normal DOM wrapper and canvas. Everything in its default slot is rendered by Vuetrex into a
Three.js scene.

The `height` and `width` props are CSS dimensions for that wrapper. Give the scene a definite height; the default is
`50vh`.

## Add data and layout

The second example adds a keyed collection, reactive layout, health state, hover styling, clicking, and camera focus.
Use its controls and click an object before reading the source.

<ClientOnly>
  <ExampleTabs title="2 · Reactive data, layout, and interaction" :source="reactiveLayoutSceneSource">
    <ReactiveLayoutScene />
  </ExampleTabs>
</ClientOnly>

The row measures each box and centers the result. Changing the array adds, removes, and repositions objects through the
same Vue update that changed your UI.

## Add an interaction

```vue
<vx-box
  v-for="service in services"
  :key="service.id"
  :name="service.id" :id="service.id"
  :text="service.id"
  :hover="{ emissive: 0x157c85, emissiveIntensity: 0.6, scale: 1.04 }"
  @click="selectedId = service.id"
/>
```

Props and events are patched onto logical Vuetrex nodes. The library owns raycasting and translates pointer hits back
into Vue event handlers.

## Connect objects and add live flow

The third example retains the same semantic IDs, then adds a keyed connector graph, data-driven styles, arrow markers,
and particles travelling along the resolved routes. The source is still one normal Vue component.

<ClientOnly>
  <ExampleTabs title="3 · Fluent connectors and particles" :source="connectorFlowSceneSource">
    <ConnectorFlowScene />
  </ExampleTabs>
</ClientOnly>

The connector graph refers to object IDs rather than coordinates. Vuetrex resolves current positions after layout and
feeds the resulting paths to both the stroke and particle backends. Continue with
[Connections and focus](/guide/connections-and-focus) for buses, bundles, route profiles, and picking.

## What to learn next

1. [Live data and components](/guide/live-data) shows how to model a service as a reusable visual component.
2. [Layout in 3D](/guide/layouts) explains nesting, measurement, rings, and explicit placements.
3. [Connections and focus](/guide/connections-and-focus) adds semantic links and camera navigation.
4. [Composition recipes](/guide/composability) separates reusable view policy from representation.

::: warning Browser rendering
Vuetrex requires WebGL and browser DOM APIs. Mount it on the client when using server-side rendering.
:::

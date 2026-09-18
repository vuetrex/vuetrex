---
title: Stage API
description: Configure scene rendering, camera framing, animation, and low-level access.
---

# Stage API

## Obtain the stage

`<Vuetrex>` emits `ready` after the renderer and Three.js scene are mounted.

```vue
<script setup lang="ts">
import type { VxStage } from '@exceeder/vuetrex'

let stage: VxStage | undefined

function onReady(value: VxStage) {
  stage = value
}
</script>

<template>
  <Vuetrex @ready="onReady">
    <!-- scene -->
  </Vuetrex>
</template>
```

## Methods

### `fitToContent(options?)`

Measures all authored scene roots in world space and frames them in the perspective camera.

```ts
stage.fitToContent({ padding: 1, duration: 0.35 })
```

```ts
interface VxFitOptions {
  padding?: number   // world units; default 0.75
  duration?: number  // seconds; default 0.6
}
```

Returns `false` when no measurable authored content exists. The options remain active for later automatic refits.

### `sendCameraTo(id)`

Frames a node's measured world bounds by semantic ID. Use `scene` to return to the complete fitted overview.

```ts
stage.sendCameraTo('orders')
stage.sendCameraTo('scene')
```

In most Vue components, bind the `<Vuetrex camera>` prop instead of calling this directly.

### `animateTo(id, props, options?)`

Animates the transform of a node addressed by semantic ID without exposing its Three.js object.

```ts
stage.animateTo('orders', { positionY: 0.4, scale: 1.08 }, {
  duration: 0.35,
  ease: 'power2.out',
})
```

Supported targets are `positionY`, `scale`, `scaleX`, `scaleY`, and `scaleZ`. Per-axis scale values override the uniform
`scale`. Options are `duration`, `ease`, `delay`, and `onComplete`.

### `onEachFrame(callback)`

Registers a callback with the stage animation loop:

```ts
const stop = stage.onEachFrame((time, tick) => {
  // Reserve for integration work that cannot be expressed reactively.
})

stop()
```

The returned function unregisters the callback. Prefer reactive props for normal scene updates. A per-frame callback
couples application code to render frequency.

### `getScene()`

Returns the underlying `THREE.Scene`. This is an escape hatch for integrations that Vuetrex cannot represent.

Objects added directly are outside the logical Vuetrex tree. Vuetrex will not automatically measure, remove, connect,
or dispatch logical events through them.

### `setDiagnostics(mode)`

Enable a non-authored overlay for inspecting scene composition:

```ts
stage.setDiagnostics(true)

stage.setDiagnostics({
  groupBounds: true,
  footprints: true,
  connectionPorts: true,
  nodeIds: true,
})

stage.setDiagnostics(false)
```

Group bounds are green, measured layout footprints are cyan, current default connection ports are orange, and semantic
node IDs are labeled above content. Diagnostic objects are excluded from camera fitting, pointer events, and the
logical node tree. The same value can be supplied initially as `settings.diagnostics`.

## Settings

Pass settings through the `<Vuetrex :settings>` prop.

```ts
import type { VxSettings } from '@exceeder/vuetrex'

const settings: VxSettings = {
  backgroundColor: 0x101719,
  fog: { near: 18, far: 42 },
  floorColor: 0x263338,
  color: 0x3d8295,
  highlightColor: 0x58b7c0,
  captionColor: 0xe7eef0,
  connectorColor: 0x34444c,
  floorGrid: false,
  floorMirror: false,
  floorCaptions: false,
  shadows: false,
  gap: 0.35,
}
```

| Setting | Purpose |
|---|---|
| `color` | Default node material color |
| `backgroundColor` | Renderer background |
| `fog` | Optional linear distance fog; accepts `near`, `far`, and an optional `color` that defaults to `backgroundColor` |
| `floorColor` | Floor and floor texture color |
| `mirrorOpacity` | Floor-graphics blend over the reflection; defaults to `0.95`, lower values reveal more reflection, and `1` skips the reflection pass |
| `floorGrid` | Draw the floor grid; defaults to `true` |
| `floorMirror` | Create the reflection pass; defaults to `true` |
| `floorCaptions` | Draw mesh `text` on the floor texture; defaults to `true` |
| `shadows` | Enable renderer shadow maps, shadow lights, and mesh shadow flags; defaults to `true` |
| `highlightColor` | Default interactive highlight |
| `captionColor` | Shared caption color |
| `connectorColor` | Solid connector and arrowhead color |
| `lightColor1..3` | Stage light colors |
| `unit` | Base geometry unit |
| `gap` | Default container gap |
| `diagnostics` | `true` or per-overlay `VxDiagnosticsSettings` |

Use [`<vx-display-wall>`](/guide/display-walls) for background walls, live charts, and text.
Configure particle color, size, blending, and density on a `ParticleSource` inside connector `.flow()`.

The stage floor is world `Y = 0`; base-anchored objects extend upward from that plane. With `floorMirror` enabled, the
reflection, floor tint, grid, captions, lighting, and shadows are composed by one material on one surface at `Y = 0`.
There is no second, nearly coplanar floor layer, so camera rotation cannot make the two layers compete for depth.
See [Layout in 3D](/guide/layouts#start-at-the-ground-plane) for the coordinate convention.

## Lifecycle controls

The `<Vuetrex :stopped>` prop pauses and resumes the stage animation loop reactively.

```vue
<Vuetrex :stopped="paused">
  <!-- scene -->
</Vuetrex>
```

Unmounting `<Vuetrex>` destroys its logical root, event bindings, and scene resources owned by Vuetrex.

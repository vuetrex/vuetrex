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

stage.animateTo('monitor', {
  positionX: -0.35,
  positionY: 0.66,
  positionZ: 1.11,
  rotationAxis: 'x',
  rotationAngle: 0,
  pivot: [0, -0.42, 0.34],
}, { duration: 0.75, ease: 'power2.inOut' })
```

Translation targets are `positionX`, `positionY`, and `positionZ`. Scale targets are `scale`, `scaleX`, `scaleY`, and
`scaleZ`; per-axis values override the uniform `scale`. Rotation can be an absolute `quaternion` (a Three.js
quaternion, `[x, y, z, w]`, or an equivalent object), or an absolute local-axis orientation using `rotationAxis` and
`rotationAngle`. An axis can be `'x'`, `'y'`, `'z'`, or a vector. `quaternion` takes precedence when both forms are
present.

`pivot` is a point in the animated object's local coordinates. During rotation or scaling, Vuetrex compensates the
object's position so that point remains fixed in parent space. If translation is included in the same call, the pivot
moves by that translation while remaining the hinge for rotation and scale. This makes a panel rotate around an edge
without requiring an extra placement group.

Options are `duration`, `ease`, `delay`, and `onComplete`. `animateTo()` still performs an imperative realized-object
animation; a reactive placement update can overwrite it. Use one source of transform state when placement is changing
at the same time.

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

### `composerDiagnostics()`

Returns an immutable snapshot of the requested and effective composer options, active pass keys, target size,
estimated owned target bytes, supported features, fallbacks, allocation/update counters, and the last pipeline error.
Use the root `composer-status` event for reactive status; it is deduplicated and never fires per frame.

```ts
const status = stage.composerDiagnostics()
console.log(status.effective, status.fallbackReasons)
```

## Camera orbit timelines

The root `camera` prop accepts a named node, `"scene"` for automatic fitting, or `{ orbit }` for an explicit pose.
An explicit pose is applied before `ready` and remains in control when scene bounds or the viewport change.

```vue
<script setup lang="ts">
import { Vuetrex, type VxStage, type VxCameraOrbit } from '@exceeder/vuetrex'

const orbit = {
  target: [0, 0, 0],
  height: 9,
  radius: 24,
  azimuth: -30,
} satisfies VxCameraOrbit

function startCameraOrbit(stage: VxStage) {
  stage.camera.timeline({ repeat: -1, yoyo: true })
    .to({ azimuth: 30 }, { duration: 60, ease: 'none' })
}
</script>

<template>
  <Vuetrex :camera="{ orbit }" @ready="startCameraOrbit">
    <vx-box />
  </Vuetrex>
</template>
```

`height` is absolute world Y; `radius` is horizontal distance from `target`. Azimuth is in degrees: zero is +Z,
and positive angles turn toward +X. With `ease: 'none'`, this example moves one degree per second.

`stage.camera.orbit(orbit)` applies another pose immediately. `.timeline({ repeat, yoyo, paused, defaults })`
creates a stage-owned GSAP timeline. Its fluent methods are `.to(values, options, position?)`, `.set(values, position?)`,
`.addLabel(name, position?)`, `.pause()`, `.resume()`, and `.seek(secondsOrLabel)`. `.kill()` ends the timeline.
Animate `azimuth`, `height`, and `radius`; set the target with `.orbit()`. Timeline positions and easing use GSAP semantics.

Timelines follow the stage clock, so `stopped` pauses their progress without a catch-up jump. Starting another camera
timeline or changing the root `camera` prop replaces the old animation. User camera interaction pauses it; explicitly
resuming continues the authored trajectory. Unmount disposes it automatically. `sendCameraTo('scene')` or
`fitToContent()` stops the animation and restores automatic framing. A `<vx-camera>` declaration also explicitly
requests fitting; do not combine it with an orbit you want to keep in control.

The underlying Three.js perspective camera is available on the concrete `VuetrexStage` as `renderCamera`.

## Settings

Pass settings through the `<Vuetrex :settings>` prop. See the [complete root reference](/api/vuetrex#settings)
for every setting, its default, and nested fog and diagnostic options. Settings are read at mount.

```ts
import type { VxSettings } from '@exceeder/vuetrex'

const settings: VxSettings = {
  backgroundColor: 0x101719,
  fog: { near: 18, far: 42 },
  floorColor: 0x263338,
  floorFadeStart: 20,
  floorFadeEnd: 50,
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
| `floorFadeStart`, `floorFadeEnd` | Optional paired world-space X/Z extents that blend only the floor into `backgroundColor` |
| `mirrorOpacity` | Floor-graphics blend over the reflection; defaults to `0.55`, lower values reveal more reflection, and `1` skips the reflection pass |
| `floorGrid` | Draw the floor grid; defaults to `true` |
| `floorMirror` | Create the reflection pass; defaults to `true` |
| `floorCaptions` | Draw mesh `text` on the floor texture; defaults to `true` |
| `shadows` | Enable renderer shadow maps, shadow lights, and mesh shadow flags; defaults to `true` |
| `highlightColor` | Default interactive highlight |
| `captionColor` | Shared caption color |
| `connectorColor` | Solid connector and arrowhead color |
| `lightColor1`, `lightColor2` | Stage directional light colors; `lightColor3` is currently unused |
| `unit` | Base geometry unit |
| `gap` | Default container gap |
| `diagnostics` | `true` or per-overlay `VxDiagnosticsSettings` |

Use [`<vx-lighting>`](/api/#scene-declarations) for reactive key/fill intensity and shadow quality.

Use [`<vx-display-wall>`](/guide/display-walls) for background walls, live charts, and text.
Configure particle color, size, blending, and density on a `ParticleSource` inside connector `.flow()`.

The stage floor is world `Y = 0`; base-anchored objects extend upward from that plane. With `floorMirror` enabled, the
reflection, floor tint, grid, captions, lighting, and shadows are composed by one material on one surface at `Y = 0`.
There is no second, nearly coplanar floor layer, so camera rotation cannot make the two layers compete for depth.
When both floor fade settings are present, the floor remains unchanged inside `floorFadeStart`, blends toward the
background, and disappears at `floorFadeEnd`. Scene objects stay crisp because the fade applies only to the floor material.
See [Layout in 3D](/guide/layouts#start-at-the-ground-plane) for the coordinate convention.

## Lifecycle controls

The `<Vuetrex :stopped>` prop pauses and resumes the stage animation loop reactively.

```vue
<Vuetrex :stopped="paused">
  <!-- scene -->
</Vuetrex>
```

Unmounting `<Vuetrex>` destroys its logical root, event bindings, and scene resources owned by Vuetrex.

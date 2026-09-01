---
title: Display walls
description: Put live Canvas 2D, SVG, or existing image content onto flat and curved display surfaces.
---

# Display walls

## The problem: geometry alone does not show detailed metrics

A 3D topology is useful for structure and movement. Dense text, charts, legends, and trends are often clearer on a 2D
surface. A display wall combines both: it is a Vuetrex scene node whose screen is backed by a canvas texture.

## Add one continuous display

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { VxDisplaySurface } from '@exceeder/vuetrex'

const props = defineProps<{
  requestRate: number
  errorRate: number
}>()

const surface = computed<VxDisplaySurface>(() => ({
  background: '#111719',
  paint({ context, width, height }) {
    context.fillStyle = '#e7eef0'
    context.font = '700 48px sans-serif'
    context.fillText('LIVE TRAFFIC', 64, 82)

    context.fillStyle = '#70c7d0'
    context.font = '600 88px sans-serif'
    context.fillText(`${props.requestRate}/s`, 64, 190)

    context.fillStyle = props.errorRate > 0.05 ? '#df7863' : '#78c69c'
    context.fillRect(64, height - 100, width * props.errorRate, 24)
  },
}))
</script>

<template>
  <vx-display-wall
    name="operations-display"
    shape="curved"
    mode="continuous"
    :radius="7.2"
    :arc="110"
    :height="4.8"
    :thickness="0.14"
    :segments="128"
    :surface="surface"
  />
</template>
```

The display surface repaints reactively. Structural props such as shape, size, and segment count rebuild geometry;
surface changes repaint existing textures.

## Choose flat or curved geometry

`shape="flat"` uses `width`, `height`, and `thickness`. `shape="curved"` uses `radius`, `arc` in degrees, `height`, and
`thickness`. Curved displays default to 128 radial segments for a smooth profile.

```vue
<vx-display-wall
  shape="flat"
  :width="8"
  :height="4"
  :thickness="0.16"
  :surface="surface"
/>
```

## Split the wall into independent displays

Use `mode="displays"` when each chart needs its own texture and update path:

```vue
<vx-display-wall
  shape="curved"
  mode="displays"
  :radius="7"
  :arc="105"
  :height="2.8"
  :bezel="0.12"
  :surfaces="displays"
/>
```

```ts
const displays: VxDisplaySurface[] = [
  { id: 'traffic', background: '#101719', paint: drawTraffic },
  { id: 'latency', background: '#101719', svg: latencyChartSvg },
  { id: 'readiness', background: '#101719', canvas: readinessCanvas },
]
```

Each surface accepts one or more of:

| Field | Purpose |
|---|---|
| `background` | CSS color painted before content |
| `paint` | Draw with the Canvas 2D API |
| `svg` | Rasterize inline SVG over the canvas |
| `canvas` | Draw an existing canvas or image source |

## Place the wall like other content

Wrap the display in a placed group when a recipe or scene component owns its transform:

```ts
import { markRaw } from 'vue'
import { Quaternion, Vector3 } from 'three'

const wallPlacement = markRaw({
  position: new Vector3(0, 2.2, -5.8),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
})
```

```vue
<vx-group :placement="wallPlacement">
  <OperationsDisplay :metrics="metrics" />
</vx-group>
```

The wall then participates in camera bounds as one scene subtree.

## Keep the wall a representation component

The parent scene should decide where a wall belongs and which metrics it receives. The wall component should own
typography, chart drawing, and surface arrangement. This is the same separation used for services and deployments:
spatial policy outside, visual language inside.

Do not render untrusted SVG strings without sanitizing them first.

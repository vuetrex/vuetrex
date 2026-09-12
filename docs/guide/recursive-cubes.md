---
title: Build recursive cubes and pipes
description: Learn procedural geometry by growing five smaller cube-and-pipe branches from every cube.
outline: deep
---

# Build recursive cubes and pipes

In this tutorial you will build a self-similar object from one simple rule:

> Put a pipe on each exposed face of a cube, attach a smaller cube to every pipe, and repeat five times.

The result contains 781 cubes and 780 pipes, but its geometry module stays small. You do not manually create any of
those 1,561 objects. You describe one cube, one outward-growing arm, and one terminating recursive rule.

This tutorial is intentionally gradual. The important part is not the finished shape—it is learning how to reason about
local coordinates, attachment points, distribution, and self-similarity.

## What you will learn

You will use:

- `geo.box()` to create a cube;
- `geo.line()` with thickness to create a pipe;
- `geo.transform()` to place parts precisely;
- `geo.join()` to make one source from several parts;
- `geo.distribute()` to rotate one arm onto five faces;
- `geo.material()` to give parts semantic material channels;
- `defineGeometry()` to package the result as reusable parametrized geometry;
- Vue `ref()` and `computed()` to keep the result reactive.

If you have not rendered a Vuetrex scene before, first read [Start with a scene](/guide/). For a reference covering all
procedural operators, see [Procedural geometry](/guide/procedural-geometry).

## The mental model: build locally, then reuse

Procedural geometry becomes much easier when every reusable part has a clear local-coordinate contract.

For this model, the contract is:

```text
local +Y   outward from the parent
local -Y   back toward the parent
origin     center of the current cube
```

A Vuetrex line with a positive length starts at its local origin and extends along local `+Y`:

```text
(0, 0, 0) ─────────► (0, length, 0)
                  local +Y
```

That convention lets you construct one arm along `+Y`. Distribution will later rotate the complete arm onto the top,
left, right, front, and back faces. You do not need five separately rotated pipe implementations.

## Step 1: create one cube

Create `src/geometry/quads.ts`:

```ts
import { geo, type GeometrySource } from '@exceeder/vuetrex'

function quad(size: number): GeometrySource {
  return geo.box({
    width: size,
    height: size,
    depth: size,
  })
}
```

Boxes are centered on their origin. A cube with size `1` therefore reaches from `-0.5` to `+0.5` along every axis.
Its top surface is at `y = size / 2`.

## Step 2: create a pipe that begins on the surface

Add a pipe inside `quad()`:

```ts
const pipeLength = size * 0.5

const pipe = geo.line({
  length: pipeLength,
  thickness: size * 0.055,
  radialSegments: 6,
})
```

`thickness` turns the line into a mesh pipe. It is the pipe radius, not its diameter. Without thickness, Vuetrex renders
a thin line instead.

The pipe currently starts at the cube's center. Move it upward by half the cube size:

```ts
const pipe = geo.transform(geo.line({
  length: pipeLength,
  thickness: size * 0.055,
  radialSegments: 6,
}), {
  translate: [0, size / 2, 0],
})
```

Now its start is exactly at the center of the top face:

```text
cube center                   pipe end
    │                            │
    │       top surface          │
    └──── size / 2 ────►─────────┘
                         pipeLength
```

Combine the cube and pipe so both appear:

```ts
return geo.join([cube, pipe])
```

`geo.join()` combines record streams. It does not weld their vertices or perform a CSG union, which is not needed for
this model.

## Step 3: attach one smaller cube

Choose a shrink ratio:

```ts
const childSize = size * 0.42
```

The child cube must begin where the pipe ends. Because a box is centered, place its center another `childSize / 2`
beyond the pipe end:

```ts
const child = geo.transform(quad(childSize), {
  translate: [
    0,
    size / 2 + pipeLength + childSize / 2,
    0,
  ],
})
```

The placement formula is worth remembering:

```text
child center = parent half-size + connector length + child half-size
```

If you omit the final half-size, the pipe ends at the center of the child and passes halfway through it. If you omit the
parent half-size, the pipe begins inside the parent.

Join the pipe and its child into one reusable arm:

```ts
const arm = geo.join([pipe, child])
```

The arm's local contract is still simple: it starts at the current cube's surface and grows along `+Y`.

## Step 4: identify the five exposed faces

A cube has six faces. The local `-Y` face is reserved for its connection to its parent, so growth uses the other five:

```ts
const FACE_DIRECTIONS = [
  [0, 1, 0],  // top
  [1, 0, 0],  // right
  [-1, 0, 0], // left
  [0, 0, 1],  // front
  [0, 0, -1], // back
] as const
```

The root cube does not have a parent, but using the same five directions at every level keeps the rule perfectly
self-similar. More importantly, a child never immediately grows backward through the pipe that connects it to its
parent.

## Step 5: rotate one arm onto every face

Convert each direction into a placement and distribute the arm:

```ts
const arms = geo.distribute(
  arm,
  FACE_DIRECTIONS.map((direction, index) => ({
    key: `face-${index}`,
    position: [0, 0, 0] as const,
    direction,
  })),
)
```

Every placement remains at the current cube's origin. Its `direction` rotates the distributed source so the source's
local `+Y` points toward that face.

This rotation affects the entire arm:

- the pipe's translated start rotates to the correct surface center;
- the pipe points outward;
- the child moves to the pipe end;
- all geometry inside the child rotates with it.

Join the current cube and all five arms:

```ts
return geo.join([cube, arms])
```

At this point, one cube produces five pipes and five child cubes. However, calling `quad(childSize)` without a stopping
condition would recurse forever. Add the base case before completing the recursion.

## Step 6: add a terminating recursive rule

Give `quad()` a `levels` argument:

```ts
function quad(size: number, levels: number): GeometrySource {
  const cube = geo.box({ width: size, height: size, depth: size })

  if (levels === 1) return cube

  // Build pipes and children here.
}
```

The base case returns only the terminal cube. Otherwise, the child gets one fewer remaining level:

```ts
const child = geo.transform(quad(childSize, levels - 1), {
  translate: [0, size / 2 + pipeLength + childSize / 2, 0],
})
```

This is self-similarity: `quad()` does not call a separate twig or tip implementation. It calls the same function with
smaller parameters until the base case is reached.

While developing, start with three levels. When the placement looks correct, change it to five:

```ts
const LEVELS = 5
```

## Step 7: make scale and spacing parameters explicit

Move the ratios out of the function body:

```ts
function quad(
  size: number,
  levels: number,
  shrink: number,
  spacing: number,
): GeometrySource {
  const childSize = size * shrink
  const pipeLength = size * spacing
  // ...
}
```

Because every recursive call receives the same ratios, the complete object remains self-similar. Each generation is a
scaled version of the one before it.

Values near these ranges work well:

| Parameter | Useful range | Meaning |
|---|---:|---|
| `shrink` | `0.30–0.52` | Size of a child relative to its parent |
| `spacing` | `0.25–0.75` | Pipe length relative to the parent size |

Large shrink values may cause neighboring recursive branches to overlap. Very small values make the final levels hard
to see.

## Step 8: separate material meaning from appearance

Assign semantic channels inside the geometry module:

```ts
const cube = geo.material(
  geo.box({ width: size, height: size, depth: size }),
  'cube',
)

const pipe = geo.material(
  geo.transform(geo.line({
    length: pipeLength,
    thickness: size * 0.055,
    radialSegments: 6,
  }), { translate: [0, size / 2, 0] }),
  'pipe',
)
```

`geo.material()` does not create a Three.js material. It labels generated records with a channel. The Vue scene decides
how those channels look, allowing the geometry module to be reused with another visual design.

## Step 9: package the graph as a geometry module

Define the public parameters and wrap the recursive function:

```ts
import {
  defineGeometry,
  geo,
  type GeometrySource,
} from '@exceeder/vuetrex'

export interface QuadsParameters {
  size: number
  shrink?: number
  spacing?: number
}

const LEVELS = 5

export const quads = defineGeometry<QuadsParameters>(
  'quads',
  parameters => quad(
    parameters.size,
    LEVELS,
    parameters.shrink ?? 0.42,
    parameters.spacing ?? 0.5,
  ),
)
```

`quads(...)` returns a normal `GeometrySource`. It can still enter any larger operation:

```ts
const tilted = geo.transform(
  quads({ size: 1, shrink: 0.4 }),
  { rotate: [0.2, 0.4, 0] },
)

const row = geo.distribute(
  quads({ size: 1 }),
  { pattern: 'line', count: 4, start: [-3, 0, 0], end: [3, 0, 0] },
)
```

Packaging does not make the geometry “finished.” It only gives a reusable subgraph a typed name and parameters.

## Complete geometry module

Your complete `src/geometry/quads.ts` should now look like this:

```ts
import {
  defineGeometry,
  geo,
  type GeometrySource,
} from '@exceeder/vuetrex'

export interface QuadsParameters {
  size: number
  shrink?: number
  spacing?: number
}

const LEVELS = 5

// Local -Y is attached to the parent; the other five faces grow outward.
const FACE_DIRECTIONS = [
  [0, 1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const

function quad(
  size: number,
  levels: number,
  shrink: number,
  spacing: number,
): GeometrySource {
  const cube = geo.material(
    geo.box({ width: size, height: size, depth: size }),
    'cube',
  )

  if (levels === 1) return cube

  const childSize = size * shrink
  const pipeLength = size * spacing

  const pipe = geo.material(
    geo.transform(geo.line({
      length: pipeLength,
      thickness: size * 0.055,
      radialSegments: 6,
    }), {
      translate: [0, size / 2, 0],
    }),
    'pipe',
  )

  // Construct one arm along +Y.
  const child = geo.transform(
    quad(childSize, levels - 1, shrink, spacing),
    {
      translate: [
        0,
        size / 2 + pipeLength + childSize / 2,
        0,
      ],
    },
  )
  const arm = geo.join([pipe, child])

  // Rotate that complete arm onto each exposed face.
  const arms = geo.distribute(
    arm,
    FACE_DIRECTIONS.map((direction, index) => ({
      key: `face-${index}`,
      position: [0, 0, 0] as const,
      direction,
    })),
  )

  return geo.join([cube, arms])
}

export const quads = defineGeometry<QuadsParameters>(
  'quads',
  parameters => quad(
    parameters.size,
    LEVELS,
    parameters.shrink ?? 0.42,
    parameters.spacing ?? 0.5,
  ),
)
```

## Step 10: render it from Vue

Create a component such as `RecursiveQuads.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex } from '@exceeder/vuetrex'
import { quads } from './geometry/quads.js'

const shrink = ref(0.42)
const spacing = ref(0.5)

const graph = computed(() => quads({
  size: 1.8,
  shrink: shrink.value,
  spacing: spacing.value,
}))
</script>

<template>
  <div class="controls">
    <label>
      Shrink
      <input
        v-model.number="shrink"
        type="range"
        min="0.30"
        max="0.52"
        step="0.01"
      >
    </label>

    <label>
      Pipe length
      <input
        v-model.number="spacing"
        type="range"
        min="0.25"
        max="0.75"
        step="0.01"
      >
    </label>
  </div>

  <Vuetrex
    height="600px"
    :settings="{
      backgroundColor: 0xefefef,
      floorColor: 0xc5c5c5,
      floorMirror: false,
      shadows: true,
    }"
  >
    <vx-geometry
      :graph="graph"
      anchor="center"
      :materials="{
        cube: {
          color: 0x6f88a8,
          roughness: 0.72,
          metalness: 0.04,
        },
        pipe: {
          color: 0xd19a66,
          roughness: 0.82,
          metalness: 0.02,
        },
      }"
    />
  </Vuetrex>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.controls label {
  display: grid;
  gap: 0.25rem;
}
</style>
```

Moving either slider changes a Vue ref. The computed value creates the corresponding immutable geometry description,
and Vuetrex reconciles its records into instance batches. There is no separate procedural reactivity system to keep in
sync with Vue.

::: tip Why use `anchor="center"`?
The recursive structure extends in several directions. Center anchoring places its calculated bounding-box center at the
Vuetrex node position. `base` would instead place the bottom of the complete bounds at that position.
:::

## Step 11: understand the growth cost

Each non-terminal cube creates five children. At five cube levels, the count is:

```text
level 1:   1 cube
level 2:   5 cubes
level 3:  25 cubes
level 4: 125 cubes
level 5: 625 cubes
          ---------
total:   781 cubes
```

Every cube except the root needs one connecting pipe, giving 780 pipes.

This exponential growth is why the base case matters. The graph remains concise, and compatible cubes and pipes are
GPU-instanced, but the evaluator still needs one record and transform per generated part. Develop with fewer levels and
increase the depth only after the rule is correct.

## Common mistakes

### The pipe passes through the parent

The line begins at the origin. Translate it by `size / 2` before distribution so it begins on the surface.

### The child is centered on the pipe end

Add `childSize / 2` to the child's translation. The pipe should meet the child's near face, not its center.

### Some branches point back through their parent

Do not include local `[0, -1, 0]` in `FACE_DIRECTIONS`. That face is the attachment to the parent.

### Only the pipe rotates correctly

Join the pipe and child into one `arm`, then distribute the arm. If they are distributed separately, their transforms
can drift apart.

### The browser freezes while experimenting

Temporarily set `LEVELS` to `2` or `3`. A branching factor of five grows very quickly.

### The pipes look like hairlines

Supply a positive `thickness`. Thin and thick lines use different realization paths.

## Experiments to try next

1. Use only three face directions and compare the resulting growth pattern.
2. Make `FACE_DIRECTIONS` a function and alternate directions by level.
3. Apply `geo.randomize()` to the arm before distribution.
4. Add `geo.named()` groups for levels so they can be inspected independently.
5. Distribute the complete `quads()` module to create a row or grid of recursive objects.
6. Export the level count as a carefully bounded parameter.
7. Move the `cube` and `pipe` appearances into a reusable stylesheet so the geometry contains only semantic material
   names.

The important pattern remains the same: define one local piece with a precise attachment contract, reuse it through
distribution, terminate recursion, and leave final presentation to the Vue scene.

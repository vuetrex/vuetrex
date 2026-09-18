---
title: A block in motion
description: Build a tiny procedural city and animate its cars with ordinary Vue state.
outline: deep
---

<script setup>
import CityBlockScene from './src/CityBlockScene.vue'
import citySceneSource from './src/CityBlockScene.vue?raw'
</script>

# A block in motion

[Scene notebook](/examples/) / 01 · Procedural geometry + Vue reactivity

A city does not need to start with a map, a physics engine, or a collection of imported models. Start with a box.
Stretch it into a building. Flatten another into a street. Put a smaller one on the street and let time move it.

This little block is deliberately simple: six buildings and one one-way loop. Yet the same recipe can look like a
low-rise neighborhood or a busy miniature downtown. The controls are normal Vue refs; the result is real Vuetrex
geometry.

## Take it for a spin

Try raising the **Skyline**, changing **Traffic**, and adjusting **Speed**. **New skyline** varies the six lots without
changing the street. **Pause traffic** freezes the cars while leaving the camera and other controls usable.

<ClientOnly>
  <ExampleTabs title="A block in motion · CityBlockScene.vue" :source="citySceneSource">
    <CityBlockScene />
  </ExampleTabs>
</ClientOnly>

The Source tab contains the actual Vue component. Its geometry recipe is the second file,
[`cityBlock.ts`](#the-complete-geometry-recipe), shown below. Copy both into the same directory in a
[configured Vuetrex project](/guide/#tell-vue-that-vx-tags-are-scene-elements). The maximize button expands the example
inside the browser window; Escape returns it to the article.

## 1. Build upward from the ground

Use X and Z as your map and positive Y as height. The model's lowest point is `Y = 0`; it never needs a hidden negative
offset. A unit box is centered on its origin, so lifting it by half its height places its base on that plane:

```ts
const building = geo.box()
  .transform({ translate: [0, 0.5, 0] })
```

In the complete recipe, a shallow base supports the asphalt and the raised sidewalk. Buildings stand on the sidewalk
at `Y = 0.24`; cars stand on the asphalt at `Y = 0.16`. These are visible model thicknesses, not depth-buffer tricks.
The output uses `anchor="origin"` to preserve these authored coordinates.

## 2. Repeat a recipe, not your markup

Each lot is a small data record: an ID, a map position, a height, and a color. `distribute()` places the same box on all
six lots. A field reads each item to decide its transform:

```ts
const buildings = building.distribute({
  items: lots,
  keyBy: 'id',
  position: ({ item }) => [item.x, 0.24, item.z],
  scale: ({ item }) => [1.2, item.height, 1.3],
})
```

Repeat the same placement for the roof and window grid. Join those sources with the road, pavement, and cars, then
render the complete block through one `<vx-geometry>`. Compatible records become instanced batches; there is no Vue
component or independently allocated box geometry for every window.

Stable lot and car IDs describe identity. Changing the recipe's seed varies building heights and colors predictably,
while keeping those lot IDs intact.

## 3. Let Vue supply the changing values

The skyline slider does not create taller box primitives. It supplies a scale to the existing graph:

```ts
// In the recipe, after distributing the building parts:
source.parameterMap({ scale: geo.param('skyline', [1, 1, 1]) })

// In the component:
const parameters = computed(() => ({
  skyline: [1, skyline.value, 1],
  ...trafficParameters(carCount.value, distance.value),
}))
```

Because scale is applied in each lot's local placement space, taller buildings stay on their foundations. The window
and roof parts scale with them. This is stylization, not architectural modeling: windows stretch rather than adding
extra floors.

| Control | What changes |
| --- | --- |
| Skyline | Building instance transforms through a bound parameter |
| Speed / Pause | How quickly the distance ref advances; pause keeps the current distance |
| Traffic | The keyed car collection, including an empty road at zero |
| New skyline | A new deterministic geometry recipe with the same six lot IDs |

The graph is a `computed` value that depends only on the seed and car count. Animation updates parameters rather than
reauthoring that graph every frame. Vuetrex still evaluates those parameters, but reuses compatible geometry and
instance batches rather than constructing a new scene.

## 4. Distance becomes a car position

`carPose(distance)` walks four line segments around the block. It returns an `[x, y, z]` position and a Y-axis rotation.
Distances wrap at the loop's total length. Each car starts a little farther along the same loop:

```ts
const pose = carPose(distance + index * roadLength / count)
```

The component advances `distance` by elapsed seconds multiplied by speed, up to 30 updates per second. Speed therefore
does not depend on the screen's refresh rate. The frame delta is capped so a delayed browser tab does not produce a
large jump. The component disconnects its observer and cancels its animation callback when unmounted, and pauses
distance updates while the example is offscreen or the page is hidden. Reduced-motion preferences start it paused;
the reader can explicitly resume it.

This is an **emulation of motion**, not a traffic simulation. Cars turn instantly at corners, keep equal spacing,
and do not overtake or avoid collisions. Changing the car count redistributes them around the loop. Those constraints
keep the mechanism easy to read and leave room for a later experiment with curved roads or traffic lights.

## The complete geometry recipe

Save this next to `CityBlockScene.vue` as `cityBlock.ts`. It uses the same public library import as the component.
The materials are ordinary channels: asphalt, pavement, facades, glass, and car bodies.

<details>
<summary>Show cityBlock.ts — the recipe used by the live example</summary>

<<< ./src/cityBlock.ts

</details>

## Make it your own

Replace the lot records with real data: capacity could control height, ownership could control color, and traffic
volume could control the car count. Or keep it playful—try a single tall tower, delivery vans, or a different palette.
The important split stays the same: **geometry describes the objects; reactive state supplies their changing values**.

Continue with [procedural geometry](/guide/procedural-geometry) for reusable modules and point domains, or return to the
[Scene notebook](/examples/) for future experiments.

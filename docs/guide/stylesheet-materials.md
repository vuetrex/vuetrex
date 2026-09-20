---
title: Stylesheet materials
description: Build reusable material styles, compose inline overrides, and control hover, transparency, and texture ownership.
---

# Stylesheet materials

<script setup>
import MaterialCyberpunkScene from '../examples/src/MaterialCyberpunkScene.vue'
import materialCyberpunkSource from '../examples/src/MaterialCyberpunkScene.vue?raw'
import MaterialStylesScene from '../examples/src/MaterialStylesScene.vue'
import materialStylesSource from '../examples/src/MaterialStylesScene.vue?raw'
import MaterialAlphaScene from '../examples/src/MaterialAlphaScene.vue'
import materialAlphaSource from '../examples/src/MaterialAlphaScene.vue?raw'
import MaterialHoverScene from '../examples/src/MaterialHoverScene.vue'
import materialHoverSource from '../examples/src/MaterialHoverScene.vue?raw'
</script>

## Precision foundry

A procedural reactor wrapped in ten material channels: satin metal, etched graphite, a matte plinth, a textured nonmetallic platform, ceramic
inlays, copper trim, a glazed faceted core, a steel cage, tinted glass, and a subtly lit instrument display.
Studio reflections, neutral lighting, and a mirrored floor reveal the differences in roughness and metalness. Compare graphite/copper,
porcelain/navy, and olive/brass palettes, adjust the instrument light and glass opacity, or reveal the core's
wireframe. Adjust **Surface relief** to compare the platform's smooth and textured finishes.
Open **Source** for the complete example, with commented sections for controls, texture artwork, geometry, and materials.

<ClientOnly>
  <ExampleTabs title="Precision foundry · procedural material study" :source="materialCyberpunkSource">
    <MaterialCyberpunkScene />
  </ExampleTabs>
</ClientOnly>

The geometry graph is created once. Its `.material('circuits')` calls assign **procedural channel keys**.
The surrounding `VxStyleSheet` supplies matching named materials. Explicit `:materials` bindings on `vx-geometry`
can override or remap individual channels. Palette and finish changes update materials without recompiling geometry.

| Surface | Material techniques |
| --- | --- |
| Foundry platform | Nonmetallic cast-stone finish, high roughness, and adjustable grayscale bump map |
| Armor and circuits | Satin metal, subtle roughness/normal maps, etched color map, and restrained emissive map |
| Ceramic, trim, and core | Contrasting metalness and roughness, tone mapping, and flat shading |
| Steel cage | Wireframe with a non-emissive metallic finish |
| Glass | Explicit `alphaMode: 'blend'`, adjustable opacity, double-sided rendering, and `depthWrite: false` |
| Instrument display | Restrained emission and explicit `alphaMode: 'mask'` with an alpha map and cutoff |

Only the instruments and circuit details use a little emission; the other surfaces respond to the scene lights.
The example creates an HDR studio environment with broad light panels so polished metals have something to reflect.
Turn off **Studio reflections** to compare: changing metalness alone cannot create those surrounding reflections.
Ceramic stays rough and nonmetallic; the trim is polished metal, while the core has a smooth glazed finish.
`flatShading` controls the core's faceted normals, not its roughness or metalness.
The glass is tinted alpha blending, not refractive glass. Color and emissive textures use sRGB; roughness, normal,
bump, alpha, and HDR environment textures contain linear data. `<vx-environment preset="studio">` owns its generated
texture and restores the previous environment when removed. `<vx-floor finish="mirror">` configures the separate
planar floor reflection. `useCanvasTexture()` owns the surface textures; the example supplies only their artwork.

### Compare surface relief

The broad platform under the reactor uses `metalness: 0` and `roughness: 0.86`. Small armor pieces and trim
retain their metal finishes. The separate mirrored scene floor is unchanged.

Set **Surface relief** to **0**, then increase it toward **1** and orbit the scene. The default **0.35**
adds a fine, restrained grain without the coarse relief of the earlier example.

The example's `surfaceHeight()` function paints grayscale height data into a texture with `purpose: 'bump'`.
Bind it as `bumpMap` and adjust `bumpScale` to control the effect. The slider changes a material uniform;
it does not redraw the texture or rebuild geometry. All texture artwork is included in **Source**.

```ts
const platform = computed(() => finishes.matteCeramic({
  color: '#747e83', roughness: 0.86, metalness: 0,
  bumpMap: maps.relief.value, bumpScale: surfaceRelief.value,
}))
```

`bumpScale` defaults to **1**, which can be strong; start small and tune for your scene's dimensions and texture
frequency. Zero flattens the effect and negative values invert the relief. Bump maps affect lighting, not silhouettes
or geometric shadows. `normalMap` takes precedence if both maps are present; set it to `null` to use a bump map
inherited alongside a normal map. Height textures are linear data, not sRGB, and remain caller-owned.

## Declare scene appearance

Put one declaration of each kind anywhere inside the scene. These hosts configure the stage without taking up
layout space. Changes are reactive; removing a prop restores its declaration default, and removing the declaration
restores the configuration it replaced. Two declarations of the same kind in one scene are an error.

```vue
<Vuetrex>
  <vx-environment preset="studio" :intensity="0.55" :rotation="0" />
  <vx-camera :direction="[8, 6, 11]" fit="content" :padding="0.75" :duration="0.6" />
  <vx-floor finish="mirror" :color="0x646b70" :reflection="0.6" />
  <vx-geometry :graph="foundry" />
</Vuetrex>
```

`direction` is an orbit heading, not a fixed camera position: Vuetrex fits the camera distance to the content.
Its Y component must be nonnegative. `rotation` turns the environment around Y in radians. The environment affects
lighting and reflections independently of the visible background. Setting `enabled` to `false` removes it temporarily.
You may supply a Three.js environment `texture` instead; it takes precedence over the preset and stays caller-owned.

Floor `finish` is `matte` or `mirror`. `reflection` runs from 0 to 1 (default 0.6); higher means more reflection.
Floor grid and captions default to off in a declaration and can be enabled with `:grid="true"` and `:captions="true"`.
Configure scene shadows through `<Vuetrex :settings="{ shadows: true }">`.

## Use finish helpers and named styles

Finish helpers return ordinary, independent material descriptors. Their defaults are starting points; every property
can be overridden. They allocate no GPU resources. Available finishes are `satinMetal`, `polishedMetal`,
`matteCeramic`, `glazedCeramic`, and `tintedGlass` (alpha blending, not refraction).

```ts
import { defineVxStyleSheet, finishes } from '@exceeder/vuetrex'

const sheet = defineVxStyleSheet({
  common: {
    materials: {
      metal: { base: finishes.satinMetal() },
      trim: {
        extends: 'metal',
        base: { color: '#b88357', roughness: 0.22 },
        hover: { emissive: '#493020', transition: 0.2 },
      },
    },
  },
  dark: { materials: { trim: { base: { color: '#d2a475' } } } },
})
```

```vue
<VxStyleSheet :sheets="[sheet]" scheme="dark">
  <Vuetrex>
    <vx-box material="trim" />
    <vx-box :material="{ preset: 'trim', roughness: 0.4 }" />
    <vx-geometry :graph="graph" :materials="{ rail: 'trim' }" />
  </Vuetrex>
</VxStyleSheet>
```

Import `VxStyleSheet` as a Vue component. It provides styles to one or more descendant `Vuetrex` scenes without a DOM
wrapper. The nearest provider supplies a scene's styles. `scheme` accepts `light` (default), `dark`, or `system`;
`system` responds to the browser color preference. Each sheet's `common` layer is applied before its selected scheme;
later sheets win field by field. Removed definitions and fields are resolved afresh. Unknown names and inheritance
cycles report errors rather than silently changing appearance.

An `extends` chain supplies base and hover layers before local fields. Inline values take precedence over named base
styles, and inline `hover` overrides named hover fields. Hover remains supported on fixed shapes and panels; named
hover variants are not applied to individual instances or procedural records.

A procedural channel uses an explicit `:materials` entry first, then a same-named style if available, then its base
material. Instance and procedural material updates now restore defaults and invalidate shader programs when maps or
flags change. Thin lines support color (multiplied by record color), opacity/alpha cutoff, color map, depth test/write,
and tone mapping; lighting, metalness, roughness, normal/bump/emissive/alpha maps, and hover do not apply to thin lines.

## Manage generated textures

Use `useCanvasTexture()` in component setup. Vuetrex creates the texture after mounting, redraws when reactive values
read by the paint callback change, and disposes it after child consumers unmount. The returned readonly ref starts at
`null`; redraws preserve texture identity. Color and emissive purposes use sRGB; all data purposes stay linear.

```ts
import { computed, ref } from 'vue'
import { finishes, useCanvasTexture } from '@exceeder/vuetrex'

const stripeColor = ref('#b88357')
const stripes = useCanvasTexture(ctx => {
  ctx.fillStyle = '#72787b'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = stripeColor.value
  for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 128, 2)
}, { width: 128, height: 128, purpose: 'color' })

const material = computed(() => finishes.satinMetal({ map: stripes.value }))
```

The texture belongs to the component calling the helper. Share it only with consumers that do not outlive that
component. Externally created textures still belong to their caller; material bindings never dispose them.

## Material descriptors

Vuetrex separates an object's geometry from its appearance. A material descriptor is a plain object describing color,
roughness, textures, and other surface properties. Keep these objects in a shared module to give your scenes a
consistent visual language.

Inline descriptors remain useful for local overrides. The same complete material resolution is used by fixed shapes,
panels, instances, and procedural channels. The following examples focus on inline styles and fixed-shape hover.

## Create reusable styles

Put shared appearance choices in a module such as `sceneStyles.ts`:

```ts
import type { VxHoverProps, VxMaterialProps } from '@exceeder/vuetrex'

export const surface = Object.freeze({
  color: 0x336699,
  roughness: 0.65,
  metalness: 0.1,
} satisfies VxMaterialProps)

export const attention = Object.freeze({
  color: 0xd88b35,
  emissive: 0x402000,
  emissiveIntensity: 0.3,
} satisfies VxMaterialProps)

export const surfaceHover = Object.freeze({
  emissive: 0x336699,
  emissiveIntensity: 0.45,
  scale: 1.04,
  transition: 0.18,
} satisfies VxHoverProps)
```

The freezes are optional. Vuetrex reads descriptors without modifying them. Two nodes can use the same descriptor
and hover object: each owns its own Three.js material and animation state, so hovering one does not change the other.

## Apply styles and compose overrides

Spread the shared descriptor into a reactive value when an object needs a local variation:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, type VxMaterialProps } from '@exceeder/vuetrex'
import { attention, surface, surfaceHover } from './sceneStyles.js'

const needsAttention = ref(false)
const useCustomMaterial = ref(true)

const material = computed<VxMaterialProps | undefined>(() => {
  if (!useCustomMaterial.value) return undefined
  return {
    ...surface,
    ...(needsAttention.value ? attention : {}),
  }
})
</script>

<template>
  <button @click="needsAttention = !needsAttention">Toggle attention</button>
  <button @click="useCustomMaterial = !useCustomMaterial">Toggle custom material</button>
  <Vuetrex>
    <vx-row>
      <vx-box :material="material" :hover="surfaceHover" />
      <vx-panel :material="surface" :hover="surfaceHover" />
    </vx-row>
  </Vuetrex>
</template>
```

Later object spreads win. When attention is turned off, its emissive fields disappear from the descriptor and return
to their defaults. When the whole material becomes `undefined`, the node returns to the stage's construction defaults.
These appearance updates retain the existing material and geometry.

If the node is hovered, the active hover descriptor is applied after its base material. In this example, the hover's
emissive values take precedence over `attention` until the pointer leaves.

### Try composing and removing overrides

Change the left box to **Attention override**, then back to **Shared surface**. Toggle wireframe on and off to
remove a single field, or choose **Stage defaults** to set the entire binding to `undefined`. The two reference
boxes stay unchanged. Open **Source** to copy the complete example.

<ClientOnly>
  <ExampleTabs title="Shared styles and default restoration" :source="materialStylesSource">
    <MaterialStylesScene />
  </ExampleTabs>
</ClientOnly>

## Understand defaults and removal

For fixed shapes and panels, resolution follows this order:

```text
Three.js defaults → stage construction defaults → named style → inline material → active hover
```

The stage currently supplies its main element color, roughness `0.3`, and metalness `0.1`. Other standard defaults
include opacity `1`, black emissive, emissive intensity `1`, front-side rendering, and enabled depth testing, depth
writing, and tone mapping. Texture slots start empty unless supplied by the stage.

| Value or change | Result |
| --- | --- |
| Omit or delete a field | Restore that field from the lower-priority layer |
| Set a field to `undefined` | Fall through to the lower-priority layer |
| Set a texture field to `null` | Clear that texture slot explicitly |
| Set `material` to `undefined` | Restore the full stage-default base appearance |
| Remove `hover` while hovered | Restore the current base appearance immediately |

Changing descriptors during an animation cancels the animation and immediately applies the newest resolved state.
Leaving hover always restores the current base material, including changes made while hovered.

## Choose opacity and alpha behavior

An opacity below `1` automatically enables blending when no explicit mode is supplied:

```vue
<vx-panel :material="{ color: '#336699', opacity: 0.6 }" />
```

Use `alphaMode` when you want an explicit policy:

| Mode | Behavior |
| --- | --- |
| `opaque` | Disable blending and alpha cutoff |
| `blend` | Blend using opacity and texture alpha; no alpha cutoff |
| `mask` | Discard fragments below `alphaTest`, which defaults to `0.5` |

With no explicit mode, a positive `alphaTest` selects masking; otherwise opacity below `1` selects blending;
otherwise the material is opaque. Explicit modes override inference.

Blending keeps `depthWrite: true` by default to preserve existing scene behavior. Set it to `false` when a translucent
surface should not prevent later surfaces from drawing through it:

```vue
<vx-panel :material="{ opacity: 0.4, alphaMode: 'blend', depthWrite: false }" />
```

The former inline `transparent` field has been removed. Replace `transparent: true` with `alphaMode: 'blend'` and
`transparent: false` with `alphaMode: 'opaque'`.

### Compare the three alpha modes

The same generated texture has repeated transparent-to-opaque stripes. Adjust opacity and mask cutoff, then clear
the texture. Explicit opaque mode stays solid; blend shows partial transparency; mask keeps or discards fragments.
At an opacity below the mask cutoff, the masked box disappears entirely—this is the cutoff working as intended.

<ClientOnly>
  <ExampleTabs title="Opaque, blend, and mask" :source="materialAlphaSource">
    <MaterialAlphaScene />
  </ExampleTabs>
</ClientOnly>

## Add hover feedback

Hover accepts every material field, plus `scale` and `transition`:

```vue
<vx-box
  :material="{ color: 'steelblue', roughness: 0.6 }"
  :hover="{ color: 'lightskyblue', roughness: 0.3, scale: 1.05, transition: 0.2 }"
/>
```

Colors and numeric values interpolate. Texture references and flags such as `wireframe` or `side` switch immediately.
`scale` multiplies the object's base scale. The default duration is `0.18` seconds; use `0` for an immediate change.
Rapid pointer entry and exit cancel earlier transitions. A fade back to an opaque material keeps blending enabled
until the opacity transition finishes. Removing a node cancels its transitions and disposes its owned material.

### Try independent hover transitions

Move the pointer over the box and panel. Both use the same base and hover descriptors but highlight independently.
Choose a longer transition and move in and out rapidly to see cancellation and restoration. The controls can also
turn off hover styling or make changes immediate.

<ClientOnly>
  <ExampleTabs title="Shared hover styles, independent objects" :source="materialHoverSource">
    <MaterialHoverScene />
  </ExampleTabs>
</ClientOnly>

## Own your textures

Supported slots are `map`, `normalMap`, `bumpMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, and `alphaMap`. Supply Three.js
textures you own. For example, this setup creates a small color texture after mounting:

```ts
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { VxMaterialProps } from '@exceeder/vuetrex'

const texture = shallowRef<CanvasTexture | null>(null)

onMounted(() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d')!
  context.fillStyle = '#e4edf5'
  context.fillRect(0, 0, 32, 32)
  context.fillStyle = '#336699'
  context.fillRect(0, 0, 16, 16)
  const created = new CanvasTexture(canvas)
  created.colorSpace = SRGBColorSpace
  texture.value = created
})

const texturedMaterial = computed<VxMaterialProps>(() => ({
  color: 0xffffff,
  map: texture.value,
  roughness: 0.8,
}))

onBeforeUnmount(() => texture.value?.dispose())
```

Bind `texturedMaterial` to a shape or panel's `material` prop. Color textures use `SRGBColorSpace`; data textures such
as normal and roughness maps keep their data color space. Setting a slot to `null` clears the map without disposing
it. If your application replaces a texture, dispose the old one once no other consumer uses it. Hover textures follow
the same ownership rule. Vuetrex never disposes caller-provided textures.

## Inspect a resolved descriptor

For custom integrations or debugging, the public pure resolver accepts layers in increasing priority order:

```ts
import { resolveMaterial, type VxResolvedMaterial } from '@exceeder/vuetrex'

const resolved: VxResolvedMaterial = resolveMaterial(
  { color: 0x336699, roughness: 0.65 },
  { opacity: 0.5 },
)

console.log(resolved.alphaMode) // 'blend'
console.log(resolved.roughness) // 0.65
```

The result contains every supported field, uses frozen linear RGB tuples for colors, and retains borrowed texture
references. It allocates no GPU resources. It uses Three.js defaults unless you supply another defaults layer; it
cannot look up a stage or a named style. A resolved descriptor is a realization value, not an inline `material` prop.

See the [material API reference](/api/#materials-and-hover) for every field. Complete reset behavior applies to fixed
shapes, panels, instances, and procedural channels. Hover is supported on fixed shapes and panels. Selected/disabled
variants, selectors, shader families, and material caches remain outside this API.

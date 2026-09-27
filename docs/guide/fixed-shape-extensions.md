---
title: Fixed-shape extensions
description: Build a custom fixed mesh through the supported package entry point.
---

# Fixed-shape extensions

Use `MeshNode` for a fixed shape with one mesh and one standard material. Compose
multiple visual parts with Vue components and groups; use the geometry graph for
repeated, data-driven geometry.

Import extension APIs from `@exceeder/vuetrex`. No imports from `src/`, `dist_types/`,
or other package internals are needed.

## Define and register a shape

```ts
import { MeshNode, type MeshNodeStage, type ElementRegistry } from '@exceeder/vuetrex'
import { BoxGeometry, Mesh } from 'three'

export class CustomBrick extends MeshNode {
  protected override readonly supportsDepth = true

  constructor(stage: MeshNodeStage) { super(stage) }

  modelGen() {
    const depth = this.state.depth
    return (height: number, size: number) => {
      const scale = this.getScale()
      const geometry = new BoxGeometry(size * scale, height, (depth || size) * scale)
      return new Mesh(geometry, this.material)
    }
  }
}

export const elements = { 'vx-custom-brick': CustomBrick } satisfies ElementRegistry
```

```vue
<script setup lang="ts">
import { Vuetrex } from '@exceeder/vuetrex'
import { elements } from './CustomBrick.js'
</script>

<template>
  <Vuetrex :elements="elements">
    <vx-custom-brick :size="1.2" :height="0.3" :depth="0.8"
      :material="{ color: 0x55aadd, roughness: 0.6 }" />
  </Vuetrex>
</template>
```

## Shared compiler and runtime registration

For custom elements, declare their names once in a lightweight shared module:

```ts
// elements.config.ts — no shape constructors or browser code here
import { createElementConfig } from '@exceeder/vuetrex/compiler'
export const sceneElements = createElementConfig(['vx-custom-brick'])
```

Use its predicate in Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { sceneElements } from './elements.config.js'

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: {
    isCustomElement: sceneElements.isCustomElement,
  } } })],
})
```

Bind the implementation in application code:

```ts
import { sceneElements } from './elements.config.js'
import { CustomBrick } from './CustomBrick.js'
export const elements = sceneElements.defineElements({ 'vx-custom-brick': CustomBrick })
```

Pass `elements` to `<Vuetrex :elements="elements">` as above. The helper accepts both
class constructors and functional `{ setup(stage) }` implementations. Missing or extra
bindings are rejected by TypeScript and checked at runtime. Tag names must be unique,
lowercase kebab-case; use a literal list to retain precise TypeScript checking.

Built-in renderer tags are always recognized; do not list them unless intentionally
providing a runtime override. Vue components such as `Vuetrex` and `vx-stylesheet`
remain normal components. Unknown tags are not automatically claimed by a `vx-` prefix.
Separate configurations stay isolated and the helper does not register anything globally.

The `/compiler` entry point has no runtime Vue, Three.js, DOM, or renderer dependencies.
Keep shape implementations in a separate module so importing configuration in Node
never evaluates application rendering code. The helper is also exported from the package
root for application use; prefer `/compiler` in build configuration.

Compilation and runtime creation remain separate phases: changing `elements` or calling
`registerElement()` in the browser cannot recompile an already-built Vue template.
Restart/rebuild when the shared tag list changes. Existing manual predicates and runtime
registries continue to work. For global registration, bind through `defineElements()`
then call `registerElement(tag, implementation)` for each entry before mounting scenes.
For other web components, compose your predicate explicitly:
`tag => sceneElements.isCustomElement(tag) || otherCustomElementCheck(tag)`.

## Supported subclass contract

| Surface | Contract |
| --- | --- |
| `MeshNodeStage` | Constructor context passed to `super(stage)`; not a promise that every concrete stage method is an extension hook |
| `modelGen()` | Returns a factory `(height, size) => THREE.Mesh`; create fresh geometry each time the factory runs |
| `state` / `MeshState` | Protected reactive shape inputs, including size, height, depth, labels, and material binding; geometry inputs read during generation are tracked |
| `material` | Reuse this node-owned `MeshStandardMaterial` on the returned mesh |
| `supportsDepth` | Set to `true` when the shape honors positive depth; zero falls back to size |
| `getScale()` | Existing scalar geometry sizing convention: apply to horizontal size/depth as in the example; height is passed separately |
| `intrinsicSize()` | Override only when the declared size/height/depth do not describe the shape's layout footprint |
| `renderOffset()` | Default raises centered geometry by half the declared height so its base rests on the layout plane |

Center the geometry around its local origin, including Y. Do not apply the
base offset twice. Group placement and scale are applied through the scene
hierarchy; do not bake group world matrices into the geometry.

Material-only changes reuse geometry. Geometry dependencies can cause replacement;
do not rely on a mesh retaining its identity. The base handles captions, labels,
hover, events, shadows, and synchronization. Fixed meshes accept declaration children
(such as ports), not visual children.

Prefer inheriting `syncWithThree()` and `onRemoved()`. Advanced overrides must call
`super`, make installation and teardown idempotent, and avoid changing a reactive
dependency from the effect that consumes it. Other implementation fields and
watcher scheduling details are not part of this supported extension contract.

## Resource ownership

- Returning the mesh transfers ownership of its geometry to `MeshNode`. Geometry
  is disposed on replacement and unmount. Clone borrowed/shared geometry first;
  do not return the same cached geometry from multiple generations or nodes.
- Use `this.material`. It survives geometry replacement and is disposed once on
  unmount. Do not dispose it yourself or substitute a material array or a separate
  material: those are outside this single-material contract.
- Material textures are borrowed. Their creator owns disposal; disposing the node
  does not dispose supplied textures. `useCanvasTexture()` provides a convenient
  component-owned texture with automatic cleanup.
- Extra textures, render targets, child meshes, listeners, watchers, timers, and
  GSAP animations created by an extension remain its responsibility. The base does
  not recursively dispose arbitrary custom children. Release per-generation
  resources before replacement and remaining resources during idempotent teardown.
- Prefer a Vue component composing mesh nodes when a shape needs independently
  owned parts or complicated per-generation resources.

## Examples and verification

Workshop2's rounded plinth uses this public surface through the repository's source
entry point. The packaged example is `test/esm-module/CustomBrick.ts` with its Vue
usage in `TestApp.vue`. `pnpm build` followed by `pnpm test:esm-project` packs the
library, extracts it into a temporary consumer, typechecks the custom subclass
with NodeNext resolution, and bundles the Vue example without repository aliases.
The consumer build verifies imports and packaging; it is not a browser rendering test.

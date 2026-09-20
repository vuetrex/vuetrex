---
title: Vuetrex Stylesheet and Material System
description: Implementation plan for reactive named materials, scene themes, appearance states, and CSS-like cascading in Vue.
outline: deep
---

# Vuetrex Stylesheet and Material System Implementation Plan

**Status:** First material milestone implemented on 2026-09-18. The explicitly requested foundry API milestone was completed on 2026-09-19; broader scene theming, interaction states, and remaining phases stay deferred.

**Goal:** Separate visual design from scene and geometry logic by introducing a Vue-native `VxStyleSheet`. Applications
and reusable geometry libraries name semantic material roles; a reactive stylesheet decides how those roles look in
light, dark, or system color schemes. The same material resolver must serve traditional mesh nodes, panels,
`vx-instances`, procedural geometry channels, and interaction states.

**Core architectural choice:** The first version is CSS-like in cascade, inheritance, named roles, and state overrides,
but it does not implement a general CSS selector language. Styles are typed JavaScript objects composed through Vue.
Geometry continues to emit semantic names such as `plant.bark`; it never imports a theme or owns a Three.js material.

**Tech stack:** TypeScript, Vue 3 provide/inject and reactivity, Vuetrex's custom renderer, Three.js materials and
textures, GSAP transitions, Vitest, and VitePress.

---

## Foundry API milestone — 2026-09-19

Implemented after the user's explicit request to turn the foundry's infrastructure into reusable library APIs.

- `vx-environment`, `vx-camera`, and `vx-floor` are lifecycle-only `StageDeclaration` hosts. Each kind has one
  owner per scene; duplicates error rather than depend on traversal order. Props update reactively, removed fields
  restore declaration defaults, and unmount restores captured stage configuration. Camera heading retains automatic
  bounds fitting; floor replacement disposes the old resources. Hidden caption records remain available for re-enabling.
- Studio generation lives in `scene/studio.ts`; its texture is owned, retained while disabled, disposed on replacement
  by borrowed input or unmount. Borrowed textures are never disposed. Rotation/intensity are independent of background.
- `finishes` provides independent plain descriptors for satin/polished metal, matte/glazed ceramic, and tinted glass.
  `useCanvasTexture` owns creation, correct color space, in-place reactive repaint, and teardown. Artwork stays in apps.
- `defineVxStyleSheet` and `VxStyleSheet` implement common/light/dark material layers, system scheme selection, named
  inheritance, inline preset overrides, and named hover for fixed shapes/panels. Unknown names and cycles are errors.
  No scene-style provider fields, selected/disabled states, selectors, caches, or shader families were introduced.
- MeshNode/Panel resolve named layers before their existing controllers. InstanceNode and procedural base/channel
  materials now use construction-default controllers; texture removal compares previous shader state before updating.
  Channels retain independent materials, keyed geometry, and record-color multiplication. Thin-line capability limits
  are documented explicitly; batch/per-record hover is not added.
- The foundry now uses declarations, finish helpers, and a named sheet. Its scene component is 84 lines, with geometry
  and texture artwork in two small modules exposed alongside the live example. Shapes and placements are preserved;
  old color-specific channel keys became `ceramic` and `trim`.
- Public package paths now match emitted ESM/declaration files. The build copies authored declaration files and rewrites
  repo aliases to relative imports. The consumer check packs a real tarball, extracts it outside the repository, runs
  strict TypeScript with library checks, and builds the Vue consumer. Dependency installation remains out of that test.
- Preserved concurrent studio, stage-lighting, lockfile, and reflector edits. No reflector shader changes were made by
  this milestone.

Verification: **17 focused regressions passed**; library and example typechecks, library build, packed TypeScript/ESM
consumer, and VitePress build passed. Full suite: **268 passed, 1 failed**. The remaining reflector shader assertion
(`verify-stage.spec.ts:141`) was already failing at baseline. Baseline was 253 passed/3 failed in the sandbox; the two
HTTP tests passed in the final run with local listeners enabled. Existing bundle-size warnings remain.

Next handoff: consider provider-owned scene/light defaults separately from material lookup, and define selected/disabled
and per-record interaction semantics before extending those APIs. Do not silently broaden thin-line material support.
Studio presets can evolve without changing material descriptors; add further presets only for concrete examples.
The remainder of the original proposal below is a roadmap, not a claim that all its types are implemented.

---

## Milestone 1: complete descriptors and shared material ownership

**Scope completed:** `styling/types.ts`, `styling/resolveMaterial.ts`, `styling/MaterialController.ts`, the real
low-level applier in `nodes/material.ts`, MeshNode and Panel integration, direct import/API consumer migration,
regressions, API/architecture documentation, the [stylesheet materials guide](/guide/stylesheet-materials), and
package-consumer coverage. No compatibility exports or shims.

### Findings against current code

The old ownership allegations below were stale: Box, Cylinder, and Wedge already allocate one material in MeshNode;
MeshNode already disposes replaced geometry and its final material. Their existing lifecycle tests passed before
implementation. No shape generators, scene/stage code, or reflector experiments needed modification. Property removal,
undefined bindings, duplicated/incomplete hover support, uncancelled emissive/scale transitions, and repeated cleanup
still needed coverage or fixes. The working tree was clean at the initial inspection.

### Contract decisions

- Public inline descriptors include every standard-material field listed below. `resolveMaterial(...layers)` merges
  low-to-high priority descriptors and returns a complete frozen value with frozen linear RGB color tuples.
  Undefined falls through and null clears a texture. There is no preset lookup in this milestone.
- MeshNode/Panel capture stage-created defaults once; each binding update resolves afresh against those defaults.
  The public resolver alone uses Three.js defaults. Stage defaults currently set main color, roughness 0.3, metalness 0.1.
- `alphaMode` replaces `transparent` outright. Explicit opaque/blend/mask wins; otherwise positive alphaTest infers mask,
  opacity below 1 infers blend, and the rest is opaque. Mask cutoff defaults to 0.5; other modes use zero. Blending
  preserves depthWrite=true by default, matching the demos' existing depth behavior. Both affected demos were migrated.
- The internal controller takes exclusive ownership of a freshly created material and accepts ordered descriptor
  layers plus hover. Every node retains its material identity across geometry and appearance changes. No cache/cloning
  scheme or material-family switching is needed for the single supported standard-material family.
- Hover numeric fields/colors interpolate; flags/textures change immediately. A fade back to opaque keeps blending
  until completion. Pointer interruptions cancel all owned tweens; prop edits/removal settle the latest resolved
  appearance immediately. Hover scale multiplies the captured base transform. Geometry replacement cancels detached
  transform tweens and applies current hover to the replacement. Repeated disposal is a no-op.
- Texture references stay borrowed, including hover textures. Vue proxies are unwrapped at application; no texture
  is frozen, cloned, or disposed. Independent nodes own independent mutable material/transition state.
- Instance/procedural callers were migrated only to the new types and complete low-level applier. Their existing
  layer/lifecycle semantics remain for the later controller integration; no channel rebatching or graph work was added.

### Verification

- Focused material, node, hover, mesh-lifecycle, and panel regressions: **28 passed**. Legacy hover tests now exercise
  real GSAP transitions and observable restoration/cancellation, replacing a mock that asserted implementation calls.
- Typecheck, package build, ESM consumer build, and VitePress docs build pass. The ESM fixture imports the public
  resolver and exercises migrated inline alpha/color/hover props. Build output retains the existing chunk-size warning.
- Final full suite: **255 passed, 1 failed**. The remaining failure is the pre-existing reflector shader-composition
  assertion in `verify-stage.spec.ts:141`. The untouched sandbox baseline was 237 passed and three failures: the same
  reflector assertion plus two health-server local-port restrictions. Both health-server tests pass when the final
  suite runs with local HTTP listeners allowed. No material regressions remain.
- Visually inspected the component demo, Kubernetes panels/translucent platform, and health demo's light/dark textured
  platforms in the browser. No browser console errors were reported; hover interruption is covered by deterministic
  real-tween regression tests. Restored the health demo's original light theme after inspection.
- Used Node 26.7.0 and installed pnpm 11.9.0 with `--pm-on-fail=ignore --config.verifyDepsBeforeRun=false`; fetching the
  pinned pnpm 12.4.1 was unavailable. Ran package build and `pnpm ... exec vitepress build docs` separately because
  nested pnpm invocation in `docs:build` otherwise attempted the unavailable package-manager download.
- Packaging limitation verified as pre-existing: `package.json` points its type export at `dist_types/vuetrex.d.ts`,
  while the build emits `dist_types/src/lib-components/index.d.ts` with repository aliases. Runtime ESM consumption
  passes, but standalone package declaration consumption needs a separate packaging fix. No package metadata or
  unrelated declaration pipeline changes were included here.

### Next-milestone handoff

Start with provider/registry semantics and named inheritance, feeding ordered descriptor layers into the pure resolver.
Keep stage-default revisions separate from graph/topology work. Then integrate InstanceNode and GeometryRealizer with
controller ownership and complete reset baselines, preserving per-record color multiplication and keyed batches.
Define thin-line supported properties explicitly, and repair the existing package declaration entry before publishing.
Selected/disabled precedence, shader families, caching, scopes,
and selectors are not implemented here. Do not automatically continue the remaining tasks after this milestone.

---

## Motivation

Vuetrex currently exposes a useful but small `VxMaterialProps` object. It is applied through several runtime paths:

- `MeshNode` gives Box, Cylinder, and Wedge an individual `MeshStandardMaterial` and hover animation.
- `Panel` repeats similar material and hover behavior in its own implementation.
- `InstanceNode` has one shared standard material plus per-instance color.
- `GeometryNode` has a base material, cloned named channel materials, and per-record colors.
- Thin procedural lines use `LineBasicMaterial` and support only the common color/alpha subset.
- Display walls, connectors, the floor, and diagnostics own specialized internal materials.

The procedural channel model is already the correct separation point: `geo.material(source, 'plant.foliage')` assigns
meaning, and the output node assigns appearance. The stylesheet extends that separation across the complete scene.

Historical findings from the original proposal (see the verified milestone findings above):

1. Material props are currently incremental. Removing a field does not restore its default value.
2. Traditional shapes create more than one material during construction and do not dispose the surviving material on
   removal.
3. `MeshNode` geometry replacement removes old meshes without consistently disposing generated geometry.
4. Hover behavior is duplicated between `MeshNode` and `Panel` and supports different subsets of the public contract.
5. Opacity requires callers to coordinate `opacity` and `transparent` manually.
6. Procedural thin lines silently ignore standard-material properties that they cannot render.

The stylesheet must be built on complete, resettable material descriptors rather than preserving these incremental
semantics.

---

## Desired author experience

### Install a reactive stylesheet around one or more scenes

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Vuetrex, VxStyleSheet } from '@exceeder/vuetrex'
import { vuetrexDefaults } from './styles/vuetrex.js'
import { plantStyles } from './styles/plant.js'
import { applicationStyles } from './styles/application.js'

const scheme = ref<'light' | 'dark' | 'system'>('system')
</script>

<template>
  <VxStyleSheet
    :sheets="[vuetrexDefaults, plantStyles, applicationStyles]"
    :scheme="scheme"
  >
    <Vuetrex :settings="{ shadows: true }">
      <vx-box material="surface.panel" />
      <vx-geometry :graph="plantGeometry" anchor="base" />
    </Vuetrex>
  </VxStyleSheet>
</template>
```

`VxStyleSheet` is an ordinary non-rendering Vue provider. Several Vuetrex scenes may consume the same provider. A
scheme change updates their existing materials, floor, environment, and lights without remounting either the Vue scene
or the procedural geometry graph.

### Define light and dark appearances outside scene logic

```ts
import { defineVxStyleSheet } from '@exceeder/vuetrex'

export const plantStyles = defineVxStyleSheet({
  light: {
    scene: {
      backgroundColor: 0xefefef,
      floorColor: 0xc5c5c5,
    },
    materials: {
      'plant.bark': {
        base: { color: 0x656545, roughness: 0.92 },
      },
      'plant.foliage': {
        base: { color: 0x88a878, roughness: 0.68 },
        hover: { emissive: 0x315a28, emissiveIntensity: 0.35 },
      },
    },
  },
  dark: {
    scene: {
      backgroundColor: 0x16191d,
      floorColor: 0x24292f,
    },
    materials: {
      'plant.bark': {
        base: { color: 0x766b4a, roughness: 0.9 },
      },
      'plant.foliage': {
        base: { color: 0x709769, roughness: 0.72 },
        hover: { emissive: 0x4b8142, emissiveIntensity: 0.5 },
      },
    },
  },
})
```

### Keep reusable geometry style-independent

```ts
const plant = geo.join([
  geo.material(trunk, 'plant.bark'),
  geo.material(leaves, 'plant.foliage'),
])
```

An application may use the channel names directly from the active stylesheet or remap them locally:

```vue
<vx-geometry
  :graph="plant"
  :materials="{
    'plant.bark': 'winter.bark',
    'plant.foliage': 'winter.foliage',
  }"
/>
```

Existing inline descriptors remain valid. An inline descriptor may optionally extend a named style:

```vue
<vx-box :material="{ preset: 'surface.panel', roughness: 0.25 }" />
```

Application logic should normally choose a semantic role rather than a color:

```vue
<vx-box :material="service.healthy ? 'status.healthy' : 'status.degraded'" />
```

---

## Styling model

### Public types

The exact names may change during implementation, but the contract should follow this shape:

```ts
type VxColorScheme = 'light' | 'dark' | 'system'

interface VxMaterialProps {
  color?: THREE.ColorRepresentation
  opacity?: number
  alphaMode?: 'opaque' | 'blend' | 'mask'
  alphaTest?: number
  roughness?: number
  metalness?: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  wireframe?: boolean
  side?: THREE.Side
  depthWrite?: boolean
  depthTest?: boolean
  flatShading?: boolean
  toneMapped?: boolean
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  alphaMap?: THREE.Texture | null
  envMapIntensity?: number
}

interface VxMaterialStyle {
  extends?: string
  base?: VxMaterialProps
  hover?: VxMaterialProps & { scale?: number; transition?: number }
  selected?: VxMaterialProps
  disabled?: VxMaterialProps
}

type VxMaterialBinding =
  | string
  | (VxMaterialProps & { preset?: string })

interface VxStyleScheme {
  scene?: VxSceneStyle
  lights?: VxLightingStyle
  materials?: Record<string, VxMaterialStyle>
  defaults?: {
    material?: VxMaterialBinding
    hover?: string
  }
}

interface VxStyleSheetDefinition {
  common?: VxStyleScheme
  light?: VxStyleScheme
  dark?: VxStyleScheme
}
```

Numeric colors and direct `VxMaterialProps` objects remain supported. `transparent` is removed; use `alphaMode`.
The provider and named-style types above describe deferred phases and are not exported by milestone 1.

### Cascade order

Scene style resolves in this order, with later layers overriding earlier layers:

```text
Vuetrex built-in defaults
    → each stylesheet's common section
    → each stylesheet's active light/dark section
    → explicit <Vuetrex :settings> values
```

An object's appearance resolves in this order:

```text
resolved scene default material
    → named material and its extends chain
    → node or procedural-channel override
    → per-record or per-instance color multiplier
    → hover / selected / disabled state
```

Stylesheet array order behaves like CSS source order. A material `extends` cycle is an error with an actionable message.
An unknown material name falls back to the scene default and produces a development warning.

### Names and namespaces

Reusable packages should use namespaced semantic roles:

```text
plant.bark
plant.foliage
health.deployment
status.healthy
status.degraded
surface.panel
```

The first version does not implement arbitrary selectors such as `vx-row > vx-box:hover`. Named roles are more
predictable across Vue component boundaries, preserve batching, and are easier to serialize and inspect.

An additive second version may introduce a `VxStyleScope` or `style-scope` property. Lookup would try the nearest scope
before the global name, without requiring a DOM-style selector engine inside the logical 3D tree.

---

## Runtime architecture

### Vue provider

`VxStyleSheet` uses `provide()` to expose a readonly reactive stylesheet context. `Vuetrex` injects that context in its
normal Vue setup before it creates `VuetrexStage`. This fits the existing bridge: Vuetrex already preserves application
`appContext` and `provides` when it renders its slot through the custom renderer.

The provider owns no Three.js resources. It only merges typed definitions, follows the system color-scheme media query,
and exposes a reactive resolved scheme.

### Stage style registry

Each `VuetrexStage` owns a style registry derived from the injected context. The registry exposes:

- the resolved scene style;
- lookup of named material styles;
- monotonically increasing revisions for scene, material, and interaction changes;
- development diagnostics for unresolved names and invalid inheritance;
- subscription hooks used by logical nodes without introducing another reactive framework.

Stage settings supplied directly to `<Vuetrex>` are retained as the final scene-style override. The stage needs an
`applySceneStyle()` path so background, fog, floor, captions, connectors, and lights can update after construction.

### Material resolver

Introduce one pure resolver:

```text
defaults + preset chain + inline override + active state
    → complete VxResolvedMaterial
```

The result contains every supported field. Applying a new result therefore resets removed properties instead of
leaving stale state on a Three.js material.

The resolver classifies changes:

- uniform/property-only changes update the existing material;
- program-affecting changes set `needsUpdate`;
- material-family changes replace the owned material deliberately;
- texture references change without transferring texture ownership.

### Material controller

A shared controller owns one node or batch material binding. It handles:

- applying resolved descriptors;
- state transitions and GSAP cancellation;
- correct restoration when props or schemes change during hover;
- cloning or acquiring cached materials;
- material disposal and cache reference release.

`MeshNode`, `Panel`, `InstanceNode`, and `GeometryRealizer` must use this controller. They must not retain separate copies
of snapshot and hover code.

### Resource ownership and sharing

The stylesheet owns definitions, not textures. Texture ownership stays with the caller unless a later resource loader
explicitly advertises ownership.

Resolved materials without mutable interaction state may be cached by descriptor signature within a stage and
reference-counted. Nodes whose hover animation mutates a material need a local material or a non-mutating instance
attribute strategy. Sharing a mutable material between independently interactive nodes is forbidden.

### Procedural geometry

`geo.material()` continues to store only a channel name. At realization:

1. The output node checks its local `materials` map for a descriptor or remapped name.
2. Otherwise the channel name resolves directly against the stage stylesheet.
3. Otherwise the channel inherits the output node's base material.
4. Records with the same topology and resolved material binding share an instance batch.
5. Per-record color remains a multiplier over the resolved material color.

Material changes must not evaluate the geometry graph or rebuild topology. A channel-name or material-family change may
rebatch records; changing color, roughness, or a texture should update existing materials in place.

Thin lines must no longer silently accept unsupported standard-material fields. The implementation should either expose
a documented `VxLineStyle` subset or emit a development warning while applying the supported color/alpha values.

---

## Implementation tasks

### Task 1: Lock current behavior and fix ownership

**Files:**

- Modify `src/lib-components/nodes/material.ts`
- Modify `src/lib-components/nodes/MeshNode.ts`
- Modify `src/lib-components/nodes/shapes/Box.ts`
- Modify `src/lib-components/nodes/shapes/Cylinder.ts`
- Modify `src/lib-components/nodes/shapes/Wedge.ts`
- Modify `src/lib-components/nodes/Panel.ts`
- Add or update focused tests under `test/unit/`

- [x] Test property removal and restoration to stage defaults.
- [x] Test setting `material` back to `undefined`.
- [x] Ensure each node creates exactly one material.
- [x] Dispose node-owned materials and generated geometries exactly once.
- [x] Preserve caller ownership of textures.
- [x] Cover removal during an active hover transition.

### Task 2: Add complete descriptors and resolution

**Files:**

- Add `src/lib-components/styling/types.ts`
- Add `src/lib-components/styling/resolveMaterial.ts`
- Add `src/lib-components/styling/MaterialController.ts`
- Update `src/lib-components/nodes/material.ts` as the low-level descriptor applier (no compatibility export)
- Update `src/lib-components/index.ts`

- [x] Define complete inline material, hover, and resolved-material types.
- [ ] Define stylesheet, scheme, material-style, and named-material binding types with their provider implementation.
- [x] Replace `transparent` with explicit `alphaMode` and migrate in-repo consumers directly.
- [x] Implement complete default restoration.
- [ ] Detect missing presets and `extends` cycles.
- [x] Classify material changes that require `needsUpdate`.
- [x] Preserve inline material/hover behavior, with the intentional `transparent` → `alphaMode` API change.

### Task 3: Implement the Vue stylesheet provider

**Files:**

- Add `src/lib-components/styling/VxStyleSheet.ts`
- Add `src/lib-components/styling/context.ts`
- Add `src/lib-components/styling/defineVxStyleSheet.ts`
- Modify `src/lib-components/vuetrex.ts`
- Modify `src/lib-components/index.ts`

- [ ] Implement a fragment-only provider component.
- [ ] Accept one sheet or an ordered array of sheets.
- [ ] Support reactive `light`, `dark`, and `system` schemes.
- [ ] Make system-scheme detection safe during server rendering.
- [ ] Inject the resolved context into every enclosed Vuetrex stage.
- [ ] Verify that one provider can theme several scenes.

### Task 4: Make stage styling reactive

**Files:**

- Modify `src/lib-components/three/stage.ts`
- Modify relevant floor, wall, caption, connector, and lighting helpers
- Update stage tests

- [ ] Separate construction-only renderer settings from mutable scene style.
- [ ] Add `applySceneStyle()` without recreating the renderer or scene.
- [ ] Update background, fog, floor, grid, mirror, captions, connectors, and lights in place.
- [ ] Keep explicit `<Vuetrex :settings>` values as highest-priority overrides.
- [ ] Coalesce one scheme change into one render invalidation.

### Task 5: Route every render path through the controller

**Files:**

- Modify `src/lib-components/nodes/MeshNode.ts`
- Modify `src/lib-components/nodes/Panel.ts`
- Modify `src/lib-components/nodes/InstanceNode.ts`
- Modify `src/lib-components/geometry/GeometryNode.ts`
- Modify `src/lib-components/geometry/compiler/realizer.ts`

- [ ] Resolve string material names and inline descriptors consistently.
- [x] Remove duplicated hover code from MeshNode and Panel.
- [ ] Keep instance colors and procedural record colors multiplicative.
- [ ] Update existing procedural channel materials without recompiling geometry.
- [ ] Dispose inactive channel materials and release cached bindings.
- [ ] Give thin lines an explicit supported style contract.

### Task 6: Add appearance states

- [ ] Resolve `base`, `hover`, `selected`, and `disabled` variants from the named style.
- [ ] Preserve existing inline `hover` props as the final hover override.
- [ ] Handle scheme or material changes while a transition is in progress.
- [ ] Use instance attributes for per-instance highlight where possible.
- [ ] Avoid one material clone per generated procedural record.
- [ ] Define precedence when selected and hovered states overlap.

### Task 7: Add optional scoping and library composition

- [ ] Merge ordered stylesheet modules deterministically.
- [ ] Add a constrained `VxStyleScope` or `style-scope` mechanism.
- [ ] Resolve names through nearest scope and then global fallback.
- [ ] Preserve namespace information in diagnostics.
- [ ] Do not add arbitrary CSS selectors in this phase.

### Task 8: Documentation, diagnostics, and package verification

**Files:**

- Update `docs/guide/`
- Update `docs/api/index.md`
- Update `docs/architecture.md`
- Update examples and demo themes
- Update `test/esm-module/`

- [ ] Document stylesheet composition, cascade order, schemes, state precedence, and texture ownership.
- [ ] Add a complete light/dark example that contains ordinary and procedural nodes.
- [ ] Report unresolved presets, line-style mismatches, material counts, and channel-induced batch splits.
- [ ] Validate declarations, ESM consumption, docs build, and production demo build.
- [ ] Visually verify live theme switching, hover transitions, transparency, and textured materials.

---

## Verification strategy

### Unit tests

- Material normalization and complete reset behavior.
- Ordered sheet merging and scheme selection.
- Named inheritance, unknown names, and cycle detection.
- Interaction precedence and interrupted transition restoration.
- Material reference counts, unmounting, and texture non-ownership.
- Procedural channel resolution and material-only updates.
- Explicit thin-line property handling.

### Integration tests

- A stylesheet wraps two Vuetrex scenes and updates both.
- System scheme changes update scene and node appearance without remounting.
- Existing inline material and hover examples continue to work unchanged.
- A geometry graph with several channels preserves topology and instance slots across theme changes.
- An instance batch preserves per-item colors under light and dark base materials.

### Visual checks

- Light/dark contrast for floor, background, labels, connectors, and meshes.
- Transparent material sorting and depth writing.
- Hover while changing schemes.
- Texture swaps and removal.
- Procedural mesh channels beside thin-line channels.
- No material flash during first render or theme transition.

---

## Compatibility and migration

Existing inline descriptors remain valid except for the explicit `transparent` → `alphaMode` change:

```vue
<vx-box :material="{ color: 0x336699, roughness: 0.5 }" />
```

Applications may migrate one semantic role at a time:

```vue
<vx-box material="status.healthy" />
```

Current `:materials` channel objects remain valid. Values are widened to accept names as well as descriptors. The
`transparent` property is removed in favor of `alphaMode`, without a deprecation shim. Texture disposal remains the caller's
responsibility and must not change silently.

---

## Risks and mitigations

### Shared mutable materials

Animating a shared material would change every consumer. Cache only immutable resolved materials, or detach a local
controller before applying mutable interaction state.

### Batch explosion

Every distinct procedural channel or material family can create another draw call. Diagnostics must expose batch splits,
and documentation should recommend a small semantic material vocabulary.

### Theme changes causing structural work

Material and scene-style revisions must stay separate from geometry revisions. Tests must prove that color-scheme
switching does not recreate geometry prototypes or reevaluate stable graphs.

### Vue context across the custom renderer

`Vuetrex` already forwards application context and provides to its slot connector. Test provider injection explicitly so
future renderer refactors cannot silently disconnect stylesheets.

### System scheme and server rendering

Access `matchMedia` only on the client. Use a deterministic fallback scheme during server rendering and reconcile after
mount without rebuilding scene content.

---

## Acceptance criteria

The first stylesheet release is complete when:

1. A `VxStyleSheet` can reactively theme one or more Vuetrex scenes.
2. Light, dark, and system schemes update live without remounting scene nodes or procedural graphs.
3. Named materials work on traditional meshes, panels, instances, and procedural material channels.
4. Geometry modules contain semantic material names but no application colors or theme imports.
5. Ordered stylesheet modules and explicit inline overrides follow a documented deterministic cascade.
6. Removed props restore defaults instead of leaving stale Three.js material state.
7. All node-owned materials and geometry are created and disposed exactly once.
8. Hover, selected, and disabled appearances use one controller and restore correctly after interrupted transitions.
9. Procedural material changes do not rebuild topology, and instance colors continue to work as multipliers.
10. Thin-line limitations are explicit rather than silently ignored.
11. Existing inline `material`, `hover`, and procedural `materials` objects remain source-compatible.
12. Documentation, unit tests, ESM integration, package build, and visual theme checks pass.

---

## Deliberately deferred work

- A general CSS selector parser and DOM-compatible specificity rules.
- Arbitrary user-supplied `THREE.Material` ownership inside the declarative API.
- Shader graph authoring or Blender-style material nodes.
- Automatic texture loading and disposal without an explicit resource API.
- Unlimited per-instance PBR attributes that would require a custom shader pipeline.
- Animated interpolation between unrelated material families.

These features can be added after the named stylesheet, resolver, ownership, and state-layering contracts are stable.

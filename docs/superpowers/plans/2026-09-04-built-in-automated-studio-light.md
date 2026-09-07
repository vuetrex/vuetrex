---
title: Built-in Automated Studio Light
description: Implementation plan for a Vuetrex-owned progressive studio-light module that derives its bake from authored nodes and stage settings.
outline: deep
---

# Built-in Automated Studio Light Implementation Plan

**Status:** Proposed. This document adds no runtime behavior.

**Goal:** Make the health demo's progressive soft lighting available as an opt-in Vuetrex stage feature that can be
enabled with `studioLight: true`. The module must discover suitable casters and receivers from Vuetrex's authored node
tree, derive a studio rig from scene bounds and stage lighting, bake incrementally without flashing, and remain safe
when the scene changes or unmounts.

**Core architectural choice:** Discovery must start from Vuetrex nodes and stage-owned surfaces, not from arbitrary
Three.js traversal, object names, or application geometry constants. Three.js remains the rendering substrate; the
logical Vuetrex tree remains the source of scene semantics and lifecycle.

**Tech stack:** Vue 3 custom renderer, Vuetrex `Base`/`Node` tree, Three.js `ProgressiveLightMap`, WebGL render targets,
Vitest, and browser-based visual regression checks.

---

## Desired author experience

The common case should need one setting:

```vue
<Vuetrex
  :settings="{
    backgroundColor: 0xf3f5f6,
    studioLight: true,
  }"
  @studio-light-status="onStudioLightStatus"
>
  <MyDiagram />
</Vuetrex>
```

Vuetrex should automatically:

1. Wait for the initial Vue-to-Three synchronization to settle.
2. Discover stable authored meshes, panels, instances, display walls, and the generated stage floor.
3. Choose which objects cast, receive, or stay live-only.
4. Allocate useful lightmap space according to receiver size and semantic role.
5. Derive a soft key-light rig from stage bounds, existing stage lights, and the overview direction.
6. Bake a deterministic set of samples over multiple frames.
7. Ease the finished contribution in without exposing a partial lightmap.
8. Retain the current completed lightmap while a replacement bake is running.
9. Dispose every owned GPU resource and restore all borrowed state on cancellation or unmount.

Advanced controls should remain small and art-directed:

```ts
interface VxStudioLightSettings {
  quality?: 'preview' | 'balanced' | 'high'
  preset?: 'soft' | 'balanced' | 'directional'
  direction?: 'auto' | { x: number; y: number; z: number }
  softness?: number        // 0..1, maps to the virtual source's angular radius
  contrast?: number        // relative baked key/fill balance, not renderer exposure
  fadeDuration?: number    // seconds; default 2
  settleDelay?: number     // milliseconds after the last relevant scene change
  rebake?: 'once' | 'static-changes' | 'manual'
  debug?: boolean
}
```

No first-release option should directly expose atlas packing, shadow-camera extents, blend windows, or render-target
formats. Those are implementation details that quality presets can control coherently.

Exceptional components may override automatic classification without configuring the whole bake:

```vue
<vx-panel lighting="receive" />
<vx-instances lighting="cast" />
<animated-custom-node lighting="dynamic" />
<decorative-overlay lighting="ignore" />
```

Proposed override values are `auto`, `cast`, `receive`, `both`, `dynamic`, and `ignore`. `auto` remains the default.

---

## Non-goals for the first built-in version

- Do not make studio lighting the default for existing applications. It is opt-in.
- Do not modify user background, fog, tone-mapping exposure, material colors, or emissive values automatically.
- Do not infer semantics from IDs such as `stage-platform-surface` or ancestor names such as `health-wall`.
- Do not copy or edit Three.js addon source under `three/external/`; wrap the installed addon through its public API.
- Do not promise correct baked receiving on skinned meshes, morph targets, custom shaders, or instanced members.
- Do not rebake for camera orbit, camera fitting, viewport changes, hover animation, or connector animation.
- Do not generalize the health demo's procedural curved-wall contact strip into the first release. The progressive bake
  should provide the physical wall shadow; stylized contact overlays remain an optional later extension.
- Do not block first paint until baking completes. The existing live-lit scene is the fallback at all times.

---

## What can be reused from the health prototype

The prototype in `demo-health/v-ui/lighting/progressiveStudioLight.ts` proves several useful techniques:

- finite running-average accumulation using an increasing blend window;
- a deterministic golden-angle distribution for softbox and ambient samples;
- bounds-derived light distance and orthographic shadow-camera extent;
- explicit `uv1` allocation that gives important horizontal receivers more atlas area;
- hiding incomplete lightmap intensity and easing in only the completed result;
- cancellation, renderer-state restoration, and GPU disposal;
- temporarily containing bake-only shadow-map settings in `try/finally`;
- reducing expensive live shadow maps after the baked result is ready.

The following prototype assumptions must not enter the library:

- requiring the generated infinite floor to exist before lighting can start;
- finding casters and receivers with object-name prefixes and suffixes;
- importing health-demo platform radius, wall arc, depth scale, or theme types;
- assigning a fixed atlas rectangle to one known platform and a fixed number of panels;
- mutating wall emissive colors, renderer exposure, scene background, or fog;
- hard-coded light/dark colors and application-specific contact-shadow geometry;
- starting the bake from a component timer after `@ready`;
- treating all visible meshes as equally static.

---

## Three.js addon constraints to design around

`ProgressiveLightMap` is useful, but it is not a complete scene-lighting system:

1. It supports `WebGLRenderer`; WebGPU requires the separate GPU addon.
2. `addObjectsToLightMap()` mutates material lightmaps, `uv1`, shadow flags, render order, and ownership temporarily.
3. Its default packing gives every object an equal-size cell, regardless of useful surface area.
4. Objects need normals and a base UV attribute before they can participate.
5. Shared or overlapping UVs produce incorrect receiving unless Vuetrex supplies an isolated `uv1` mapping.
6. `InstancedMesh` members share geometry and therefore cannot receive unique baked lighting without shader-level
   per-instance atlas transforms. Instances should initially be cast-only.
7. Transparent surfaces, custom shader materials, morphing geometry, and animated silhouettes need conservative
   fallback behavior.
8. Baking moves registered objects through an internal scene during every update. The built-in should use disposable
   proxy meshes so the live scene graph is never reparented or assigned the addon's temporary material.

The proxy approach should be validated in an early spike. Each proxy copies the source object's world transform and
shares immutable geometry where safe. Receivers use cloned geometry for isolated `uv1` data. The completed atlas
texture is then assigned to eligible live receiver materials. If a proxy limitation is found, use the prototype's
transactional snapshot/restore path as a fallback, never unguarded live mutation.

---

## Proposed architecture

```text
Vue components
      │
      ▼
Base / Node synchronization ───────► stage scene revision + change reasons
      │                                      │
      │ lighting contributions               │ debounce / settle
      ▼                                      ▼
LightingAnalyzer ───────────────► StudioLightBakePlan
  classify cast/receive/dynamic     bounds, rig, samples, atlas cells
                                          │
                                          ▼
                                ProgressiveStudioLightController
                                waiting → analyzing → baking
                                          → fading → ready
                                          │
                                          ▼
                              live receiver lightMap + status events
```

### Module layout

```text
src/lib-components/three/lighting/
  types.ts                    public settings/status; internal contribution types
  LightingAnalyzer.ts         deterministic classification and warnings
  LightmapUvBuilder.ts        projection, atlas allocation, uv1 cloning/restoration
  StudioLightRig.ts           bounds-derived rig and deterministic sample positions
  StudioLightBake.ts          ProgressiveLightMap adapter and proxy bake scene
  StudioLightTransition.ts    completed-map crossfade and live-light handoff
  StudioLightController.ts    state machine, invalidation, cancellation, disposal
```

The controller is owned by `VuetrexStage`. It is created during stage construction when `settings.studioLight` is
enabled, starts observing during `mount()`, and begins analysis only after the authored node tree reports a settled
scene revision.

### Internal lighting contributions

Every renderable node type should describe its owned Three.js objects through a protected/internal method rather than
making the controller inspect class-private state:

```ts
interface LightingContribution {
  ownerKey: string
  object: THREE.Object3D
  mobility: 'static' | 'dynamic'
  cast: boolean
  receive: boolean
  receiverProjection: 'top' | 'uv1' | 'none'
  priority: number
  revision: number
}
```

`Node.lightingContributions()` returns an empty list by default. Concrete defaults:

| Owner | Automatic contribution |
|---|---|
| `MeshNode` primitives | Opaque mesh casts; receives only when a safe receiver projection is available |
| `Panel` | Backing surface receives with top projection and casts; children report themselves normally |
| `Cylinder` used as a horizontal stage | Top surface may receive through top projection; sides remain cast-only |
| `DisplayWall` | Frame casts; stable opaque frame/screen surfaces may receive through wall projection |
| `InstanceNode` | Cast-only initially; never allocate one overlapping receiver cell to every instance |
| Groups/layout nodes | No direct geometry; transformations are represented by descendant world matrices |
| Connectors/particles/arrows | Dynamic and ignored by the bake |
| Troika labels/captions | Ignored by default |
| Diagnostics, helpers, mirrors | Ignored |
| Generated floor overlay | Stage-owned low-priority receiver; never a required dependency |
| Legacy generated wall | Stage-owned caster/optional receiver through an explicit descriptor |

This method is also the extension seam for registered custom elements. Unknown `THREE.Mesh` descendants are not
silently admitted as receivers; they can cast if their silhouette is safe, or opt in with `lighting="receive"` and a
valid `uv1`.

### Automatic classifier

The analyzer runs only on contributions, then applies conservative rules:

1. Exclude invisible objects, zero-area geometry, helpers, and unsupported material families.
2. Exclude live-changing contributions from the current bake. Keep observing them for a later settled revision.
3. Allow opaque standard materials with normals to cast.
4. Require a lightmap-capable material plus safe `uv1` or a known projection strategy to receive.
5. Preserve and skip materials that already own an application lightmap unless the node explicitly opts in.
6. Treat opacity below a conservative threshold, alpha-tested silhouettes, custom depth materials, and custom shaders
   as cast-only until separately supported.
7. Detect shared receiver geometry. Clone it before assigning per-object atlas UVs.
8. Rank receivers by projected surface area, semantic priority, and visibility in authored bounds.
9. Emit structured warnings in debug mode for rejected receivers instead of failing the entire bake.

Known Vuetrex behavior should beat statistical guessing. A `Panel` knows it has a meaningful top surface; an
`InstanceNode` knows its geometry is shared across members; a connector knows it is dynamic. Runtime stability is an
additional guard, not the primary source of semantics.

### Scene revision and settling

The current `@ready` event fires before slot content is rendered into the custom renderer, so it cannot be the bake
start signal. Add a stage-owned revision mechanism:

- `markLightingDirty(reason, ownerKey?)` increments a pending revision and schedules one settled notification.
- Node registration/removal, geometry replacement, visibility, placement, material alpha mode, instance transforms,
  display-wall structural changes, floor creation, and stage-light changes mark relevant reasons.
- The controller waits `settleDelay` after the last relevant change and at least one completed Vue/Three flush.
- Material color/map repaint alone does not invalidate shadow geometry unless it changes an alpha-tested silhouette.
- Hover transitions and connector particles never mark the bake dirty.
- `animateTo()` marks the affected contribution dynamic for the tween and schedules one invalidation after completion.
- Camera movement, camera focus, resize, and camera-relative fog do not invalidate a world-space lightmap.
- If changes arrive while baking, cancel the in-progress candidate, retain the last completed map, and restart after
  the scene settles.
- With `rebake: 'static-changes'`, repeated high-frequency contributors are automatically treated as dynamic until
  they remain stable for the full settle window.

### Receiver UVs and atlas allocation

The first version should optimize for predictable diagram surfaces rather than pretend to unwrap arbitrary models:

- Use top projection for panels, horizontal stages, and floor-like primitive surfaces.
- Use an existing non-overlapping `uv1` for custom geometry when supplied.
- Add a vertical wall projection for `DisplayWall` and the legacy wall only after the horizontal path is stable.
- Leave boxes, wedges, and arbitrary meshes cast-only unless their node implementation provides a safe projection.
- Clone shared geometry before assigning atlas-specific `uv1`; never overwrite user `uv` texture coordinates.
- Preserve the original geometry reference and original `uv1` for complete restoration.

Replace equal-cell packing with a deterministic area-weighted allocator:

1. Estimate useful receiver area from the selected projected faces.
2. Multiply by semantic priority (`Panel`/stage surfaces above the infinite floor).
3. Clamp every admitted receiver to minimum and maximum cell sizes.
4. Pack with fixed padding derived from atlas resolution.
5. Drop lowest-priority receivers when the atlas budget is exceeded and report that decision in debug status.
6. Keep allocation order stable by owner key so equivalent scene updates do not shimmer or reshuffle the atlas.

Quality presets should initially map to coherent budgets:

| Quality | Atlas | Total samples | Shadow map | Intended use |
|---|---:|---:|---:|---|
| `preview` | 512 | 24 | 256 | Fast authoring and low-power devices |
| `balanced` | 1024 | 64 | 512 | Default presentation quality |
| `high` | 2048 | 128 | 1024 | Static hero scenes on capable desktop GPUs |

Clamp all values to `renderer.capabilities.maxTextureSize` and fall back one preset when allocation or render-target
creation fails.

### Rig derivation

The rig must be deterministic and stage-relative:

1. Compute aggregate caster/receiver bounds and a receiver-area-weighted target.
2. Reuse the direction of the dominant stage-owned directional light when one exists.
3. Otherwise derive an upper-left/back key from the initial overview direction and world up. Capture this once per
   bake; orbiting the camera must not rotate the baked light.
4. Derive light distance and orthographic shadow extent from the aggregate bounding sphere, with padding for tall
   casters and walls.
5. Derive key and fill colors from `lightColor1..3`, `floorColor`, and background luminance. Do not require a theme
   enum or inject hard-coded health-demo colors.
6. Generate most samples across a virtual key-light disk and a smaller deterministic set across the upper hemisphere.
7. Map `softness` to angular source radius and `contrast` to the key/hemisphere ratio.
8. Use a fixed sample seed derived from stable stage settings so rebakes converge to the same result.

Stage-created lights must be tagged as stage-owned. During the final transition, the controller may reduce only those
lights' shadow-map work and intensity according to the preset. User-added lights are preserved by default. Background,
fog, tone mapping, exposure, and emissive materials are never part of the automatic handoff.

### Bake isolation and state ownership

The controller must obey these invariants:

- The live scene never displays a partially accumulated texture.
- The bake uses disposable proxy objects where possible; source objects are not reparented.
- Any unavoidable renderer mutation is wrapped in `try/finally` and restored in the same animation frame.
- Existing render target, shadow-map enabled/type state, viewport, scissor, clear color/alpha, tone mapping, and XR state
  are preserved.
- Existing `material.lightMap`, `lightMapIntensity`, dithering, geometry, `uv1`, shadow flags, render order, and layer
  masks are snapshotted before changes.
- The new atlas is attached to live materials only after all samples complete successfully.
- A replacement bake owns a second atlas until crossfade completes; only then is the prior atlas disposed.
- Cancellation is idempotent at every state, including shader compilation and the final fade.
- `stage.destroy()` disposes the controller before clearing scene objects or forcing WebGL context loss.

If the same material is shared by several receivers, they may share one atlas texture and one intensity as long as each
object has independent atlas UVs. Do not clone a node-owned live material behind `MeshNode`, because its reactive
material watcher would continue updating the old instance.

### Progressive scheduling

Use a controller-owned `requestAnimationFrame` loop independent of the normal 25 fps scene ticker:

- Compile/warm the bake scene once after analysis.
- Measure each bake update duration with `performance.now()`.
- Respect a small per-frame budget and reduce samples per frame when the previous update was expensive.
- Pause work when the document is hidden; resume without resetting accumulation.
- Continue initialization even when `<Vuetrex stopped>` is true, because stopped controls scene animation rather than
  asset preparation.
- Report progress in three weighted phases: analysis/allocation, sampling, and completed-map fade.
- Use an increasing accumulation window (`sampleIndex + 1`) so the first frame cannot retain cleared render-target
  energy.
- Keep the previous live lighting intact until the new map is complete.

### Status and failure behavior

Expose one stable status shape through both the stage and the Vue component:

```ts
interface VxStudioLightStatus {
  state: 'disabled' | 'waiting' | 'analyzing' | 'baking' | 'fading' | 'ready' | 'unsupported' | 'error'
  progress: number
  revision: number
  receivers: number
  casters: number
  warnings: readonly string[]
  error?: Error
}
```

Proposed APIs:

```ts
stage.onStudioLightStatus(listener): () => void
stage.rebakeStudioLight(): void
stage.cancelStudioLight(): void
stage.getStudioLightStatus(): VxStudioLightStatus
```

`<Vuetrex>` forwards the same value through `@studio-light-status`. Unsupported rendering paths leave the live scene
unchanged and report `unsupported`; an individual bad receiver becomes a warning, not a global error.

---

## Implementation sequence

### Task 1: Freeze the contract with tests

**Files:**

- Add `test/unit/verify-studio-light-types.spec.ts`
- Add `test/unit/verify-lighting-analysis.spec.ts`
- Add `test/unit/verify-studio-light-controller.spec.ts`

- [ ] Define assertions for settings normalization and quality presets.
- [ ] Define status-state transitions and legal cancellation from every state.
- [ ] Define classifier cases for panels, primitives, instances, transparent meshes, existing lightmaps, and ignored
  helpers.
- [ ] Define the rule that camera/viewport changes do not increment the lighting revision.
- [ ] Define deterministic analysis ordering independent of insertion timing.

### Task 2: Add public settings, status, and optional overrides

**Files:**

- Modify `src/lib-components/three/stage.ts`
- Modify `src/lib-components/nodes/Node.ts`
- Modify `src/lib-components/index.ts`
- Modify `src/lib-components/vuetrex.ts`
- Modify `docs/api/stage.md`
- Modify `docs/api/index.md`

- [ ] Add `studioLight?: boolean | VxStudioLightSettings` to `VxSettings`.
- [ ] Normalize `true` to balanced defaults and keep omission/`false` fully inert.
- [ ] Add the common `lighting` node override without changing existing tag names.
- [ ] Add stage status methods and the Vue status event.
- [ ] Keep all new types exported from the package entry point.

### Task 3: Add semantic lighting contributions

**Files:**

- Add `src/lib-components/three/lighting/types.ts`
- Modify `src/lib-components/nodes/Node.ts`
- Modify `src/lib-components/nodes/MeshNode.ts`
- Modify `src/lib-components/nodes/Panel.ts`
- Modify `src/lib-components/nodes/InstanceNode.ts`
- Modify `src/lib-components/nodes/DisplayWall.ts`
- Modify connector node/renderer ownership points only to declare explicit exclusion

- [ ] Implement `lightingContributions()` with conservative defaults.
- [ ] Describe compound objects such as panel backing meshes and display-wall frame/screen separately.
- [ ] Mark instances cast-only and connectors/text/helpers ignored.
- [ ] Apply explicit author overrides after node-specific defaults.
- [ ] Test nested groups and world transforms without relying on object names.

### Task 4: Add stage revisions and settled-scene notification

**Files:**

- Modify `src/lib-components/nodes/Base.ts`
- Modify geometry/material update points in relevant node classes
- Modify `src/lib-components/three/stage.ts`
- Add `test/unit/verify-lighting-revisions.spec.ts`

- [ ] Coalesce dirty reasons across one custom-renderer flush.
- [ ] Start the settle delay only after Three.js objects for the revision exist.
- [ ] Track structural, silhouette, visibility, transform, and stage-light reasons separately.
- [ ] Suppress hover, camera, diagnostics, connector-particle, and texture-content-only changes.
- [ ] Integrate `animateTo()` start/completion with temporary dynamic classification.

### Task 5: Build deterministic analysis and UV allocation

**Files:**

- Add `src/lib-components/three/lighting/LightingAnalyzer.ts`
- Add `src/lib-components/three/lighting/LightmapUvBuilder.ts`
- Add focused unit tests for both modules

- [ ] Filter unsupported contributions and return structured warnings.
- [ ] Estimate useful projected area and rank receiver importance.
- [ ] Generate top projections for supported built-ins.
- [ ] Preserve valid user `uv1` and isolate shared geometry by cloning.
- [ ] Implement stable area-weighted atlas packing and overflow fallback.
- [ ] Return a complete restoration/disposal record with the bake plan.

### Task 6: Build the automatic studio rig

**Files:**

- Add `src/lib-components/three/lighting/StudioLightRig.ts`
- Add `test/unit/verify-studio-light-rig.spec.ts`

- [ ] Derive target, distance, shadow extent, and light colors from bounds/stage settings.
- [ ] Prefer a dominant stage-owned light direction; otherwise use the stable overview-relative default.
- [ ] Implement deterministic softbox-disk and ambient-hemisphere sampling.
- [ ] Map presets, softness, and contrast into a coherent sample plan.
- [ ] Test degenerate bounds, flat scenes, tall walls, dark/light backgrounds, and texture-size clamping.

### Task 7: Prove the proxy bake adapter

**Files:**

- Add `src/lib-components/three/lighting/StudioLightBake.ts`
- Add `test/unit/verify-studio-light-bake.spec.ts`
- Add a small visual fixture under `demo/` or a dedicated browser fixture

- [ ] Create proxy casters/receivers with copied world transforms.
- [ ] Use only the public `ProgressiveLightMap` constructor, `addObjectsToLightMap`, `update`, and `dispose` methods.
- [ ] Verify wall-to-floor, mesh-to-panel, nested-scale, and transparent-exclusion shadows against the live-object
  prototype.
- [ ] Prove no live parent/material/render-order mutation occurs during an update.
- [ ] If proxy parity fails, implement and test a transactional snapshot fallback.

### Task 8: Implement the controller and transition

**Files:**

- Add `src/lib-components/three/lighting/StudioLightController.ts`
- Add `src/lib-components/three/lighting/StudioLightTransition.ts`
- Extend controller/state tests

- [ ] Implement the full state machine and adaptive frame budget.
- [ ] Hide partial maps and fade only a completed candidate.
- [ ] Preserve the previous completed atlas during rebake.
- [ ] Balance only stage-owned live lights; preserve external lights and the environment.
- [ ] Make cancel/dispose idempotent and safe during compile, bake, fade, and ready states.
- [ ] Handle hidden documents, WebGL context loss, allocation failure, and unsupported renderers gracefully.

### Task 9: Integrate with stage and Vue lifecycle

**Files:**

- Modify `src/lib-components/three/stage.ts`
- Modify `src/lib-components/three/scene.ts` only where renderer/context lifecycle requires it
- Modify `src/lib-components/vuetrex.ts`
- Update public API tests

- [ ] Construct the controller only for an enabled setting.
- [ ] Start observation during mount, but wait for the settled authored revision.
- [ ] Forward status to Vue without requiring application timers.
- [ ] Dispose lighting before scene clearing/context loss.
- [ ] Verify multiple simultaneous Vuetrex stages remain isolated.

### Task 10: Migrate the health demo onto the built-in

**Files:**

- Modify `demo-health/v-ui/components/Stage.vue`
- Remove `demo-health/v-ui/lighting/progressiveStudioLight.ts` after parity is proven
- Keep application-specific platform texture and optional stylized contact overlay outside the library

- [ ] Replace manual start/dispose/timer/progress code with `settings.studioLight` and the status event.
- [ ] Remove health-specific classification, UV allocation, light rig, and environment mutation.
- [ ] Preserve the demo's intended soft wall shadow and platform/panel receiving through semantic contributions.
- [ ] Decide explicitly whether the stylized curved-wall AO strip remains as demo decoration or is deleted.
- [ ] Confirm light/dark themes without built-in background, fog, exposure, or emissive rewrites.

### Task 11: Documentation, diagnostics, and validation

**Files:**

- Add `docs/guide/studio-lighting.md`
- Update `docs/api/stage.md`, `docs/api/index.md`, and `docs/architecture.md`
- Add screenshot/browser fixtures for representative scenes

- [ ] Document the one-setting path, advanced controls, node overrides, and limitations.
- [ ] Add a debug atlas preview and caster/receiver overlay under studio-light diagnostics.
- [ ] Test empty scenes, no floor, no wall, floor mirror on/off, display wall, panels, instances, nested scaled groups,
  dynamic visibility, rebake cancellation, stopped stages, and unmount during every controller phase.
- [ ] Compare light and dark scenes at wide, 1024px, narrow, and tall aspect ratios.
- [ ] Verify zoom/orbit/focus/resize never changes baked-light strength or requests a rebake.
- [ ] Run `pnpm test:run`, `pnpm typecheck`, `pnpm build`, `pnpm test:esm-project`, and `pnpm docs:build`.
- [ ] Capture GPU memory before enable, after ready, after rebake, and after destroy to prove render targets and cloned
  resources are released.

---

## Acceptance criteria

The built-in is ready when all of the following are true:

- `studioLight: true` produces useful soft shadows in a new Vuetrex scene without object IDs, geometry constants, or
  application-owned scheduling code.
- A wall can cast onto a platform or floor, panels can receive local object shadows, and instanced objects can cast
  without overlapping receiver artifacts.
- First paint remains live-lit; no incomplete lightmap, black atlas, material flash, or scene reparenting is visible.
- The default fade is two seconds and is interruptible without leaving partial material or renderer state.
- Camera fit, viewport resize, orbit, focus, and camera-relative fog do not alter or invalidate the baked result.
- Static scene changes trigger one debounced replacement bake; rapidly changing content remains live-only.
- Existing lightmaps and user-added lights are preserved unless the author explicitly opts into replacement behavior.
- Background, fog, exposure, material color, emissive content, connector appearance, and display-wall texture content are
  unchanged by default.
- Unsupported objects produce actionable debug warnings while the rest of the scene still bakes.
- Disabling the setting adds no bake render targets, animation work, scene traversal, or public behavioral changes.
- Destroying the stage at any point restores borrowed state and disposes every module-owned GPU resource.

---

## Recommended delivery slices

1. **Foundation:** public types, semantic contributions, scene revisions, and analyzer tests—with no rendering yet.
2. **Static MVP:** horizontal built-in receivers, cast-only instances/walls, proxy bake, one completed map, manual rebake.
3. **Production lifecycle:** debounced static-change rebakes, old/new atlas handoff, cancellation, status event, disposal.
4. **Automatic polish:** stage-derived rig, quality presets, adaptive scheduling, diagnostics, and health-demo migration.
5. **Later extensions:** vertical receivers, WebGPU adapter, per-instance receiver transforms, generic contact AO, persistent
   atlas caching, and worker/off-main-thread preparation where browser APIs permit it.

The MVP should be considered successful before adding the later extensions. Its value is automatic, stable soft
shadows for common Vuetrex diagrams—not universal offline rendering inside the browser.

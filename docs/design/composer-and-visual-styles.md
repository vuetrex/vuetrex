---
title: Composer and visual styles
description: Proposed declarative effects and aesthetic profiles for legible Vuetrex visualizations.
outline: deep
---

# Composer and visual styles

**Status: proposed, September 26, 2026.** The APIs below are not implemented. This document changes no runtime behavior.

## Purpose

Make the same visualization suitable for an operational dashboard, a softly lit data model, a luminous network, or an editorial illustration without rewriting its data, geometry, layout, or interactions. Authors should control the final image through Vue and reusable styles, without manipulating Three.js passes.

Workshop2 motivates this work: emissive database bands cannot produce the reference's halos by themselves. Contact shading, tone, and edge treatment also require more than material colors. Bloom creates an image-space halo; it does not illuminate neighboring surfaces. Lighting, materials, floor appearance, and post-processing remain separate, cooperating systems.

Legibility is the primary constraint. Styling must preserve meaningful colors, visible connections, readable labels, and selection. An effect must never be the sole indication of a status or interaction.

## Current foundation

`three/scene.ts` owns an `EffectComposer` with one `RenderPass`, renders it each frame, resizes it with the viewport, and disposes both on destruction. The renderer uses ACES filmic tone mapping, exposure 1, and sRGB output. There is no public effect configuration.

Existing scene declarations extend the host-only `StageDeclaration`; stylesheets resolve common and light/dark material and connector styles. Extend those mechanisms. Do not introduce a second renderer or put passes into the spatial node tree. See [Architecture](/architecture).

## Authoring experience

Start with a profile and adjust the effects that matter:

```vue
<!-- Proposed API -->
<Vuetrex :sheets="[diagramStyles]" scheme="dark">
  <vx-composer
    preset="luminous"
    quality="balanced"
    :bloom="{ mode: 'selected', strength: 0.35, radius: 0.3, threshold: 1 }"
  />
  <vx-environment preset="studio" :intensity="0.5" />
  <vx-floor finish="matte" :color="0x101923" />
  <vx-box id="active-service" material="active" :effects="{ bloom: 'include' }" />
</Vuetrex>
```

`vx-composer` describes the final image, not a Three.js pass array. Prop updates change parameters or reconcile pipeline resources. Allow one declaration per scene; competing owners produce an actionable error. Kebab-case and camelCase props must behave identically.

Share presentation across views through stylesheets:

```ts
// Proposed extension: composer is a new stylesheet field.
const diagramStyles = defineVxStyleSheet({
  common: {
    composer: { preset: 'technical', quality: 'balanced' },
    materials: {
      active: { base: { color: '#168bdf', emissive: '#168bdf', emissiveIntensity: 2 } },
    },
  },
  light: {
    composer: { bloom: false, ambientOcclusion: { intensity: 0.15 } },
  },
  dark: {
    composer: { bloom: { mode: 'selected', strength: 0.3, threshold: 1 } },
  },
})
```

Effects do not silently modify backgrounds, lights, materials, cameras, floors, or semantic palettes. A complete aesthetic pairs a composer profile with existing scene declarations and material/connector styles. Application components can package that pairing; no competing theme system is needed.

### Proposed public contract

```ts
type VxComposerPreset = 'technical' | 'studio' | 'luminous' | 'editorial'
type VxEffectOption<T> = false | true | Readonly<Partial<T>>

interface VxComposerOptions {
  preset?: VxComposerPreset
  enabled?: boolean
  quality?: 'low' | 'balanced' | 'high'
  maxPixelRatio?: number
  reducedEffects?: boolean | 'system'
  output?: {
    toneMapping?: 'none' | 'neutral' | 'aces' | 'agx'
    exposure?: number
  }
  bloom?: VxEffectOption<{
    mode: 'luminance' | 'selected'
    strength: number
    radius: number
    threshold: number
  }>
  ambientOcclusion?: VxEffectOption<{ intensity: number; radius: number }>
  grading?: VxEffectOption<{ contrast: number; saturation: number }>
  vignette?: VxEffectOption<{ strength: number }>
  antialias?: 'auto' | 'off' | 'fxaa'
}

interface VxNodeEffects {
  bloom?: 'auto' | 'include' | 'exclude'
}
```

`enabled: false` bypasses optional effects while retaining the requested output transform and AA. `bloom: false` disables only bloom. Without a composer declaration or stylesheet composer configuration, retain the legacy rendering path.

| Control | Meaning and validation |
|---|---|
| Exposure | Positive finite output multiplier; default 1; no automatic brightness correction |
| Bloom strength | Finite 0–2 multiplier on blurred radiance; default 0.3 when enabled |
| Bloom radius | 0–1 halo spread; default 0.3; not world units |
| Bloom threshold | Nonnegative linear scene luminance before exposure/tone mapping; default 1 |
| AO intensity | 0–1 contact darkening; default 0.2 |
| AO radius | Positive world-unit sampling radius; default 0.25; independent of camera fitting |
| Contrast / saturation | 0–2 multipliers; identity 1; no automatic data normalization |
| Vignette strength | 0–0.3 edge darkening; default 0.1 when enabled |
| Maximum pixel ratio | Finite 0.5–3 upper bound; default 1.5, further limited by quality |

Unknown properties, invalid enums, non-finite values, and out-of-range numbers fail during resolution with a property path. Unsupported device capabilities produce reported fallbacks instead. Neither case should become an unexplained blank canvas. `null` is not an authored option; use `false` or remove the binding. Renderer prop-removal sentinels restore lower-precedence values.

## Aesthetic profiles

Profiles are versioned immutable parameter bundles, with documented values and preview thumbnails. They change treatment, not data meaning. Proposed starting values:

| Profile | Intended use | Composer treatment | Companion scene choices |
|---|---|---|---|
| `technical` | Dense topology and operational dashboards | Neutral tone mapping, exposure 1; bloom/AO/grading/vignette off | Clear palettes, matte surfaces, explicit selection cues |
| `studio` | Physical data models and workshop2 | Neutral, exposure 1; AO intensity 0.2 / radius 0.25; other effects off | Pale floor, soft lighting, restrained rough materials |
| `luminous` | Activity and network flow | ACES, exposure 1; selected bloom strength 0.3 / radius 0.3 / threshold 1; other effects off | Dark floor, explicit emitters, subdued inactive objects |
| `editorial` | Illustrative presentation | Neutral, exposure 1; AO 0.12 / radius 0.25; contrast 1.03 / saturation 0.9; other effects off | Warm neutrals, simplified geometry, strong silhouettes |

All profiles start with balanced quality, automatic AA, and system reduced-effects handling. Higher quality changes resolution/sampling, not palette or effect strength. Vignette remains opt-in. No preset enables depth of field, grain, chromatic aberration, or animated effects.

For workshop2, combine `studio` with restrained selected bloom on database bands and active links. AO does not replace soft lighting: the separate studio-light proposal owns shadow baking. Publish light and dark examples for every profile, not only attractive dark screenshots.

## Resolution and styling rules

1. Select sheets using existing root behavior: explicit root `sheets` replace inherited provider sheets; otherwise inherit them. Merge composer inputs in the selected sheet order; within each sheet apply common then resolved light/dark values.
2. Merge explicit declaration props last. The last defined `preset` selects the profile; expand it once underneath all merged explicit fields.
3. Resolve remaining fields against that preset and documented defaults. Configured scenes without a preset use `technical`.
4. Apply reduced-effects and device/quality policies to produce an effective plan. Preserve requested values for diagnostics.

Nested objects merge defined fields. `false` disables an effect and clears earlier effect overrides; a later `true` re-enables its selected-preset/default configuration. A later object enables the effect with its explicit fields. `undefined` contributes nothing. Removing an inline prop recomputes from remaining inputs, rather than leaving a stale uniform. Test this with ordered merge tables.

Extend `VxStyleScheme` and its freeze/merge functions deliberately. Stylesheets remain immutable values, never renderer objects. `effects` is node/render-contribution metadata, not a material property: the same material can be shared by a glowing node and a non-glowing node.

One controller handles both sheet and declaration inputs. Removing the declaration reveals current stylesheet settings. Removing all composer inputs restores captured legacy renderer state, including exposure and output settings. Do not add a second mutable stage configuration API in the first release.

## Bloom with semantic control

- **Luminance mode:** sufficiently bright world pixels contribute, including bright floors and reflections. Useful for illustrations, but explicitly opt-in.
- **Selected mode:** only contributions marked `include` can emit bloom, and they must still pass the threshold. White panels should not compete with an active stream. `auto` contributes nothing in this mode.

`exclude` suppresses contribution in either mode. Groups provide inherited policy; nearest explicit descendants win. Text, captions, helpers, and selection annotations are excluded by default. Exclusion prevents a surface from generating bloom; it does not prevent nearby halos from overlapping it.

Resolve membership through logical ownership, never mesh names. Fixed meshes, generated batches, instances, particles, and connector backends expose stable render contributions with adapters. First release supports whole-host policy for geometry, instances, and particles; per-instance emission masks are deferred. Connector appearance metadata receives an equivalent `effects` policy per keyed record, outside routing and stroke-material options. Membership changes must not rebuild connection topology.

Selected bloom requires an occlusion-correct radiance mask. Non-emitting opaque surfaces still occlude emitters behind them. Use owned mask resources/proxies or a verified auxiliary path, never unguarded swaps of live application materials. Unsupported custom shaders render normally but skip mask emission with a diagnostic. Validate alpha-tested cutouts; initially, blended surfaces do not occlude the mask, a documented approximation for glass-heavy scenes.

Emissive intensity controls source radiance, not halo size. Connector and particle adapters need a documented, bounded linear emission multiplier because ordinary stroke colors may not exceed the HDR threshold. Introduce that presentation metadata with adapter tests. Enabling bloom must not automatically increase every object's emissive value.

## Pipeline and color management

The library determines pass order. Arbitrary user pass arrays are out of scope initially.

```text
world beauty + shared depth/normal inputs (linear HDR)
  → AO applied to eligible opaque surface lighting
  → bloom extraction, blur, and composition
  → optional depth of field (future)
  → linear grading and vignette
  → protected world labels / selection annotations, depth tested
  → one output tone-map and sRGB conversion
  → FXAA if selected (display-space input)
  → canvas; DOM overlays remain outside the composer
```

This is a dependency plan, not one full-size target per stage. Skip identity effects and share compatible inputs. AO must not darken emission, halos, or labels. An adapter that cannot separate those contributions must document its limitation before adoption.

Keep intermediate colors linear and HDR-capable. Tone-map and convert for display exactly once. Three.js documents `OutputPass` for terminal tone mapping/color conversion, with sRGB-input effects such as FXAA following it. It reads renderer settings, so one controller owns/restores them; do not apply exposure again in each pass. See [OutputPass](https://threejs.org/docs/pages/OutputPass.html).

The installed `UnrealBloomPass` is a candidate implementation, not the public contract. Its threshold, radius, and strength controls do not implement semantic selection or exclusion; that needs a separate adapter. See [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html).

The managed HDR path may differ from the current single-pass output. Capture baselines before enabling it and gate adoption behind explicit configuration. Compare an identity profile with a defined reference transform; do not assume legacy equivalence.

`material.toneMapped: false` alone cannot exempt an object from a full-frame output transform. Document this limitation; exact untonemapped annotations require a separate depth-aware display-space overlay path. DOM legend swatches do not promise pixel-identical lit mesh colors. For quantitative color ramps recommend neutral output, identity grading, effects off, and a visible legend; verify category distinguishability and value ordering visually.

## Readability, focus, and accessibility

DOM text remains untouched. Render owned world-label contributions after blur/grading, using world depth to preserve occlusion, before output conversion. Preserve alpha edges and camera alignment. Do not merely draw every label on top. Unsupported custom annotation renderers remain in the world pass and report a limitation when protection is requested.

Depth of field is a later opt-in focus tool, not a preset default. A future API should derive camera-space focus distance from a selected node, connector hit, or world anchor. Define behavior for removed targets, camera motion, transparent surfaces, and reduced motion before shipping it. Maintain recognizable context and an independent selection cue.

`reducedEffects: 'system'` follows `prefers-reduced-motion` as a conservative opt-out from decorative effects. This is a Vuetrex policy, not a claim that static bloom is motion. Disable bloom, vignette, future blur/noise, and effect transitions while preserving AA and selection cues. `true` forces that policy; `false` opts out of automatic reduction. Scheme changes are immediate initially. Future transitions must not animate semantic colors through ambiguous intermediate states.

## Architecture and lifecycle

```text
stylesheet inputs + ComposerDeclaration (extends StageDeclaration)
  → pure resolveComposerOptions()
  → immutable requested configuration
  → compileComposerPlan(configuration, capabilities, quality policy)
  → keyed ComposerController reconciliation
  → Scene.render(), resize(), destroy()
```

| Location | Responsibility |
|---|---|
| `scene/composer.ts` | Public values, presets, validation, pure resolution |
| `scene/declarations.ts` | Host-only declaration and exclusive ownership |
| `styling/stylesheets.ts` | Scheme integration and immutable inputs |
| `three/postprocessing/ComposerController.ts` | Plan realization, rendering, resize, disposal, status |
| `three/postprocessing/` adapters | Bloom masks, AO, annotations, output, AA |
| `three/scene.ts` | Delegate existing composer lifecycle to the controller |
| `nodes/types.ts`, public exports, template types | Registration and public API |

The declaration has no spatial identity, bounds, layout, focus, or picking. `Scene` owns the controller; the declaration owns configuration only. The controller borrows scene, camera, and application textures, and owns passes, targets, proxies, and subscriptions. Do not repair logical-tree problems in `stage.ts` or vendor addon code into `three/external/`.

Stable pass keys identify resources. Strength, threshold, grading, and exposure update parameters without allocating a new composer. Activation, mask mode, and quality may change resource topology. Prepare a candidate plan, validate it, swap at a frame boundary, and dispose replaced resources. On failure retain the last working plan and emit a diagnostic. Disabled effects release exclusive resources; shared inputs have explicit ownership/reference counts. No unbounded cache of old profiles.

Resize renderer and composer using the same CSS size and effective DPR; detect DPR changes without CSS resize and avoid applying DPR twice. Suspend allocation for zero-sized/hidden canvases. Reflection rendering must not recursively invoke the main composer: bloom applies to the final reflected image, not a recursive processed mirror texture.

Unmount the inner Vue tree before destroying the stage. Teardown must be idempotent: unsubscribe, stop controller work, dispose owned passes/targets exactly once, restore borrowed state, then destroy the renderer. Disposing `EffectComposer` does not replace disposal of added passes. Context restoration rebuilds the effective plan; failed restoration retains a basic render fallback and observable status.

## Performance and diagnostics

Proposed budgets to benchmark, not performance promises:

| Quality | DPR cap | Bloom extraction scale | AO scale | Use |
|---|---:|---:|---:|---|
| Low | 1 | 0.5 | Off with diagnostic when requested | Mobile / dense live views |
| Balanced | 1.5 | 0.5 | 0.5 | Interactive default |
| High | 2 | 1 | 1 | Presentation / capable desktop |

Scales are relative to the effective drawing buffer; bloom's internal mip chain is additional. `maxPixelRatio` can lower, not exceed, the quality cap. Document samples and memory estimates after adapter benchmarks. Canvas antialiasing does not guarantee offscreen AA; test the final path on thin connections, labels, and silhouettes.

Fallback order: lower auxiliary resolution, disable AO, disable bloom, then retain a basic render path. Report each change. Never silently alter data, geometry, palette, or selection. Defer automatic frame-time quality adaptation until hysteresis and predictability are tested.

Expose read-only `stage.composerDiagnostics()` with requested/effective options, pass keys, target sizes, estimated owned bytes, supported features, fallback reasons, allocation/update counters, and last error. GPU timings are optional and marked unavailable when unsupported. A deduplicated `composer-status` event reports meaningful configuration/fallback/failure changes, not frames.

## Delivery and verification

1. **Foundation:** controller extraction preserving legacy rendering; resolver, profiles, stylesheet/declaration integration, output/AA prototype, diagnostics, baseline captures, and ownership tests.
2. **Bloom:** luminance/HDR prototype followed by selected masks and exclusions for supported built-ins and connector/particle adapters. Release luminous profiles only when white panels and text remain controlled.
3. **Depth and annotations:** shared depth/normal inputs, AO, protected labels, grading/vignette, quality tiers, studio/editorial examples.
4. **Later:** focus-aware DOF, outlines, per-instance/channel masks, color-managed LUTs, and registered advanced-effect adapters.

Publish a support table per milestone. Do not ship presets with silently missing planned effects; reject not-yet-supported authored controls with useful diagnostics.

Acceptance checks:

- Pure tests: precedence, preset switching, `false`/`true`, prop removal, validation, schemes, immutability, requested/effective separation.
- Renderer tests: exclusive ownership, no spatial/layout impact, idempotent reactive installation, no dependency mutation, declaration removal revealing current sheet settings.
- Resource tests: no allocations for parameter-only changes; disposal on replacement/unmount; repeated toggling; viewport/DPR changes; allocation failures; context loss/restoration.
- Browser fixtures: workshop2, dense thin routes, categorical/continuous palettes, bright panels, occluded emitters, alpha surfaces, nested placement, generated geometry, instances, particles, mirrors, world text, DOM labels, selection, low-quality fallback.
- Fixed-camera/time/viewport/DPR captures for every profile and effects-off in light/dark. Check double gamma/exposure, halo bleed, disappearing edges, obscured text, AO flicker during orbit, and changed color ordering. Use device-tolerant image thresholds and inspect failures.
- Benchmark small and dense scenes for frame time and memory on named hardware before promising frame rates.
- Run focused tests, `pnpm test:run`, `pnpm typecheck`, packaging/export checks when public exports change, and `pnpm docs:build`. Public examples must compile against shipped exports.

## Related work

- [Designing legible data scenes](/guide/visual-design)
- [Stylesheet materials](/guide/stylesheet-materials)
- [Architecture](/architecture)
- Repository proposal: `docs/superpowers/plans/2026-09-04-built-in-automated-studio-light.md`. Lighting bake and composer controllers own separate resources and invalidation. Changing bloom/exposure must not trigger a lightmap rebake.

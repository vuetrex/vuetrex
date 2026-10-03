---
title: Composer and visual styles
description: Proposed declarative effects and aesthetic profiles for legible Vuetrex visualizations.
outline: deep
---

# Composer and visual styles

**Status: simplified, October 2, 2026.** Built-in effects are bloom, ambient occlusion, grading, and vignette,
with optional annotation protection and antialiasing. LUT, depth of field, tone-mapping selection, and outline APIs
have been removed. Applications can supply additional passes explicitly through the fluent API below.

The postprocessing backend loads on demand. A scene without composer configuration renders directly and allocates
no composer render targets. Removing all composer inputs disposes the backend's resources and restores direct rendering.

## Purpose

Make the same visualization suitable for an operational dashboard, a softly lit data model, a luminous network, or an
editorial illustration without rewriting its data, geometry, layout, or interactions. Authors should control the final
image through Vue and reusable styles, without manipulating Three.js passes.

Workshop2 motivates this work: emissive database bands cannot produce the reference's halos by themselves. Contact
shading, tone, and edge treatment also require more than material colors. Bloom creates an image-space halo; it does not
illuminate neighboring surfaces. Lighting, materials, floor appearance, and post-processing remain separate, cooperating
systems.

Legibility is the primary constraint. Styling must preserve meaningful colors, visible connections, readable labels, and
selection. An effect must never be the sole indication of a status or interaction.

## Current foundation

`three/scene.ts` lazily loads and owns one `ComposerController`, which reconciles keyed pass topology, renders it each frame, resizes it
with the viewport/DPR, and disposes owned targets and passes on replacement or teardown. `vx-composer` is a host-only
`StageDeclaration`; stylesheet and inline inputs resolve through the same immutable option pipeline. Passes never enter
the spatial node tree. See [Architecture](/architecture).

## Authoring experience

Start with a profile and adjust the effects that matter:

```vue

<Vuetrex :sheets="[diagramStyles]" scheme="dark">
  <vx-composer
      preset="luminous"
      quality="balanced"
      :bloom="{ mode: 'selected', strength: 0.35, radius: 0.3, threshold: 0 }"
  />
  <vx-environment preset="studio" :intensity="0.5"/>
  <vx-floor finish="matte" :color="0x101923"/>
  <vx-box id="active-service" material="active" :effects="{ bloom: 'include' }"/>
</Vuetrex>
```

`vx-composer` describes the final image, not a Three.js pass array. Prop updates change parameters or reconcile pipeline
resources. Allow one declaration per scene; competing owners produce an actionable error. Kebab-case and camelCase props
must behave identically.

Share presentation across views through stylesheets:

```ts
const diagramStyles = defineVxStyleSheet({
    common: {
        composer: {preset: 'technical', quality: 'balanced'},
        materials: {
            active: {base: {color: '#168bdf', emissive: '#168bdf', emissiveIntensity: 2}},
        },
    },
    light: {
        composer: {bloom: false, ambientOcclusion: {intensity: 0.15}},
    },
    dark: {
        composer: {bloom: {mode: 'selected', strength: 0.3, threshold: 0}},
    },
})
```

Effects do not silently modify backgrounds, lights, materials, cameras, floors, or semantic palettes. A complete
aesthetic pairs a composer profile with existing scene declarations and material/connector styles. Application
components can package that pairing; no competing theme system is needed.

### Implemented public contract

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
    vignette?: VxEffectOption<{ strength: number; offset: number }>
    passes?: readonly VxComposerPass[]
    protectAnnotations?: boolean
    antialias?: 'auto' | 'off' | 'fxaa'
}

interface VxNodeEffects {
    bloom?: 'auto' | 'include' | 'exclude'
    bloomGain?: number // 0–4; default 1; mask contribution only, never beauty brightness
}
```

`enabled: false` bypasses optional effects while retaining the requested output transform and AA. `bloom: false`
disables only bloom. Explicitly enabling bloom without a mode defaults to `selected`. Without a composer declaration or
stylesheet or programmatic composer configuration, use direct rendering without postprocessing resources.

| Control                     | Meaning and validation                                                                                              |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------|
| Exposure                    | Positive finite output multiplier; default 1; no automatic brightness correction                                    |
| Bloom strength              | Finite 0–2 multiplier on blurred radiance; default 0.3 when enabled                                                 |
| Bloom radius                | 0–1 halo spread; default 0.3; not world units                                                                       |
| Bloom threshold             | Nonnegative linear source luminance before exposure/tone mapping; selected-mode default 0, luminance-mode default 1 |
| Per-contribution bloom gain | 0–4 mask multiplier after threshold extraction; default 1; independent of visible emitter brightness                |
| AO intensity                | 0–1 contact darkening; default 0.2                                                                                  |
| AO radius                   | Positive world-unit sampling radius; default 0.25; independent of camera fitting                                    |
| Contrast / saturation       | 0–2 multipliers; identity 1; no automatic data normalization                                                        |
| Vignette strength           | 0–0.3 edge darkening; default 0.1 when enabled                                                                      |
| Maximum pixel ratio         | Finite 0.5–3 upper bound; default 1.5, further limited by quality                                                   |

Unknown properties, invalid enums, non-finite values, and out-of-range numbers fail during resolution with a property
path. Unsupported device capabilities produce reported fallbacks instead. Neither case should become an unexplained
blank canvas. `null` is not an authored option; use `false` or remove the binding. Renderer prop-removal sentinels
restore lower-precedence values.

## Aesthetic profiles

Profiles are versioned immutable parameter bundles, with documented values and preview thumbnails. They change
treatment, not data meaning. Proposed starting values:

| Profile     | Intended use                              | Composer treatment                                                                          | Companion scene choices                                 |
|-------------|-------------------------------------------|---------------------------------------------------------------------------------------------|---------------------------------------------------------|
| `technical` | Dense topology and operational dashboards | Exposure 1; bloom/AO/grading/vignette off                             | Clear palettes, matte surfaces, explicit selection cues |
| `studio`    | Physical data models and workshop2        | Exposure 1; AO intensity 0.15 / radius 0.25                                        | Pale floor, soft lighting, restrained rough materials   |
| `luminous`  | Activity and network flow                 | Exposure 1; selected bloom strength 0.3 / radius 0.3 / threshold 0; other effects off | Dark floor, explicit emitters, subdued inactive objects |
| `editorial` | Illustrative presentation                 | Exposure 1; contrast 1.05 / saturation 0.95; vignette 0.08                         | Warm neutrals, simplified geometry, strong silhouettes  |

All profiles start with balanced quality, automatic AA, and system reduced-effects handling. Higher quality changes
resolution/sampling, not palette or effect strength. Presets only configure the four built-in effects.

For workshop2, combine `studio` with restrained selected bloom on database bands and active links. AO does not replace
soft lighting: the separate studio-light proposal owns shadow baking. Publish light and dark examples for every profile,
not only attractive dark screenshots.

## Resolution and styling rules

1. Select sheets using existing root behavior: explicit root `sheets` replace inherited provider sheets; otherwise
   inherit them. Merge composer inputs in the selected sheet order; within each sheet apply common then resolved
   light/dark values.
2. Merge explicit declaration props last. The last defined `preset` selects the profile; expand it once underneath all
   merged explicit fields.
3. Resolve remaining fields against that preset and documented defaults. Configured scenes without a preset use
   `technical`.
4. Apply reduced-effects and device/quality policies to produce an effective plan. Preserve requested values for
   diagnostics.

Nested objects merge defined fields. `false` disables an effect and clears earlier effect overrides; a later `true`
re-enables its selected-preset/default configuration. A later object enables the effect with its explicit fields.
`undefined` contributes nothing. Removing an inline prop recomputes from remaining inputs, rather than leaving a stale
uniform. Test this with ordered merge tables.

Extend `VxStyleScheme` and its freeze/merge functions deliberately. Stylesheets remain immutable values, never renderer
objects. `effects` is node/render-contribution metadata, not a material property: the same material can be shared by a
glowing node and a non-glowing node.

One controller handles both sheet and declaration inputs. Removing the declaration reveals current stylesheet settings.
Removing all composer inputs restores captured legacy renderer state, including exposure and output settings. Do not add
a second mutable stage configuration API in the first release.

## Bloom with semantic control

- **Luminance mode:** sufficiently bright world pixels contribute, including bright floors and reflections. Useful for
  illustrations, but explicitly opt-in.
- **Selected mode:** only contributions marked `include` can emit bloom. Extract their emitted radiance rather than
  their total lit beauty color. White panels and specular highlights should not compete with an active stream. `auto`
  contributes nothing in this mode. Threshold defaults to zero so saturated blue/red sources can glow without extreme
  material intensity; authors can raise it deliberately.

`exclude` suppresses contribution in either mode. Groups provide inherited policy; nearest explicit descendants win.
Text, captions, helpers, and selection annotations are excluded by default. Exclusion prevents a surface from generating
bloom; it does not prevent nearby halos from overlapping it.

Resolve membership through logical ownership, never mesh names. Fixed meshes, generated batches, instances, particles,
and connector backends expose stable render contributions with adapters. Compound built-ins must distinguish screen,
frame, and annotation contributions. First release supports whole-host policy for geometry, instances, and particles;
per-instance emission masks are deferred. Connector appearance metadata receives an equivalent `effects` policy per
keyed record, outside routing and stroke-material options. Membership changes must not rebuild connection topology.

Selected bloom requires an occlusion-correct radiance mask. Non-emitting opaque surfaces still occlude emitters behind
them. Fully occluded sources contribute nothing; a visible source's blurred halo can overlap nearby silhouettes, as an
image-space effect. Use owned mask resources/proxies or a verified auxiliary path, never unguarded swaps of live
application materials. Unsupported custom shaders render normally but skip mask emission with a diagnostic. Validate
alpha-tested cutouts; initially, blended surfaces do not occlude the mask, a documented approximation for glass-heavy
scenes.

Emissive intensity controls source radiance, not halo size. Connector and particle adapters need a documented, bounded
linear emission multiplier because ordinary stroke colors may not exceed the HDR threshold. Introduce that presentation
metadata with adapter tests. Enabling bloom must not automatically increase every object's emissive value.

For selected bloom, the extraction contract is: resolve membership, sample linear emitted radiance, apply material
alpha/coverage and any explicit mask, apply the source-luminance threshold, then multiply by `bloomGain`. Blur the
combined contribution and apply scene bloom strength once. Never multiply beauty brightness by `bloomGain`, and never
apply emissive intensity twice. `bloomGain: 0` suppresses the halo while retaining the visible luminous surface. It
cannot override `exclude`. Gain inherits independently through groups, with nearest explicit value winning; removing it
restores inherited/default gain.

## Neon, monitors, and database rings

These are first-class acceptance cases for the bloom milestone, not optional showcase effects. All three must work
together in one scene at fixed exposure.

| Subject            | Visible source                                                                    | Halo policy                                              | Detail to preserve                                                   |
|--------------------|-----------------------------------------------------------------------------------|----------------------------------------------------------|----------------------------------------------------------------------|
| Neon tube or trace | Bright, colored emissive core; physical tube geometry or a crisp connector stroke | Explicit include, moderate gain, restrained scene radius | Continuous core, recognizable hue, no halos through opaque occluders |
| Lit monitor        | Image/content rendered as a self-lit screen, independent of frame lighting        | Off by default; optional small gain and content mask     | Text, chart colors, black levels, bezel, readable contrast           |
| Database ring      | Separate thin emissive band on an opaque body                                     | Include bands only; casing and cap do not emit           | Visible spacing between rings, cylindrical form, stable thin lines   |

### Independent controls instead of one brightness slider

Keep four authoring decisions separate:

1. **Source brightness:** material `emissiveIntensity`, or screen/connector adapter radiance.
2. **Halo contribution:** `effects.bloomGain` weights that source without changing its visible core.
3. **Halo spread and total strength:** composer radius/strength control the shared blur.
4. **Light on nearby surfaces:** explicit lights or a documented lighting approximation, independent of bloom.

One shared blur is the first-release budget. Gain can make a screen's halo weaker than neon, but cannot give each source
a different blur radius. If simultaneous narrow monitor glow and broad neon glow require separate kernels, add a later
bounded set of named bloom groups with declared memory/pass cost. Do not silently allocate a composer or blur chain per
node.

### Neon: bright core with a colored halo

```vue
<!-- Proposed effects metadata; material controls already exist. -->
<vx-box
    :size="2.4" :depth="0.06" :height="0.06"
    :material="{
    color: '#12404a', emissive: '#00d9ff', emissiveIntensity: 3,
    roughness: 0.35,
  }"
    :effects="{ bloom: 'include', bloomGain: 0.8 }"
/>
```

This strip illustrates emission; a shaped neon tube should use appropriate authored geometry. Preserve a sharp source in
the beauty pass and add its blurred contribution separately. Never replace the source with a blurred sprite. Connector
adapters should preserve the sharp stroke/arrow and extract their authored emission independently of routing.

Thresholds based on luminance are hue-dependent: equally strong saturated blue and green need not cross the same
threshold. Selected-mode threshold zero plus explicit membership avoids forcing blue rings to extreme intensities merely
to glow. Tone mapping can still desaturate bright cores. Compare ACES and neutral output at fixed exposure; retain the
colored halo and distinguishable categories instead of promising exact hue preservation at arbitrary brightness. Do not
normalize emission from the current dataset or animate exposure to chase brightness.

### Monitors: self-lit content without a glowing rectangle of unreadable text

`DisplayWall` currently creates a canvas-backed `MeshBasicMaterial` screen with `toneMapped: false`, separate from its
frame. The design must adapt that existing path; assigning emissive values to a standard material is not sufficient for
it. Add an explicit screen contribution and a proposed surface style:

```ts
interface VxDisplayScreenStyle {
    brightness?: number // finite 0–8 linear radiance multiplier; default 1
    effects?: VxNodeEffects // screen defaults to bloom: 'exclude'
    bloomMask?: Texture | null // borrowed non-color mask; null clears it
}
```

```vue
<!-- Proposed screen-style prop; monitorSurface is existing display content. -->
<vx-display-wall
    :surface="monitorSurface"
    :screen-style="{
    brightness: 1,
    effects: { bloom: 'include', bloomGain: 0.08 },
    bloomMask: screenGlowMask,
  }"
/>
```

`screen-style` controls the screen only. It neither lights the frame nor changes the screen canvas's drawing commands.
An omitted screen bloom policy remains excluded even when an ancestor includes bloom; authors explicitly opt in through
`screen-style.effects`. Reuse existing material styles for frames rather than applying screen settings to a compound
root.

Decode color content from its declared color space once, multiply linear screen radiance by brightness once, and send
the same content to beauty and emission extraction. The optional mask uses linear non-color data: black suppresses halo
contribution, white allows it. It does not modify screen alpha, content brightness, or selection. Sample it in the
screen's content UV space, including curved/mirrored surfaces, rather than independent world UVs. Validate compatible
mapping, and use existing borrowed-texture ownership rules.

Text baked into a canvas/video texture cannot be recovered as protected annotation geometry. Keep bloom off by default;
for intentional glow use a mask that excludes glyphs/chart lines, modest gain, or render critical labels as separate
protected contributions. A source mask does not shield text from a neighboring halo, so masking alone cannot guarantee
readable small text; the combined fixture must verify it, and strict readability should use bloom-off or separate
protected labels.

The current `toneMapped: false` flag is not an exemption from a final fullscreen output transform. Initial support uses
the managed HDR output and documents that screen colors may differ from an HTML chart. Exact display-referred screen
reproduction needs a separate depth-aware, display-space composition mode with defined reflection behavior; defer that
mode rather than claiming existing flags solve it. Brightness and screen-content updates must not recreate geometry or
the pass chain.

### Database rings: narrow emitting bands, opaque unlit casing

```vue
<!-- Proposed effects metadata on existing stacked cylinders. -->
<vx-stack :gap="0">
  <vx-cylinder :size="1.1" :height="0.26" material="database-body"/>
  <vx-cylinder
      :size="1.12" :height="0.025"
      :material="{ color: '#168bdf', emissive: '#18aaff', emissiveIntensity: 2 }"
      :effects="{ bloom: 'include', bloomGain: 0.6 }"
  />
  <vx-cylinder :size="1.1" :height="0.26" material="database-body"/>
</vx-stack>
```

Use separate bands or an emissive texture mask; including the database's whole lit beauty color would also bloom its cap
and highlights. Adjacent opaque sections must occlude hidden band surfaces. At normal viewing distance the glow must not
merge multiple rings into one blue blob. Avoid coplanar bands and z-fighting; authored geometry owns spacing, not the
composer.

Extract thin sources with coverage-aware downsampling so subpixel rings and traces do not disappear or flicker when
orbiting, zooming, or reducing DPR. Do not compensate by changing semantic geometry width automatically. If reduced
bloom resolution cannot preserve thin sources, retain full-resolution extraction with cheaper blur where supported, or
disable the halo with a diagnostic while keeping the crisp source.

### Spill, reflections, and motion

Neon and screen emission should remain visible when bloom is disabled or reduced-effects mode is active. Bloom adds no
physically correct illumination, shadows, or reflected radiance. Nearby colored spill requires separately authored
lights, a lighting bake where applicable, or an explicitly labeled approximation. Do not spawn a point light for every
ring, pixel, or connector; any later automatic emitter-light adapter needs an explicit light budget and opt-in
ownership.

Reflections need a precise first-release rule: the reflector renders the luminous beauty source into its normal
reflection texture, but selected bloom does not infer emitter membership from that texture. Reflected halos are deferred
until reflection emission/membership can be carried in a matching auxiliary buffer. Luminance mode may bloom a bright
reflection, with its usual risk of also blooming other highlights. Never re-enter the main composer during reflection
rendering, and never silently mark the entire floor as an emitter to fake this feature.

No random flicker, pulsing, or scanlines by default. If users bind emission to activity, smooth and bound it, preserve
source identity and shader allocations, and freeze decorative motion under reduced-motion policy. This does not suppress
meaningful static emission or data updates.

## Fluent API and custom passes

```ts
import { composer } from '@exceeder/vuetrex'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { ColorifyShader } from 'three/addons/shaders/ColorifyShader.js'

// Keep factories stable when updating other parameters.
const tint = () => new ShaderPass(ColorifyShader)
const plan = composer({ quality: 'balanced', reducedEffects: false })
  .bloom({ mode: 'selected', strength: 0.3 })
  .ambientOcclusion({ intensity: 0.2 })
  .grading({ contrast: 1.05, saturation: 0.95 })
  .vignette({ strength: 0.08 })
  .pass('tint', tint, 'display')
  .build()

await stage.setComposer(plan)
// Or bind the same value with <vx-composer v-bind="plan" />.
// Remove the programmatic override, returning to any declaration/stylesheet:
await stage.setComposer(undefined)
```

Each fluent operation returns a new immutable builder. `build()` produces validated, frozen `VxComposerOptions`;
constructing a plan allocates no GPU resources. Programmatic settings override declarations, which override stylesheets.
The last authored `passes` array replaces earlier arrays; use `[]` to clear inherited passes.

Custom pass keys must be unique and non-empty. Factories receive `{ renderer, scene, camera }` and must create fresh
Three.js `Pass` instances. The controller owns resizing and disposal on replacement, configuration removal, and scene
teardown. Factories own cleanup if they throw before returning. Keep the same factory reference for stable topology;
changing a factory, key, phase, or order rebuilds the pipeline. Updating built-in parameters preserves pass instances.
A failed factory disposes the partial candidate and retains the last working pipeline.

The `linear` phase runs before output conversion; `display` runs after grading/vignette. Insertion order is preserved
within each phase. Custom passes must consume the preceding color buffer, preserve the chosen phase's color space,
and avoid another output conversion. Custom passes run when enabled even under reduced-effects policy; applications
must decide whether their custom effects are appropriate. Custom GPU memory is not included in the diagnostics estimate.

## Pipeline and color management

```text
world beauty (linear HDR)
  → optional AO
  → optional semantic/luminance bloom extraction, blur, and composition
  → custom linear passes (in insertion order)
  → output conversion (preserves the renderer's tone-mapping policy)
  → optional grading/vignette
  → custom display passes (in insertion order)
  → optional protected world annotations with depth-correct occlusion
  → FXAA if selected
  → canvas; DOM overlays remain outside the composer
```

Disabled effects allocate no pass. Balanced quality renders bloom and AO auxiliaries at half resolution; high uses full
resolution; low disables AO with an observable fallback. Protected annotations are omitted from image effects and
redrawn after display effects against freshly rendered world depth. Transparent surfaces retain their authored
`depthWrite` behavior during that occlusion render.

Keep intermediate colors linear and HDR-capable. Tone-map and convert for display exactly once. Three.js documents
`OutputPass` for terminal tone mapping/color conversion, with sRGB-input effects such as FXAA following it. It reads
renderer settings, so one controller owns/restores them; do not apply exposure again in each pass.
See [OutputPass](https://threejs.org/docs/pages/OutputPass.html).

The installed `UnrealBloomPass` is a candidate implementation, not the public contract. Its threshold, radius, and
strength controls do not implement semantic selection or exclusion; that needs a separate adapter.
See [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html).

The managed HDR path may differ from the current single-pass output. Capture baselines before enabling it and gate
adoption behind explicit configuration. Compare an identity profile with a defined reference transform; do not assume
legacy equivalence.

`material.toneMapped: false` alone cannot exempt an object from a full-frame output transform. Document this limitation;
exact untonemapped annotations require a separate depth-aware display-space overlay path. DOM legend swatches do not
promise pixel-identical lit mesh colors. For quantitative color ramps recommend neutral output, identity grading,
effects off, and a visible legend; verify category distinguishability and value ordering visually.

## Readability, focus, and accessibility

DOM text remains untouched. Render owned world-label contributions after blur/grading, using world depth to preserve
occlusion, after display effects. Preserve alpha edges and camera alignment. Do not merely draw every label on top.
Unsupported custom annotation renderers remain in the world pass and report a limitation when protection is requested.

`reducedEffects: 'system'` follows `prefers-reduced-motion` as a conservative opt-out from decorative effects. This is a
Vuetrex policy, not a claim that static bloom is motion. Disable bloom, vignette, future blur/noise, and effect
transitions while preserving AA and selection cues. `true` forces that policy; `false` opts out of automatic reduction.
Scheme changes are immediate initially. Future transitions must not animate semantic colors through ambiguous
intermediate states.

## Architecture and lifecycle

```text
stylesheet inputs + ComposerDeclaration (extends StageDeclaration)
  → pure resolveComposerOptions()
  → immutable requested configuration
  → compileComposerPlan(configuration, capabilities, quality policy)
  → keyed ComposerController reconciliation
  → Scene.render(), resize(), destroy()
```

| Location                                         | Responsibility                                                                      |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| `scene/composer.ts`                              | Public values, presets, validation, pure resolution                                 |
| `scene/declarations.ts`                          | Host-only declaration and exclusive ownership                                       |
| `styling/stylesheets.ts`                         | Scheme integration and immutable inputs                                             |
| `three/postprocessing/ComposerController.ts`     | Plan realization, rendering, resize, disposal, status                               |
| `three/postprocessing/` adapters                 | Bloom masks, AO, annotations, output, AA                                            |
| `nodes/DisplayWall.ts` and emitter adapters      | Separate screen/frame contributions, linear source extraction, screen-style updates |
| `three/scene.ts`                                 | Delegate existing composer lifecycle to the controller                              |
| `nodes/types.ts`, public exports, template types | Registration and public API                                                         |

The declaration has no spatial identity, bounds, layout, focus, or picking. `Scene` owns the controller; the declaration
owns configuration only. The controller borrows scene, camera, and application textures, and owns passes, targets,
proxies, and subscriptions. Do not repair logical-tree problems in `stage.ts` or vendor addon code into
`three/external/`.

Emitter contributions identify a stable owner/key, role (`surface`, `screen`, `annotation`), beauty/depth coverage,
resolved policy/gain, and an adapter for linear radiance extraction. Standard materials extract emissive color ×
intensity × emissive-map sample; screen and unlit stroke adapters extract their own authored radiance. Preserve UV
transforms, alpha testing, deformation, and instanced transforms. Skip unsupported adapters with a diagnostic rather
than copying total beauty color. Screen texture repaints and brightness/gain changes update borrowed inputs/uniforms;
shape replacement or removal reconciles/disposes only the affected adapter resources.

Stable pass keys identify resources. Strength, threshold, grading, and exposure update parameters without allocating a
new composer. Activation, mask mode, and quality may change resource topology. Prepare a candidate plan, validate it,
swap at a frame boundary, and dispose replaced resources. On failure retain the last working plan and emit a diagnostic.
Disabled effects release exclusive resources; shared inputs have explicit ownership/reference counts. No unbounded cache
of old profiles.

Resize renderer and composer using the same CSS size and effective DPR; detect DPR changes without CSS resize and avoid
applying DPR twice. Suspend allocation for zero-sized/hidden canvases. Reflection rendering must not recursively invoke
the main composer. Apply the reflected-emission limitations above; do not imply selected bloom membership survives an
ordinary reflection texture.

Unmount the inner Vue tree before destroying the stage. Teardown must be idempotent: unsubscribe, stop controller work,
dispose owned passes/targets exactly once, restore borrowed state, then destroy the renderer. Disposing `EffectComposer`
does not replace disposal of added passes. Context restoration rebuilds the effective plan; failed restoration retains a
basic render fallback and observable status.

## Performance and diagnostics

Proposed budgets to benchmark, not performance promises:

| Quality  | DPR cap | Bloom extraction scale |                           AO scale | Use                            |
|----------|--------:|-----------------------:|-----------------------------------:|--------------------------------|
| Low      |       1 |                    0.5 | Off with diagnostic when requested | Mobile / dense live views      |
| Balanced |     1.5 |                    0.5 |                                0.5 | Interactive default            |
| High     |       2 |                      1 |                                  1 | Presentation / capable desktop |

Scales are relative to the effective drawing buffer; bloom's internal mip chain is additional. `maxPixelRatio` can
lower, not exceed, the quality cap. Document samples and memory estimates after adapter benchmarks. Canvas antialiasing
does not guarantee offscreen AA; test the final path on thin connections, labels, and silhouettes.

Fallback order: lower auxiliary resolution, disable AO, disable bloom, then retain a basic render path. Report each
change. Never silently alter data, geometry, palette, or selection. Defer automatic frame-time quality adaptation until
hysteresis and predictability are tested.

Expose read-only `stage.composerDiagnostics()` with requested/effective options, pass keys, target sizes, estimated
owned bytes, supported features, fallback reasons, allocation/update counters, and last error. GPU timings are optional
and marked unavailable when unsupported. A deduplicated `composer-status` event reports meaningful
configuration/fallback/failure changes, not frames.

## Delivery and verification

1. **Foundation:** controller extraction preserving legacy rendering; resolver, profiles, stylesheet/declaration
   integration, output/AA prototype, diagnostics, baseline captures, and ownership tests.
2. **Bloom and emitters:** luminance/HDR prototype followed by emissive-only selected masks, contribution gain,
   screen/frame separation and `screen-style`, plus supported connector/particle adapters. Release luminous profiles
   only when the combined neon/monitor/database fixture passes and white panels/text remain controlled.
3. **Depth and annotations:** shared depth/normal inputs, AO, protected labels, grading/vignette, quality tiers,
   studio/editorial examples.
4. **Extension:** fluent custom pass factories with explicit linear/display placement and owned cleanup.

Publish a support table per milestone. Do not ship presets with silently missing planned effects; reject
not-yet-supported authored controls with useful diagnostics.

Acceptance checks:

- Pure tests: precedence, preset switching, `false`/`true`, prop removal, validation, schemes, immutability,
  requested/effective separation.
- Renderer tests: exclusive ownership, no spatial/layout impact, idempotent reactive installation, no dependency
  mutation, declaration removal revealing current sheet settings.
- Resource tests: no allocations for parameter-only changes; disposal on replacement/unmount; repeated toggling;
  viewport/DPR changes; allocation failures; context loss/restoration.
- Browser fixtures: workshop2, dense thin routes, categorical/continuous palettes, bright panels, occluded emitters,
  alpha surfaces, nested placement, generated geometry, instances, particles, mirrors, world text, DOM labels,
  selection, low-quality fallback.
- Combined emitter fixture: cyan neon, a canvas monitor with fine text/charts, blue database rings, and a white
  non-emitting surface at fixed exposure. Verify each remains distinguishable in light/dark, with bloom enabled/disabled
  and reduced effects.
- Emission tests: saturated red/blue/green, emissive maps, screen mask UVs, zero gain with visible core,
  threshold-before-gain ordering, no double intensity/color decoding, body/frame exclusion, and fully occluded emitters.
- Readability/motion tests: ring separation, crisp neon cores, screen black levels, masked text, content repaints,
  camera orbit/zoom, low-DPR thin-line stability, reduced-motion behavior, and documented
  reflection/transparent-occlusion fallbacks.
- Ownership tests: changing source brightness/gain, repainting a screen, or toggling screen emission must not recreate
  geometry/pass topology; removing one emitter releases its mask resources without disposing shared caller textures.
- Fixed-camera/time/viewport/DPR captures for every profile and effects-off in light/dark. Check double gamma/exposure,
  halo bleed, disappearing edges, obscured text, AO flicker during orbit, and changed color ordering. Use
  device-tolerant image thresholds and inspect failures.
- Benchmark small and dense scenes for frame time and memory on named hardware before promising frame rates.
- Run focused tests, `pnpm test:run`, `pnpm typecheck`, packaging/export checks when public exports change, and
  `pnpm docs:build`. Public examples must compile against shipped exports.

## Related work

- [Designing legible data scenes](/guide/visual-design)
- [Stylesheet materials](/guide/stylesheet-materials)
- [Architecture](/architecture)
- Repository proposal: `docs/superpowers/plans/2026-09-04-built-in-automated-studio-light.md`. Lighting bake and
  composer controllers own separate resources and invalidation. Changing bloom/exposure must not trigger a lightmap
  rebake.

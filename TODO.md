# Roadmap

Reviewed September 27, 2026 against the implementation and workshop2 findings.
Delivered means present in this checkout, including current local changes; it does
not imply a published package release. Proposed designs are identified separately
from implemented runtime features.

## Delivered

### Renderer and layout

- Content-driven, pluggable measure/place layouts and nested local coordinate spaces.
- Global and per-instance custom element registration; functional-style custom node factories.
- Ring `start-angle` and `direction`; shared container alignment.
- Reverse ordering for row, layer, and stack layouts.
- Explicit `fit="shrink|none"` container behavior.
- Bounds-driven camera fitting and named focus.

### Data-driven authoring

- [Fluent connector graph](docs/superpowers/plans/2026-09-12-fluent-connector-graph.md):
  immutable functional/fluent authoring, keyed reconciliation, endpoint/port
  resolution, route networks, buses/bundles, and stroke/geometry/particle output.
  Connector declarations remain host-only, outside spatial layout and identity.
- Connector template declarations (`vx-connectors`, `vx-edge`, `vx-port`) and
  reusable appearances. Graph tests cover equivalence, immutability, stable-key
  reorder, incremental updates, custom endpoints, and shared resolved paths.
- Composition recipes and placements; procedural geometry graphs and reusable
  modules; particle graphs and backend extension points.

### Scene presentation and styling

- Common/light/dark stylesheet materials and connector appearances, reactive
  material updates, and component-owned canvas textures.
- Declarative environment, camera, and floor configuration, including studio
  environment lighting and matte/reflective floors.
- [Composer and visual styles](docs/design/composer-and-visual-styles.md):
  stage-owned controller, reactive declarative configuration and stylesheet
  resolution, output/AA, luminance and selective bloom, annotation protection,
  ambient occlusion, grading/vignette, depth of field, semantic outlines, LUTs,
  and per-instance/material-channel masks.
- Technical, studio, luminous, and editorial profiles now apply their advertised
  runtime treatments. Quality scaling, reduced-effects behavior, capability
  fallbacks, diagnostics, resource disposal, and reactive reconfiguration are
  covered by the composer implementation and tests.

### Workshop2 and verification

- [Workshop2 data-floor scene](workshops/workshop2/App.vue): rounded gridded base,
  servers, database, processing hub, metric bars, terminal, satellite stores, and
  floor-level connections. The wall is intentionally outside this example's scope.
- Local plinth extension and reusable floor ports demonstrate the existing custom
  element and connector APIs; these are example components, not new built-ins.
- Fixed scene declarations rejecting kebab-case floor fade props and leaving a
  blank canvas; regression coverage includes numeric validation and prop removal.
- Audited all scene, connector-host, edge, and port declarations. Shared prop-name
  normalization, numeric/boolean validation, explicit invalid-value errors, and
  renderer-level tests now cover both spellings and removal/inheritance behavior.
- Corrected the example's submerged metric bars and connectors ending inside
  models; removed the redundant runtime compiler configuration warning.
- Added a workshop-specific typecheck configuration. Corrected stale camera-test
  expectations to match the existing above-floor safety margin.
- CI verifies library types, tests, builds, and ESM consumption. Workshop/browser
  coverage and published coverage reports remain pending below.

## Current priorities

### 1. Make rendering failures visible and catch them in examples

- [x] Show actionable development-time scene errors with tag/node context,
  property details where available, and correction guidance. `scene-error` events
  and console diagnostics remain available in production; see [scene errors](docs/guide/scene-errors.md).
- [ ] Include workshops in a maintained typecheck/CI command. Root `tsconfig.json`
  currently excludes them; workshop2's separate configuration is only a first step.
- [ ] Add browser smoke checks for representative demos/workshops: successful
  mount, rendered content, no unexpected console errors, and navigation/unmount.
- [ ] Add automated visual regression coverage with fixed camera, viewport, DPR,
  animation time, and scheme. Begin with workshop2 and include unequal-height bars,
  thin connectors/arrows, labels, nested placement, and reflective floors. Manual
  screenshot inspection is not a substitute for this coverage.

### 2. Complete visualization-focused composer examples and regression coverage

- [x] Implement the [composer design](docs/design/composer-and-visual-styles.md):
  controller/ownership, declarative configuration and stylesheet resolution,
  output/AA, selective bloom, depth/annotation protection, ambient occlusion,
  restrained grading/vignette, depth of field, outlines, LUTs, and per-instance
  masks.
- [x] Ship technical, studio, luminous, and editorial profiles with their
  advertised runtime treatments.
- [x] Protect labels and semantic overlays; support reduced effects, quality
  limits, capability fallbacks, diagnostics, reactive updates, and owned resource
  disposal.
- [ ] Add maintained light/dark examples and effects-off comparisons, then include
  them in browser and visual regression coverage. Bloom remains a screen-space
  treatment rather than physical light spill.

### 3. Expose lighting and camera controls for illustrative scenes

- [x] Add declarative key/fill intensity and shadow quality controls through
  `vx-lighting`, with reactive updates, default restoration, and owned shadow-target cleanup.
- [ ] Develop the [automated studio-light proposal](docs/superpowers/plans/2026-09-04-built-in-automated-studio-light.md)
  for soft/contact shading, with explicit bake ownership, invalidation, and fallback.
  Keep lighting work separate from composer AO and bloom.
- [ ] Design orthographic camera support for near-isometric visualizations,
  preserving content fitting, focus, resize behavior, and interaction parity.

### 4. Reduce custom-shape and layout authoring friction

- [x] Provide a supported public fixed-shape extension entry point: `MeshNode`,
  `MeshNodeStage`, and `MeshState`, with [ownership guidance](docs/guide/fixed-shape-extensions.md)
  and a typechecked packaged-consumer example. Workshop2's plinth uses the public entry point.
- [x] Share custom tag names through `createElementConfig()`: compiler recognition
  and checked runtime bindings use one manifest. The lightweight `/compiler` entry,
  workshop2, packaged-consumer fixture, and extension guide demonstrate the setup.
- [ ] Add a rounded platform primitive or configurable planar corner radius,
  distinct from edge bevel thickness, with predictable grid UVs and bounds. The
  workshop's local plinth proves the need; it does not deliver a library primitive.
- [ ] Explain vertical alignment using unequal-height bars: `align-y="start"`
  shifts children down by half their height rather than grounding their bases.
  Clarify the API before considering a separate base-alignment option.

### 5. Improve connector presentation for small diagrams

- [ ] Give built-in stroke arrowheads an independent size control; custom geometry
  markers already exist, but simple thin routes should not require one just to
  keep arrowheads readable.
- [ ] Add controllable rounded orthogonal bends while preserving endpoints,
  obstacle clearance, route identity, and hit testing.
- [x] Connect semantic glow/emission styling to the composer without changing
  route topology; connector effect overrides preserve inherited membership.
- [ ] Document ground-level ports outside object bases and when to use automatic
  versus manual routes. Workshop2's authored world-space bends reproduce a fixed
  illustration but need updating when its object layout changes.

### 6. Support articulated animation without application-owned transform plumbing

- [ ] Extend animation authoring beyond `animateTo()`'s Y translation and scale:
  support full XYZ translation and quaternion/local-axis rotation, with explicit
  pivot/hinge origins. Workshop2's folding monitor currently needs nested placement
  groups and GSAP-driven reactive quaternions for its rear X and side Y hinges.
- [ ] Provide owned, reversible multi-node timelines with sequence/overlap controls,
  interruption handling, and cancel/reverse handles. Current `animateTo()` returns
  void and does not register its timelines for node/stage teardown; workshop2 owns
  and kills its GSAP timeline explicitly.
- [ ] Define how animated transforms compose with reactive placement/layout and
  update bounds/connectors. `animateTo()` directly mutates Three.js transforms,
  while placement sync can overwrite them; workshop2 animates placement inputs to
  keep a single source of transform state. Include interruption and unmount tests.

## Follow-ups requiring a concrete use case

- [ ] Consider `wrap="grid"` for one-dimensional layouts when an authoring use
  case requires it.
- [ ] Consider `fit="contain"` or overflow diagnostics separately; avoid expanding
  the fit API without a demonstrated need.
- [ ] Publish test coverage reporting. A local coverage command exists, but the
  current CI workflow does not generate or publish a report.
- [x] Deliver depth of field, per-instance bloom masks, outlines, LUTs, and other
  advanced effects as opt-in composer features; baseline profiles remain legible
  without enabling them.

See [workshop2's evaluation notes](workshops/workshop2/README.md) for the reference
comparison and remaining visual approximations, including physically accurate
light spill, soft shadows, and simplified model details.

## Testing a source build in another project

1. Run `pnpm build`.
2. Run `pnpm pack`.
3. Copy the generated tarball path.
4. In the target project, run `pnpm add /path/to/exceeder-vuetrex-vX.X.X.tgz`.
5. To update it, run the same `pnpm add` command with the new tarball.

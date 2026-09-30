# Data floor: trying Vuetrex from a reference

Open `/workshops/workshop2/` with `pnpm dev:demos` running. The scene recreates
a studio presentation of the data floor: a finely textured rounded plinth,
vented servers, blue database, folding processing hub, metric columns, satellite
stores, and a rear operations display with illustrative telemetry.
Drag to orbit and scroll to zoom. Click the metallic hub (or the monitor button)
to raise its packed screens, rotate around the rear X hinge, then unfold the outer
and inner wings around the center screen's side Y hinges. Click again to close;
clicking during motion reverses from the current pose. The sequence runs at 2× speed
(1.2 seconds). Opening moves to an explicit hub close-up; closing restores the scene overview.
One 1.2-second `sine.inOut` camera tween animates both the target and orbit, so
unfolding panels do not restart bounds-fitting transitions.

Click the blue database for a separate animation built with `stage.animateTo()`.
Its eight stacked cylinders rise and slide along distinct radial directions into
an elevated ring, then return to their exact stack positions on the next click.
The staggered XYZ motion uses semantic cylinder IDs and does not add placement
groups or application-owned transform objects.

The models, materials, placements, ports, and connections use Vuetrex. The
rounded plinth is a local fixed `MeshNode` extension registered through the
scene's `elements` prop; it uses the standard renderer lifecycle and material
ownership. Its UVs project the canvas grid across the top. `things/FloorPorts.vue`
shares four explicit ports outside each object's base. A few manually authored
bends reproduce an illustration rather than an automatically arranged diagram.

## Studio comparison

The **Composer effects** switch mounts/removes `vx-composer` without resetting the
camera or monitor. Off returns to the legacy renderer, including its output and
antialiasing behavior; lighting, materials, and display content stay identical.
On uses high quality, DPR capped at 2, ACES output, contact AO, restrained selected
bloom, subtle grading/vignette, and depth of field focused on the core or open hub.
Outlines are disabled for the photographic presentation. System reduced-motion
preferences still disable decorative bloom, vignette, and depth of field.

High-quality shadows, key/fill intensities 2.7/0.65, and studio environment 0.48
provide surface definition. The 2048² plinth grid uses anisotropic filtering and
a small, deterministic bump texture. `RearDisplay.vue` paints a 2560×768 canvas;
it is excluded from bloom to preserve small text and chart contrast.

## Problems found and corrected

- `vx-floor` rejected `fade-start` / `fade-end`, leaving the scene blank. Scene
  declarations now normalize kebab-case properties, including numeric validation
  and prop removal. A regression test covers this path.
- `align-y="start"` moved the bar bases below the platform. The default base
  alignment keeps all three columns resting on it.
- Center ports hid connector arrowheads inside models. External floor-level
  ports make the routes and endpoints visible.
- Removed the redundant runtime `compilerOptions` assignment, which produced a
  Vue warning. Custom elements are configured in Vite.
- Removed an extra blue cube absent from the reference and adjusted object
  positions, proportions, materials, floor shape, and framing.
- Root typechecking excludes workshops. This example has its own config:
  `pnpm exec vue-tsc --noEmit -p workshops/workshop2/tsconfig.json`.
- The existing camera test expected Y = 0 although the implementation clamps
  to 0.1. Updated its assertions to the existing safety margin; camera behavior
  is unchanged.

## Improvements I would want as a new user

1. **Visible scene errors.** Implemented: development errors identify the failing
   declaration and remain observable through the `scene-error` event.
2. **A rounded platform primitive.** Box corner rounding is fixed and does not
   provide the wide planar corner radius in this reference. This extension
   uses the supported public `MeshNode` entry point. Its `elements.config.ts` shares
   tag recognition with Vite and validates the runtime implementation binding,
   avoiding a separate compiler tag list.
3. **Clearer vertical alignment.** `start` shifts each child down by half its
   height; it does not mean “put the base on the floor.” Name or document this
   distinction prominently and show unequal-height bars in examples.
4. **Contact shading and camera.** Composer AO now adds contact shading.
   Baked soft lighting and an orthographic camera remain separate future work.
5. **Connector presentation controls.** Independent arrowhead size, rounded bends,
   and an optional glow would make thin blue data routes easier to reproduce.
   The database bands now contribute restrained selected bloom.
6. **Example checks in CI.** Include workshops in typechecking and add a browser
   smoke check that catches mount errors and blank canvases.

The result is an approximation, not a pixel match. The reference's beveled hub
details and luminous line halos remain simplified; AO is a screen-space effect.
Manual waypoint coordinates would also need updating if the object layout changes.

## Folding monitor and animation API findings

`things/MonitorHub.vue` owns one GSAP timeline and kills it on unmount. It animates a
reactive pose; computed `Placement` values drive the nested hinge groups.
`things/MonitorPanel.vue` supplies the three reusable framed screens. The hub keeps its
original semantic ID and fixed floor ports, so its ground connections stay attached.

Vuetrex's placement hierarchy and bubbling clicks are adequate for building the
mechanism. `animateTo()` now supports XYZ translation, quaternion or local-axis
rotation, and local pivot points, so individual panels no longer require a placement
group solely to establish a hinge. The workshop still owns its reactive placement
timeline because `animateTo()` does not yet provide reversible multi-node sequencing
or owned cancellation. Direct transform tweens can also compete with reactive
placement synchronization. Those follow-ups remain in the roadmap's articulated
animation section.

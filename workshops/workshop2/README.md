# Data floor: trying Vuetrex from a reference

Open `/workshops/workshop2/` with `pnpm dev:demos` running. The scene recreates
the reference's floor only: gridded rounded plinth, two white servers, blue
database, processing hub, three bars, coral terminal, and two satellite stores.
Drag to orbit and scroll to zoom.

The models, materials, placements, ports, and connections use Vuetrex. The
rounded plinth is a local fixed `MeshNode` extension registered through the
scene's `elements` prop; it uses the standard renderer lifecycle and material
ownership. Its UVs project the canvas grid across the top. `FloorPorts.vue`
shares four explicit ports outside each object's base. A few manually authored
bends reproduce an illustration rather than an automatically arranged diagram.

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

1. **Visible scene errors.** An invalid declaration currently produces a blank
   canvas and a console exception. Show a useful development error in the scene.
2. **A rounded platform primitive.** Box corner rounding is fixed and does not
   provide the wide planar corner radius in this reference. This extension
   requires an internal `MeshNode` import plus a separate compiler tag entry.
   A public extension entry point and one registration helper would simplify it.
3. **Clearer vertical alignment.** `start` shifts each child down by half its
   height; it does not mean “put the base on the floor.” Name or document this
   distinction prominently and show unequal-height bars in examples.
4. **Soft contact shading and orthographic camera.** The scene now uses
   `vx-lighting` with key intensity 3, fill 0.8, and medium shadows, plus studio
   environment intensity 0.3 to reduce washed-out surfaces. The reference's softer
   contact shading and near-isometric projection remain future improvements.
5. **Connector presentation controls.** Independent arrowhead size, rounded bends,
   and an optional glow would make thin blue data routes easier to reproduce.
   The current bright bands are emissive, but do not create the reference's bloom.
6. **Example checks in CI.** Include workshops in typechecking and add a browser
   smoke check that catches mount errors and blank canvases.

The result is an approximation, not a pixel match. The reference's beveled hub
details, luminous line halos, and soft ambient occlusion remain simplified.
Manual waypoint coordinates would also need updating if the object layout changes.

# Living cable: procedural organic forms

Open `/workshops/workshop3/` while `pnpm dev:demos` is running.

This workshop starts with one analytic guide curve. Deterministic points on a disk become strand roots, then a
parallel-transport frame carries those roots along the guide. Each root receives a phase, twist direction, radial
pulse, and optional late release from the bundle. The sampled positions become smooth Vuetrex tube primitives:

```ts
geo.line({ points, path: 'smooth', thickness })
  .material(channel)
  .named(`strand-${index}`)
```

The strands are joined into one immutable geometry graph and realized by one `vx-geometry` host. Growth tips reuse one
icosphere prototype through a point distribution, so those pieces are GPU-instanced even though the tube paths have
unique topology.

## How close is this to Blender Geometry Nodes?

Vuetrex can already make this class of form, but the authoring level is lower than Blender's curve workflow. Smooth
tubes, deterministic distributions, fluent immutable graphs, material channels, reusable point domains, instancing,
and keyed realization are present. The workshop keeps frame transport and per-sample curve deformation in ordinary
TypeScript because the geometry API does not yet have a curve domain, curve fields, resampling operators, variable
radius along a spline, or a GPU curve backend.

That is a useful boundary rather than a dead end: application math produces compact point arrays, while Vuetrex owns
the scene node, tube topology, materials, effects, bounds, and cleanup. The next high-value additions would be a
`geo.curve()` source with per-point attributes, `resampleCurve`, `offsetCurve`, and `curveToTube` with a radius field.
Those would turn the sampling code in `organicBundle.ts` into reusable graph operators without changing the renderer
architecture.

Run the focused check with:

```sh
pnpm exec vue-tsc --noEmit -p workshops/workshop3/tsconfig.json
```

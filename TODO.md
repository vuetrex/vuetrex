# Roadmap

## Delivered

- Content-driven, pluggable measure/place layouts
- Nested local coordinate spaces
- Global and per-instance custom element registration
- Functional-style custom node factories
- Ring `start-angle` and `direction`
- Shared container alignment
- Reverse ordering for row, layer, and stack layouts
- Explicit `fit="shrink|none"` container behavior
- CI verification for typechecking, tests, builds, and ESM consumption

## Current priorities

1. Develop the [fluent connector graph](docs/superpowers/plans/2026-09-12-fluent-connector-graph.md) without making connector declarations spatial nodes.
2. Add automated visual regression coverage for representative 3D scenes.
3. Consider `wrap="grid"` for one-dimensional layouts when a concrete authoring use case requires it.
4. Consider `fit="contain"` or overflow diagnostics separately; avoid expanding the fit API without a demonstrated need.
5. Publish test coverage reporting.

## Testing a source build in another project

1. Run `pnpm build`.
2. Run `pnpm pack`.
3. Copy the generated tarball path.
4. In the target project, run `pnpm add /path/to/exceeder-vuetrex-vX.X.X.tgz`.
5. To update it, run the same `pnpm add` command with the new tarball.

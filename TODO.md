# Roadmap

## Delivered

- Content-driven, pluggable measure/place layouts
- Nested local coordinate spaces
- Global and per-instance custom element registration
- Ring `start-angle` and `direction`
- Shared container alignment

## Remaining design work

1. Define `fit="contain"` and `fit="overflow"` behavior.
2. Add `wrap="grid"` for one-dimensional layouts.
3. Reconcile the proposal's formal `bounds: Vector3` vocabulary with the existing `measuredSize`.
4. Design functional-style node components.
5. Expand documentation examples and publish coverage reporting.

## Testing a source build in another project

1. Run `pnpm build`.
2. Run `pnpm pack`.
3. Copy the generated tarball path.
4. In the target project, run `pnpm add /path/to/exceeder-vuetrex-vX.X.X.tgz`.
5. To update it, run the same `pnpm add` command with the new tarball.

# AGENTS.md

## Overview

Vuetrex is a Vue 3 library for authoring 3D diagrams with Vue templates and rendering them through Three.js. It replaces Vue's DOM renderer with a custom renderer and maintains a logical node tree that synchronizes into a Three.js scene.

Read [docs/architecture.md](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/docs/architecture.md?type=file&root=%252F) before making structural changes.

## Working Model

Think about changes in this pipeline:

1. Vue template input
2. Custom renderer hooks in `src/lib-components/nodeOps.ts` and `src/lib-components/patchProp.ts`
3. Reactive `Base` / `Node` tree in `src/lib-components/nodes/`
4. Three.js bridge objects in `src/lib-components/three/`
5. WebGL scene output managed by `VuetrexStage`

Most bugs are caused by changing one layer without updating the adjacent one.

## Key Areas

- [renderer.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/renderer.ts?type=file&root=%252F): creates the Vue custom renderer.
- [nodeOps.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodeOps.ts?type=file&root=%252F): maps Vue tree operations onto Vuetrex nodes.
- [patchProp.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/patchProp.ts?type=file&root=%252F): wires reactive props and events.
- [Base.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/Base.ts?type=file&root=%252F): tree structure, deferred sync queue, parent-child operations.
- [Node.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/Node.ts?type=file&root=%252F): stage access, event bubbling, local layout behavior.
- [GroupNode.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/GroupNode.ts?type=file&root=%252F): local coordinate spaces for nested layouts.
- [MeshNode.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/MeshNode.ts?type=file&root=%252F): shared geometry-node lifecycle, material, hover, render sync.
- [types.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/types.ts?type=file&root=%252F): built-in element registry and custom element registration.
- [stage.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/three/stage.ts?type=file&root=%252F): scene setup, camera, connectors, interaction, and animation.
- [scene.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/three/scene.ts?type=file&root=%252F): DOM/canvas event binding and scene orchestration.
- [material.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/material.ts?type=file&root=%252F): material and hover prop contracts.
- [three/connectors/](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/three/connectors?type=folder&root=%252F): connector rendering and particle/line behavior.

## Change Guidelines

### Adding a new shape

1. Add a class under `src/lib-components/nodes/shapes/` extending `MeshNode`.
2. Implement `modelGen()`.
3. Override `flushMode` only if the node must sync immediately.
4. Register the tag in [types.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/types.ts?type=file&root=%252F).
5. Add or update tests under [test/unit](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/test/unit?type=folder&root=%252F).
6. Update docs if the public API changed.

### Adding a new layout/container

1. Extend `GroupNode` when the node establishes a local coordinate space.
2. Implement `layoutPositionOf(child)`.
3. Verify nesting behavior, since children are parented through `nearestAncestorObject()`.
4. Add tests that cover both layout math and nested composition.

### Changing events or props

- Keep `patchProp.ts`, node setters, and stage/scene event flow aligned.
- Click and double-click bubble through `Node`; pointer enter/leave do not.
- If you change event semantics, update tests and docs together.

### Changing sync behavior

- Structural updates are deferred through `registerSync()` and `applySync()`.
- `MeshNode.syncWithThree()` relies on reactive watchers; avoid introducing duplicate watchers or bypass paths.
- Be careful with timing-sensitive changes around `flushMode`, hover animation, and stage rendering.

## Commands

Use Node 22+.

- `yarn dev`: start the Vite dev server.
- `yarn build`: generate declarations and build the library.
- `yarn typecheck`: run `vue-tsc` without emitting files.
- `yarn test`: run Vitest in watch mode.
- `yarn test:run`: run tests once.
- `yarn test:coverage`: run coverage.
- `yarn test:esm-project`: validate external ESM consumption.
- `yarn docs:dev`: rebuild the library and start VitePress.
- `yarn docs:build`: build documentation.

## Test Expectations

For code changes, prefer running at least the narrowest relevant check:

- renderer/tree changes: `yarn test:run`
- type/API surface changes: `yarn typecheck`
- packaging/export changes: `yarn build` and `yarn test:esm-project`
- docs examples or public behavior changes: update docs and run the relevant tests if examples depend on them

## Docs And Examples

- Main docs live in [docs](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/docs?type=folder&root=%252F).
- Architecture reference is [architecture.md](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/docs/architecture.md?type=file&root=%252F).
- Demo app lives in [demo](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/demo?type=folder&root=%252F).
- ESM integration coverage lives in [test/esm-module](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/test/esm-module?type=folder&root=%252F).

## Guardrails

- Preserve the distinction between the logical node tree and the Three.js scene graph.
- Prefer minimal changes in the correct layer instead of patching symptoms downstream in `stage.ts`.
- Do not silently change built-in tag names or exported APIs without updating docs and tests.
- Treat `src/lib-components/three/external/` as vendored code unless there is a clear reason to modify it.
- Keep README, docs, and tests consistent with any user-visible behavior change.

# AGENTS.md

## Architecture

Vuetrex has two cooperating pipelines:

```text
Vue template → renderer host tree → spatial nodes → Three.js scene
data → immutable recipe/graph → compiler → keyed realization → renderer host
```

Read [docs/architecture.md](docs/architecture.md) before structural changes.

## Choose the abstraction

| Need | Use |
|---|---|
| Fixed visual element | `MeshNode` |
| Spatial container | `GroupNode` |
| Lifecycle-only renderer host | `Base`, not `Node` |
| Repeated/data-driven geometry | `GeometrySource` → `GeometryNode` |
| Particle behavior | `ParticleSource` → `ParticleNode` |
| Data arrangement | Composition recipe / `Placement` |
| Connector topology | Connector records; future graph work follows the [fluent connector proposal](docs/superpowers/plans/2026-09-12-fluent-connector-graph.md) |
| GPU realization | Compiler/backend-owned resources |

## Invariants

- `Base` is renderer identity and lifecycle. `Node` adds spatial identity, layout, focus, events, and bounds.
- Graph operators are immutable values, never renderer or Three.js objects. Functional and fluent forms must produce the same graph.
- Prefer one host for many keyed records. Reconcile by stable data key, not array position.
- Keep authoring, compilation, and realization separate. Parameter-only changes should not rebuild topology.
- Vue `insert` also moves existing children; the logical child list must stay unique.
- Unmount the inner Vue tree before destroying its stage.
- The creator of geometry, materials, textures, targets, observers, timers, and watchers owns cleanup. Detaching or clearing does not dispose GPU resources.
- Sync/watch installation and teardown must be idempotent. Do not mutate a dependency from the effect that consumes it.
- Preserve the logical-tree/Three.js-scene distinction; do not patch structural problems in `stage.ts`.

## Change routing

| Area | Primary files |
|---|---|
| Renderer tree and props | `renderer.ts`, `nodeOps.ts`, `patchProp.ts`, `nodes/Base.ts` |
| Spatial nodes and layout | `nodes/Node.ts`, `nodes/GroupNode.ts`, `nodes/layouts.ts` |
| Fixed shapes and materials | `nodes/MeshNode.ts`, `nodes/shapes/`, `nodes/material.ts` |
| Composition | `composition/` |
| Procedural geometry | `geometry/` authoring → compiler → `GeometryNode` |
| Particles | `particles/` authoring → compiler → backend/`ParticleNode` |
| Connectors | `nodes/*ConnectorNode.ts`, `three/connectors/` |
| Scene lifecycle and GPU ownership | `three/scene.ts`, `three/stage.ts` |
| Built-ins and public exports | `nodes/types.ts`, `index.ts` |

A fixed shape extends `MeshNode`, implements `modelGen()`, and is registered in `nodes/types.ts`. Data-driven geometry belongs in the geometry graph instead.

Do not modify `three/external/` without a specific vendored-code reason.

## Verification

Use Node 24+ and pnpm. Run the narrowest relevant test first.

- Renderer/tree changes: `pnpm test:run`
- Type or public API changes: `pnpm typecheck`
- Packaging/exports: `pnpm build`, then `pnpm test:esm-project`
- Documentation behavior: update docs/tests and run `pnpm docs:build`

Graph tests should cover functional/fluent equivalence, immutability, signatures, bounds, and keyed reconciliation. Resource tests should assert disposal on replacement and unmount.

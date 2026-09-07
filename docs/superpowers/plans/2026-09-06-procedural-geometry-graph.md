---
title: Procedural Geometry Graph
description: Implementation plan for a reactive, composable procedural geometry package with reusable parametrized subgraphs.
outline: deep
---

# Procedural Geometry Graph Implementation Plan

**Status:** Proposed. This document adds no runtime behavior.

**Goal:** Add a procedural geometry package under `src/lib-components/geometry/` that can express Blender Geometry
Nodes-like pipelines while retaining Vue reactivity. Geometry primitives and operators must compose uniformly, support
reusable parametrized geometry libraries, preserve instancing where possible, and render through one logical Vuetrex
node without confusing the procedural graph with the Vuetrex scene tree.

**Core architectural choice:** The public API begins as functional immutable graph combinators, extended with
`defineGeometry()` for reusable parametrized subgraphs. Internally, nodes use named, typed inputs and immutable
references so the representation is already a lightweight DAG rather than a strictly nested tree. Vue owns the
parameters; the geometry compiler owns derived Three.js resources; `VuetrexStage` remains the owner of scene output.

**Tech stack:** TypeScript, Vue 3 `computed`/`watchEffect`, Vuetrex's custom renderer, Three.js buffer geometry and
instancing, seeded deterministic sampling, and Vitest.

---

## Desired author experience

The simplest geometry is authored as a reactive graph and passed to one render node:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { geo } from '@exceeder/vuetrex'

const length = ref(3)
const radius = ref(0.12)

const geometry = computed(() =>
  geo.transform(
    geo.line({ length: length.value, thickness: radius.value }),
    { rotate: [0, 0, Math.PI / 6] },
  ),
)
</script>

<template>
  <vx-geometry :graph="geometry" anchor="base" />
</template>
```

Reusable geometries are ordinary typed modules whose result can enter any larger pipeline:

```ts
import { defineGeometry, geo } from '@exceeder/vuetrex'

export interface TwigParameters {
  length: number
  radius: number
  leafSize: number
  leafCount: number
}

export const twig = defineGeometry<TwigParameters>(parameters =>
  geo.boolean([
    geo.line({
      length: parameters.length,
      thickness: parameters.radius,
    }),
    geo.distribute(
      geo.icosphere({ radius: parameters.leafSize, detail: 1 }),
      {
        pattern: 'line',
        count: parameters.leafCount,
        start: [0, parameters.length * 0.25, 0],
        end: [0, parameters.length, 0],
      },
    ),
  ], { operation: 'combine' }),
)
```

The module remains self-similar and composable:

```ts
const branch = twig({ length: 1.4, radius: 0.035, leafSize: 0.08, leafCount: 7 })

const crown = geo.randomize(
  geo.distribute(branch, branchSites),
  { seed: 42, rotation: [0.08, 0.2, 0.08], scale: [0.9, 1.1] },
)

const tree = geo.boolean([trunk, crown], { operation: 'combine' })
```

`twig(...)`, a built-in primitive, and the result of any operator are all `GeometrySource` values. No separate
"finished geometry" type prevents a module from being transformed, distributed, randomized, or combined again.

---

## Design principles

1. **Every stage remains composable.** Every primitive and geometry operator consumes and returns a
   `GeometrySource`.
2. **Subgraphs are first-class values.** A source can be saved, imported, passed to another function, shared by
   multiple parents, or used as an instance prototype.
3. **Operators never mutate their inputs.** Reusing one branch in two transforms must not couple the results.
4. **The graph is not the scene tree.** Procedural operators are lightweight data descriptions, not `Base` or `Node`
   instances and not independently registered Vuetrex elements.
5. **Reactivity stays in Vue.** Applications normally build graphs in `computed()`. Bound prop changes invalidate the
   output node; no second reactive framework is introduced inside geometry nodes.
6. **Fields are values.** Per-element size, color, visibility, and transforms are represented internally as typed
   `Field<T>` values. Mapping callbacks are concise syntax for creating fields.
7. **Identity is stable and explicit.** Distributed records use a stable key. Seeded random values derive from the
   graph path and item key, not array position or `Math.random()`.
8. **Instancing is preserved until realization requires baking.** Transform, Distribute, Parameter Map, Randomize,
   and first-version Boolean Combine operate on records without cloning vertex buffers.
9. **Self-similarity is finite.** `defineGeometry()` factories may call other factories or recursively construct a
   graph with a terminating `depth` parameter. Cyclic runtime graphs are rejected.
10. **Compilation is deterministic.** The same graph, inputs, and seed produce the same records, signatures, and
    rendered result.

---

## Architecture

```text
Vue refs / reactive props
          │
          ▼
computed<GeometrySource>
          │
          ▼
immutable geometry DAG ─────────► defineGeometry() library modules
  primitives + operators                 │
          │                              └── reusable GeometrySource
          ▼
GeometryEvaluator
  fields, point domains, transforms, stable keys
          │
          ▼
GeometrySet
  mesh/line records + prototype identity + attributes
          │
          ▼
GeometryRealizer
  Mesh / Line / InstancedMesh batches
          │
          ▼
<vx-geometry> ── one logical Vuetrex Node ──► Three.js scene
```

### Why a functional API over procedural Vue children

Vue templates naturally express an ownership tree. A procedural graph needs to share one subgraph between several
consumers, retain multiple logical domains, and eventually support named outputs. Representing every operator as a
custom-renderer child would make non-scene computation participate in renderer parenting and lifecycle.

The functional graph avoids that mismatch. Vue components can later provide a template facade over the same graph,
but that facade must produce `GeometrySource`; it must not become an alternative compiler or resource owner.

### Lightweight DAG, simple authoring surface

The public call remains concise:

```ts
geo.transform(input, options)
```

The stored node uses named inputs:

```ts
interface TransformGraphNode extends GeometryGraphNode {
  kind: 'transform'
  inputs: {
    geometry: GeometrySource
  }
  parameters: TransformParameters
}
```

Named internal inputs reserve a path toward multi-input operators, graph inspection, serialization, diagnostics, and a
visual editor without requiring a socket-builder API in the first public version. The same immutable source object may
appear in several input positions, making the graph a DAG. Evaluation memoizes shared inputs within one compile.

---

## Core types

The exact names may be refined during implementation, but the separation of authored graph, evaluated records, and
realized resources is required.

```ts
export type GeometrySource = GeometryGraphNode

export interface GeometryGraphNode {
  readonly kind: string
  readonly key?: string
  readonly inputs: Readonly<Record<string, GeometrySource | readonly GeometrySource[] | undefined>>
  readonly parameters: Readonly<Record<string, unknown>>
}

export interface GeometryFactory<P> {
  (parameters: P): GeometrySource
}

export function defineGeometry<P>(
  build: (parameters: Readonly<P>) => GeometrySource,
): GeometryFactory<P>

export interface GeometryContext<T = unknown> {
  key: string
  index: number
  item: T
  position: THREE.Vector3
  normal?: THREE.Vector3
  tangent?: THREE.Vector3
}

export type Field<T, Item = unknown> =
  | T
  | ((context: GeometryContext<Item>) => T)
```

Vector, Euler, quaternion, color, and scalar inputs should accept documented compact value forms while normalizing to
Three.js values only inside evaluation. Graph descriptions must remain cheap and free of owned GPU resources.

### Evaluated geometry

```ts
interface GeometryRecord<T = unknown> {
  key: string
  prototype: GeometryPrototype
  matrix: THREE.Matrix4
  color: THREE.Color
  visible: boolean
  context: GeometryContext<T>
  attributes: Readonly<Record<string, number | THREE.Vector2 | THREE.Vector3 | THREE.Vector4>>
}

interface GeometrySet {
  records: readonly GeometryRecord[]
}
```

`GeometryPrototype` describes an owned or cached line/mesh topology separately from its record transforms and fields.
Repeated records that resolve to the same prototype signature can therefore share a buffer geometry and become one
`InstancedMesh` batch.

`GeometrySet` is the compiler-level universal result. Future point, curve, selection, or named-output domains should
extend this result rather than force existing operators to return unrelated types.

### Future named outputs

The first public `defineGeometry()` is deliberately single-output. Library authors can split a model into several
factories and combine them freely. Internal types must not assume that modules can only ever have one socket.

A later additive API may provide:

```ts
const plantParts = defineGeometryModule<PlantParameters>()(({ parameters }) => ({
  geometry: combinedPlant,
  trunk,
  branchTips,
  leafSites,
}))
```

This is reserved for a later phase after `GeometrySource`, fields, point context, and caching are stable. Do not expose
an untyped object-of-anything in the first release merely to simulate multiple outputs.

---

## Package structure

```text
src/lib-components/geometry/
  index.ts                       public `geo`, `defineGeometry`, and types
  types.ts                       authored graph and evaluated GeometrySet contracts
  values.ts                      vector/color/rotation normalization
  fields.ts                      Field<T> construction and evaluation
  modules.ts                     defineGeometry() and recursion diagnostics
  graph.ts                       immutable node construction and graph signatures
  random.ts                      deterministic key-derived PRNG utilities
  primitives/
    line.ts
    plane.ts
    box.ts
    icosphere.ts
  operators/
    transform.ts
    distribute.ts
    parameterMap.ts
    boolean.ts
    randomize.ts
  compiler/
    evaluator.ts                 DAG traversal and memoization
    prototypes.ts                topology creation/cache and ownership
    distribution.ts              point/pattern/surface placement
    realizer.ts                  Mesh/Line/InstancedMesh batching
    bounds.ts                    local compiled bounds
  GeometryNode.ts                `<vx-geometry>` Vuetrex/Three bridge
```

Tests should be split by concern rather than mirroring every implementation file:

```text
test/unit/verify-geometry-graph.spec.ts
test/unit/verify-geometry-operators.spec.ts
test/unit/verify-geometry-modules.spec.ts
test/unit/verify-procedural-geometry.spec.ts
```

---

## Primitive nodes

### Line

`geo.line()` supports either a normalized local length or explicit path points:

```ts
geo.line({ length: 2, thickness: 0.08 })
geo.line({ points, thickness: 0.08, radialSegments: 8 })
```

- A two-point line uses a straight path.
- More points use a documented interpolated or polyline path mode.
- `thickness <= 0` realizes as a thin Three.js line.
- Positive thickness realizes as a tube/pipe geometry and is eligible for mesh instancing.
- Path points, path mode, tubular segments, radial segments, thickness, and closed state contribute to the prototype
  signature.
- A thin line is not accepted by mesh-only realization or future true CSG operations.

### Plane

`geo.plane()` defaults to the XZ plane with a +Y normal. Width, depth, and segment counts are parametrizable. Its local
origin is centered; final base alignment is handled by `<vx-geometry anchor="base">`.

### Box

`geo.box()` produces a normalized or explicitly dimensioned box. The first version should use standard Three.js box
geometry unless rounded corners can be supported without coupling this package to `MeshNode` defaults.

### Icosphere

`geo.icosphere()` wraps `IcosahedronGeometry` with radius and detail parameters. Documentation must warn that high
detail levels increase topology exponentially.

---

## Operator nodes

### Transform

```ts
geo.transform(input, {
  translate?: Vector3Like
  rotate?: EulerLike | THREE.Quaternion
  scale?: number | Vector3Like
  pivot?: Vector3Like
})
```

Transform composes matrices onto every input record without modifying prototype geometry. Composition order must be
documented and tested. Nested transforms remain separate authored graph nodes but may be collapsed during evaluation.

### Distribute

```ts
geo.distribute(prototype, distribution)
```

Initial distribution modes:

- explicit `items` with `keyBy`, `position`, and optional `direction`/`normal` fields;
- explicit placement points;
- line pattern between endpoints or along path points;
- grid pattern;
- custom placement callback;
- triangle-area-weighted sampling over a mesh source, with optional normal alignment.

Every output record receives `GeometryContext`. Explicit item keys are retained across reordering. Generated pattern
keys derive from the distribution node key and stable sample index. Surface sampling uses a seed and stable sample key,
so unrelated reactive updates do not move points.

Distribution treats its input as a reusable prototype/subgraph. If that subgraph contains several records, each
placement receives the complete local subgraph with composed transforms. The realizer then batches matching prototypes
across all placements, which is necessary for reusable branch, window, bolt, and leaf-cluster modules.

### Parameter Map

```ts
geo.parameterMap(input, {
  position?: Field<Vector3Like>
  rotation?: Field<EulerLike | THREE.Quaternion>
  scale?: Field<number | Vector3Like>
  color?: Field<THREE.ColorRepresentation>
  visible?: Field<boolean>
})
```

Mappings evaluate against each record's context. Constant values are fields too. A mapped transform composes with the
existing record transform according to one documented rule; it must not unpredictably replace transformations created
by Distribute.

Arbitrary numeric attributes are reserved in the internal record contract, but the first standard material path only
promises transform, color, and visibility. Shader-specific attributes require a later material extension.

### Boolean

The initial operation is intentionally:

```ts
geo.boolean(inputs, { operation: 'combine' })
```

`combine` concatenates evaluated geometry streams and preserves prototype identity, record keys, and instancing. It
does not remove internal faces and must not be documented as a watertight CSG union.

This creates the stable multi-input composition point needed by plants and reusable assemblies without adding a CSG
dependency or forcing all reactive geometry into a baked vertex buffer. Later `union`, `subtract`, and `intersect`
operations may be added as explicit baking boundaries after topology ownership, material groups, and invalid geometry
handling are designed.

### Randomize

```ts
geo.randomize(input, {
  seed: string | number
  translate?: Range<Vector3Like>
  rotation?: Range<EulerLike>
  scale?: Range<number | Vector3Like>
  color?: ColorRange
})
```

Random values derive independently from `(seed, operator key, record key, channel)`. Adding a color channel must not
change previously generated scale values. Reordering keyed records must not change any generated values. Randomize
composes fields onto records and never changes source data.

---

## Reusable modules and self-similarity

`defineGeometry()` is a graph-construction boundary, not a compiled-resource cache and not a Vue composable. It should:

- retain the parameter type;
- validate that the builder returns a `GeometrySource`;
- attach a stable module identity useful for diagnostics and graph signatures;
- make module call boundaries visible in development diagnostics;
- allow one module to call another module;
- allow bounded construction-time recursion;
- avoid mutating, wrapping with Vue reactivity, or eagerly evaluating the returned graph.

A finite recursive tree is valid:

```ts
interface RecursiveBranchParameters {
  depth: number
  length: number
  radius: number
  seed: number
}

const recursiveBranch = defineGeometry<RecursiveBranchParameters>(p => {
  const stem = geo.line({ length: p.length, thickness: p.radius })
  if (p.depth <= 0) return stem

  const child = recursiveBranch({
    depth: p.depth - 1,
    length: p.length * 0.72,
    radius: p.radius * 0.68,
    seed: p.seed + 1,
  })

  return geo.boolean([
    stem,
    geo.randomize(
      geo.distribute(child, forkPlacements(p)),
      { seed: p.seed, rotation: [0.05, 0.18, 0.05] },
    ),
  ], { operation: 'combine' })
})
```

Safeguards:

- Detect direct object cycles during graph traversal and throw a diagnostic containing the graph path.
- Development builds should warn when module recursion produces an unusually deep or large graph.
- Documentation should prefer distributing a repeated child subgraph over manually expanding hundreds of identical
  children.
- Compiler memoization is per compilation and cannot change authored semantics.

---

## Vue reactivity and invalidation

The expected path is:

```text
ref changes
  → application computed returns a new immutable graph description
  → Vue patches `<vx-geometry :graph>`
  → GeometryNode watchEffect evaluates the graph
  → keyed records are diffed against current realization
  → topology, matrices, colors, visibility, and bounds update as needed
```

The graph prop should be held shallowly or marked raw at the renderer boundary. Deep-proxying immutable graph objects
and Three.js values would add overhead and identity surprises. Vue still observes the application refs used to build
the graph because the containing `computed()` owns those dependencies.

Required invalidation classes:

| Change | Expected work |
|---|---|
| Material color/roughness | Update material only |
| Parameter Map color/visibility | Update instance/color buffers only |
| Transform or Randomize result | Update matrices and bounds |
| Distribution item reorder with stable keys | Retain record identity/slots |
| Distribution membership | Add/release keyed records and resize batches only when needed |
| Primitive topology parameter | Rebuild affected prototype and dependent batches |
| Graph structure or Combine inputs | Re-evaluate affected DAG branches and reconcile batches |

The first implementation may evaluate the small immutable graph on each graph-prop change, but realization must still
diff keyed records rather than discard and recreate every GPU object. Performance optimization must not introduce a
second mutable source of graph truth.

Effects must follow existing Vuetrex lifecycle rules:

- install at most one watcher per concern;
- read reactive state and write external Three.js state;
- never write to a reactive dependency read by the same effect;
- stop every watcher in `onRemoved()`;
- dispose only resources owned by the geometry package;
- coalesce content-bounds invalidation through the stage.

---

## Realization and instancing

The realizer groups visible mesh records by compatible prototype and material signature.

- One compatible record may use a `Mesh` or a one-member instance batch according to the simplest lifecycle path.
- Repeated compatible records use `InstancedMesh`.
- Transform, color, and visibility update in place.
- Capacity grows geometrically and does not shrink on every removal.
- Stable semantic keys retain slots when data reorders.
- A distributed multi-record module may contribute to several prototype batches while remaining one semantic
  procedural output node.
- Thin line records use `Line`/`LineSegments` realization and do not enter mesh batches.
- Per-record colors multiply a white base material, following current `vx-instances` behavior.

Prototype signatures include only values that affect topology. Record transforms and colors must not split prototype
batches. Explicit graph `key` values support diagnostics and stable identity, but equal topology may still be shared
when doing so is safe.

Owned resources must be reference-counted or scoped to one `GeometryNode` realization. Sharing an authored subgraph
must never cause one output node to dispose geometry still used by another output node.

---

## Vuetrex integration

`GeometryNode` should extend `Node`, not `MeshNode`, because its output can be a `Group` containing multiple meshes,
lines, and instance batches.

The built-in tag is:

```vue
<vx-geometry
  :graph="geometry"
  :material="material"
  anchor="base"
  @click="inspectPart"
/>
```

Initial state:

```ts
interface ProceduralGeometryState {
  graph?: GeometrySource
  material?: VxMaterialProps
  anchor: 'base' | 'center' | 'origin'
  text: string
}
```

Integration requirements:

- The node owns one stable `THREE.Group` assigned to `element.mesh`.
- The group is parented through `nearestAncestorObject()`.
- Compiler output remains in the group's local coordinate space.
- Compiled local bounds drive `intrinsicSize()` and parent layouts.
- `anchor="base"` offsets the compiled bounds to place their XZ center at the layout position and minimum Y at zero.
- `anchor="center"` centers all three axes; `origin` preserves authored coordinates.
- Every raycastable descendant receives the owning `Element3d` in `userData` and a name accepted by current stage
  raycasting.
- Click, double-click, pointer enter, and pointer leave target the one logical procedural node.
- Instance hits reuse `VxMouseEvent.vxInstance` and return stable record key/item/index information.
- Because one output may contain several instance batches, the stage's optional `instanceHitAt` bridge must accept the
  intersected object as additional context while remaining backward compatible with `InstanceNode`.
- Connector lookup and named focus use the stable root group and its complete bounds.
- Visibility, disabled state, shadows, diagnostics, and camera invalidation follow existing `Node` conventions.

Do not add procedural operators to `nodes/types.ts`. Only `vx-geometry` is a renderer element. The `geo.*` nodes remain
plain authored data.

---

## Plant example

Add a documented and runnable example that demonstrates composition rather than a one-off mesh generator.

Suggested modules:

```text
plant/
  stem.ts          line/pipe primitive with taper parameters represented by segments
  twig.ts          stem + distributed leaves
  branch.ts        transformed/distributed twigs
  tree.ts          trunk + distributed branches + crown
```

The example should expose reactive controls for:

- seed;
- recursion depth or branch levels;
- trunk height and radius;
- branch count, spread, length falloff, and upward bias;
- leaf density, size, and color range;
- wind-like static directional variation through Randomize.

It must show at least these composition properties:

1. `twig()` is usable by itself in `<vx-geometry>`.
2. The same `twig()` result can be transformed or distributed by `branch()`.
3. `branch()` can itself be distributed by `tree()`.
4. A graph built from those modules can still be passed through top-level Transform, Randomize, Parameter Map, or
   Combine operators.
5. Changing Vue refs updates the existing Vuetrex node without remounting the stage.
6. Branches and leaves remain batched by prototype rather than becoming one mesh per Vue component.

The visual example is also the acceptance test for self-similarity and module-level composability.

---

## Non-goals for the first version

- No visual node editor.
- No serialization stability guarantee for persisted graph JSON.
- No cyclic runtime graphs or infinite/lazy recursion.
- No skeletal deformation, animation fields, or time-dependent geometry evaluation.
- No arbitrary shader attributes or per-instance materials.
- No per-generated-record connector endpoints or labels.
- No mesh repair, remeshing, bevel, subdivision-surface, or UV-unwrapping system.
- No true Boolean union, subtraction, or intersection; `combine` is composition, not CSG.
- No guarantee that zero-thickness lines participate in mesh instancing.
- No template-only operator syntax such as nested `<vx-geo-transform>` elements. A Vue facade may be considered after
  the graph API is stable.

---

## Implementation tasks

### Task 1: Graph, module, value, and field contracts

**Files:**

- Add `src/lib-components/geometry/types.ts`
- Add `src/lib-components/geometry/values.ts`
- Add `src/lib-components/geometry/fields.ts`
- Add `src/lib-components/geometry/graph.ts`
- Add `src/lib-components/geometry/modules.ts`
- Test `test/unit/verify-geometry-graph.spec.ts`
- Test `test/unit/verify-geometry-modules.spec.ts`

- [ ] Define immutable graph node and named-input contracts.
- [ ] Define `GeometrySource`, `GeometryFactory<P>`, `GeometryContext`, and `Field<T>`.
- [ ] Implement compact vector/color/rotation normalization with useful validation errors.
- [ ] Implement `defineGeometry()` without Vue or Three.js resource ownership.
- [ ] Support shared source references and detect cyclic object graphs.
- [ ] Test factory composition, shared subgraphs, finite recursion, immutability, and cycle diagnostics.

### Task 2: Primitive descriptions and prototype realization

**Files:**

- Add `src/lib-components/geometry/primitives/line.ts`
- Add `src/lib-components/geometry/primitives/plane.ts`
- Add `src/lib-components/geometry/primitives/box.ts`
- Add `src/lib-components/geometry/primitives/icosphere.ts`
- Add `src/lib-components/geometry/compiler/prototypes.ts`
- Test `test/unit/verify-geometry-graph.spec.ts`

- [ ] Implement pure primitive graph builders.
- [ ] Implement deterministic topology signatures.
- [ ] Realize thin lines, thick line pipes, planes, boxes, and icospheres.
- [ ] Calculate local bounds and normals where applicable.
- [ ] Define ownership/disposal behavior for generated buffer geometry.
- [ ] Test topology, dimensions, bounds, line-to-pipe behavior, and signature stability.

### Task 3: Transform, Combine, fields, and graph evaluator

**Files:**

- Add `src/lib-components/geometry/operators/transform.ts`
- Add `src/lib-components/geometry/operators/boolean.ts`
- Add `src/lib-components/geometry/operators/parameterMap.ts`
- Add `src/lib-components/geometry/compiler/evaluator.ts`
- Test `test/unit/verify-geometry-operators.spec.ts`

- [ ] Implement DAG traversal with per-compile memoization.
- [ ] Implement transform composition and pivot behavior.
- [ ] Implement `combine` as record composition without topology baking.
- [ ] Implement field evaluation for transform, color, and visibility.
- [ ] Preserve record context and prototype identity through each operator.
- [ ] Test nested transforms, shared inputs, map composition, and non-mutating reuse.

### Task 4: Distribution and deterministic Randomize

**Files:**

- Add `src/lib-components/geometry/random.ts`
- Add `src/lib-components/geometry/operators/distribute.ts`
- Add `src/lib-components/geometry/operators/randomize.ts`
- Add `src/lib-components/geometry/compiler/distribution.ts`
- Modify `src/lib-components/three/three.imports.ts` only if a Three.js surface-sampling addon needs central export
- Test `test/unit/verify-geometry-operators.spec.ts`

- [ ] Implement keyed item and explicit-point distributions.
- [ ] Implement line, grid, custom, and seeded surface patterns.
- [ ] Compose complete multi-record input subgraphs at every placement.
- [ ] Carry position, tangent, normal, item, index, and stable key in context.
- [ ] Implement independent key-derived random channels.
- [ ] Test stable reordering, membership changes, orientation, surface bounds, determinism, and channel independence.

### Task 5: Realizer and reactive `GeometryNode`

**Files:**

- Add `src/lib-components/geometry/compiler/realizer.ts`
- Add `src/lib-components/geometry/compiler/bounds.ts`
- Add `src/lib-components/geometry/GeometryNode.ts`
- Modify `src/lib-components/nodes/types.ts`
- Modify `src/lib-components/three/stage.ts` only for multi-batch instance hit context
- Test `test/unit/verify-procedural-geometry.spec.ts`

- [ ] Create one stable output group per `GeometryNode`.
- [ ] Batch records by compatible prototype/material signature.
- [ ] Retain keyed instance slots and geometrically grow capacity.
- [ ] Update transforms/colors/visibility without rebuilding topology.
- [ ] Implement thin-line realization.
- [ ] Implement bounds, anchoring, parent layout participation, and camera invalidation.
- [ ] Wire standard node identity, events, connector lookup, shadows, and cleanup.
- [ ] Resolve instance hits across multiple generated batches while preserving current `InstanceNode` behavior.
- [ ] Test reactive updates, object reuse, bounds, nesting, events, and complete resource disposal.

### Task 6: Public API

**Files:**

- Add `src/lib-components/geometry/index.ts`
- Modify `src/lib-components/index.ts`
- Modify `src/lib-components/nodes/types.ts`
- Update ESM integration coverage under `test/esm-module/`

- [ ] Export the `geo` namespace, `defineGeometry()`, and supported public types.
- [ ] Register only the `vx-geometry` renderer tag.
- [ ] Keep operator implementation details and compiler records internal unless applications need them for mapping.
- [ ] Validate package declarations and ESM imports.

### Task 7: Plant module example and documentation

**Files:**

- Add a procedural geometry guide under `docs/guide/`
- Update `docs/api/index.md`
- Update `docs/architecture.md`
- Add a demo component and reusable plant modules under `demo/`

- [ ] Document primitives, all five initial operators, fields, keys, anchoring, and ownership.
- [ ] Clearly distinguish Combine from true CSG Boolean operations.
- [ ] Build the stem/twig/branch/tree module hierarchy.
- [ ] Add reactive seed, branching, and leaf controls.
- [ ] Demonstrate that every module output remains usable in a larger pipeline.
- [ ] Document finite recursion and performance guidance.

### Task 8: Verification and release readiness

- [ ] Run the narrow geometry graph/operator/module tests.
- [ ] Run `pnpm test:run`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:esm-project`.
- [ ] Run the relevant docs build after examples and navigation are updated.
- [ ] Inspect the plant demo interactively for bounds, camera fitting, reactive stability, seed determinism, and GPU
      batching.
- [ ] Confirm repeated parameter changes do not steadily increase scene children, geometries, materials, or watchers.

---

## Acceptance criteria

The first version is complete when:

1. Line, plane, box, and icosphere primitives can be rendered by `<vx-geometry>`.
2. Transform, Distribute, Parameter Map, Boolean Combine, and Randomize compose in arbitrary valid order.
3. A `defineGeometry()` result is indistinguishable from a primitive as an input to every operator.
4. A reusable subgraph can be shared by multiple consumers without mutation or resource-lifecycle conflicts.
5. Bounded recursive factories can produce self-similar models with actionable diagnostics for accidental cycles or
   excessive expansion.
6. Vue ref changes update geometry, transforms, colors, distribution membership, and random seeds without remounting
   the stage.
7. Keyed distributed records retain identity across reorder and use deterministic random values.
8. Repeated compatible records render through instance batches and expose their source item through `vxInstance`.
9. Procedural output reports accurate bounds to nested Vuetrex layouts, focus, connectors, and camera fitting.
10. Unmounting or replacing a graph stops its effects and disposes every package-owned Three.js resource.
11. The plant example is assembled from separately reusable stem, twig, branch, and tree modules and can itself be
    transformed, randomized, distributed, or combined at the top level.
12. Documentation explicitly states first-version limitations and leaves an additive route to named outputs, typed
    point/curve domains, true CSG operations, and an optional Vue template facade.


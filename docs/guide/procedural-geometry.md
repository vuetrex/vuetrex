---
title: Procedural geometry
description: Build reactive geometry pipelines from reusable primitives, operators, fields, and parametrized modules.
outline: deep
---

# Procedural geometry

Procedural geometry describes a model as an immutable graph. Vue owns the parameters, Vuetrex evaluates the graph,
and one `<vx-geometry>` node realizes its records as Three.js lines and instance batches.

::: tip Learn by building
For a beginner-friendly walkthrough of local coordinates, pipes, face directions, distribution, and finite recursion,
follow [Build recursive cubes and pipes](/guide/recursive-cubes).
:::

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vuetrex, geo } from '@exceeder/vuetrex'

const spacing = ref(1.2)
const graph = geo.distribute(geo.box({ width: 0.5, height: 0.5, depth: 0.5 }), {
  pattern: 'grid',
  count: [4, 3],
  spacing: geo.param('spacing', 1.2),
})
const parameters = computed(() => ({ spacing: [spacing.value, spacing.value] }))
</script>

<template>
  <Vuetrex height="480px">
    <vx-geometry :graph="graph" :parameters="parameters" anchor="base" />
  </Vuetrex>
</template>
```

Changing `spacing` updates the existing instance matrices while the authored graph and topology stay stable. It does
not mount twelve Vue nodes or rebuild the stage.

## Reactive parameters

Use `geo.param(name, fallback?)` wherever an operator or primitive accepts a complete value. Supply current values
through `<vx-geometry :parameters>`. The parameter object may itself be Vue-reactive and may contain refs.

```ts
const graph = geo.parameterMap(
  geo.box({ width: geo.param('width', 1) }),
  {
    scale: geo.param('scale', 1),
    color: geo.param('color', 0xffffff),
  },
)
```

Changing `scale` or `color` only rewrites instance attributes. Changing `width` changes topology and therefore acquires
the corresponding geometry prototype. This separation lets frequently changing application data use one stable graph;
ordinary Vue `computed(() => geo.*(...))` graphs remain supported for structural editing.

## Primitives

The initial package supplies four sources:

```ts
geo.line({ length: 2 })
geo.line({ points: [[0, 0, 0], [0, 1, 0], [0.4, 2, 0]], thickness: 0.06 })
geo.plane({ width: 4, depth: 2 })
geo.box({ width: 1, height: 0.6, depth: 0.8 })
geo.icosphere({ radius: 0.5, detail: 1 })
```

A line with zero or omitted `thickness` is a thin rendered line. Positive thickness is the radius of a tube/pipe and
produces mesh geometry that can be instanced. Multi-point paths default to connected straight sections; use
`path: 'smooth'` for a Catmull–Rom path.

Planes are centered on XZ with their normal facing +Y. Boxes and icospheres are centered on their local origin. Use the
output node's `anchor` when positioning a complete result in a Vuetrex layout.

## Operators

Every operator accepts and returns `GeometrySource`. A source may be a primitive, an operator result, or a reusable
module call.

Every source also exposes the operators as immutable fluent methods. The functional and fluent forms build the same
graph, so they can be mixed freely:

```ts
const functional = geo.material(
  geo.transform(geo.box({ width: 1, height: 2 }), {
    translate: [0, 1, 0],
  }),
  'structure',
)

const fluent = geo.box({ width: 1, height: 2 })
  .transform({ translate: [0, 1, 0] })
  .material('structure')
```

Fluent calls read from the primitive outward: each call wraps the complete source produced before it. Available methods
are `transform`, `distribute`, `parameterMap`, `material`, `named`, `randomize`, `join`, and `pipe`. `join` includes the
receiver as its first input:

```ts
const assembly = body
  .join([leftArm, rightArm], { key: 'assembly' })
  .transform({ scale: 0.8 })
```

Use `pipe` for a custom reusable operator without giving up the fluent chain:

```ts
const lift = (source: GeometrySource) => source.transform({ translate: [0, 1, 0] })
const lifted = geo.box().pipe(lift).named('lifted-box')
```

`geo.param`, `geo.field`, and the point-domain helpers remain supporting values rather than geometry sources, so they
do not expose geometry chain methods.

### Transform

```ts
geo.transform(source, {
  translate: [1, 0, 0],
  rotate: [0, Math.PI / 4, 0],
  scale: [2, 1, 0.5],
  pivot: [0, 0.5, 0],
})
```

An outer Transform behaves like a parent transform: it is applied before the existing record transform in parent
space. Inputs are never mutated, so the same source can enter several different transforms safely.

### Distribute

Use stable domain items when generated parts correspond to application data:

```ts
const pods = geo.distribute(geo.box({ width: 0.2, height: 0.2, depth: 0.2 }), {
  items: services,
  keyBy: 'id',
  position: service => service.position,
  direction: service => service.direction,
})
```

Built-in patterns cover points, lines, grids, custom placements, and seeded mesh-surface sampling:

```ts
geo.distribute(source, { points: [[0, 0, 0], [1, 0, 0]] })

geo.distribute(source, {
  pattern: 'line',
  count: 8,
  start: [0, 0, 0],
  end: [0, 4, 0],
  align: 'tangent',
})

geo.distribute(source, {
  pattern: 'surface',
  surface: geo.icosphere({ radius: 2, detail: 2 }),
  count: 100,
  seed: 42,
  align: 'normal',
})
```

The `surface` source is a sampling domain and is not included in the output automatically. Combine it explicitly when
it should also be visible.

Distributing a multi-part module copies its complete local record set at every placement. Compatible prototypes from
all copies are still grouped into shared instance batches.

### Reusable point domains

Point domains separate *where* things are placed from *what* is placed there. The same immutable domain can drive
several pipelines:

```ts
const sites = geo.radialPoints({ count: 8, radius: 2, axis: 'xz' })
const markers = geo.distribute(geo.icosphere({ radius: 0.12 }), sites)
const posts = geo.distribute(geo.line({ length: 0.6, thickness: 0.03 }), sites)

const samples = geo.curvePoints({
  points: [[0, 0, 0], [0, 2, 0], [1, 3, 0]],
  count: 12,
  align: 'tangent',
})
```

`geo.points()` stores explicit keyed placements. `geo.curvePoints()` samples a polyline, `geo.radialPoints()` creates
an XY/XZ/YZ ring or arc, and `geo.mapPoints()` derives another domain while preserving item identity. Use explicit
placement keys when array ordering may change.

### Parameter Map

Parameter Map evaluates constant values or fields against each distributed record:

```ts
const encoded = geo.parameterMap(pods, {
  scale: ({ item }) => item.capacity / 10,
  color: ({ item }) => item.healthy ? 0x5cae74 : 0xd15f52,
  visible: ({ item }) => item.phase !== 'terminated',
})
```

The field context contains `key`, `index`, `item`, `position`, and, when supplied by the distribution, `normal` and
`tangent`. Mapped transforms are composed in each record's local space, which makes local size mapping work after an
instance has been aligned to a direction or surface normal.

### Semantic groups and material channels

`geo.named()` assigns a semantic group without changing geometry. `geo.material()` assigns a material channel:

```ts
const tree = geo.join([
  geo.material(geo.named(trunk, 'trunk'), 'bark'),
  geo.material(geo.named(leaves, 'leaves'), 'foliage'),
])
```

Provide material overrides by channel on the output node. Records with the same prototype but different channels use
different instance batches while continuing to share their topology buffer.

```vue
<vx-geometry
  :graph="tree"
  :materials="{
    bark: { color: 0x79553a, roughness: 0.9 },
    foliage: { color: 0xffffff, roughness: 0.6 },
  }"
/>
```

### Join

```ts
const assembly = geo.join([body, branches, leaves])
```

Join combines record streams while retaining shared prototypes and instancing. `geo.boolean()` remains a deprecated
compatibility alias for `geo.join()`. Join does not weld vertices, remove internal faces, or produce a watertight CSG
union. Future `union`, `subtract`, and `intersect` operations require an explicit mesh-baking boundary.

### Randomize

```ts
const varied = geo.randomize(source, {
  seed: 'spring-2026',
  translate: [0.05, 0.1, 0.05],
  rotation: [0.08, 0.2, 0.08],
  scale: [0.85, 1.15],
  color: [0x326b39, 0x8bcf5e],
})
```

Three-component translation and rotation values are symmetric per-axis amplitudes. A two-number scale value is a
uniform minimum/maximum range. Object ranges such as `{ min: [0, 0, 0], max: [1, 2, 1] }` provide explicit per-axis
bounds.

Random channels are independently derived from the seed, operator, record key, and channel name. Reordering keyed
items or adding a color range does not change their existing position or scale values.

## Build a geometry library

`defineGeometry()` creates a typed, parametrized graph factory:

```ts
import { defineGeometry, geo } from '@exceeder/vuetrex'

export const bolt = defineGeometry<{
  length: number
  radius: number
}>('fasteners.bolt', parameters =>
  geo.join([
    geo.line({ length: parameters.length, thickness: parameters.radius }),
    geo.transform(
      geo.icosphere({ radius: parameters.radius * 1.7, detail: 1 }),
      { translate: [0, parameters.length, 0], scale: [1, 0.45, 1] },
    ),
  ]),
)
```

The result of `bolt(...)` is still a `GeometrySource`:

```ts
const row = geo.distribute(
  bolt({ length: 0.8, radius: 0.06 }),
  { pattern: 'line', count: 20, start: [0, 0, 0], end: [5, 0, 0] },
)

const final = geo.transform(
  geo.randomize(row, { seed: 12, rotation: [0, 0.04, 0] }),
  { rotate: [0, 0, Math.PI / 2] },
)
```

Modules can call other modules. They can also call themselves while constructing a finite graph, using a terminating
`depth` parameter. Vuetrex rejects cyclic graph objects and reports runaway module construction rather than trying to
evaluate an infinite graph.

For independently useful parts, `defineGeometryOutputs()` creates a typed named-output factory:

```ts
const treeParts = defineGeometryOutputs('plants.tree-parts', (p: TreeParameters) => {
  const trunk = buildTrunk(p)
  const crown = buildCrown(p)
  return { trunk, crown, whole: geo.join([trunk, crown]) }
})

const parts = treeParts(parameters)
geo.distribute(parts.crown, groveSites)
render(parts.output('whole'))
```

Every output is still a `GeometrySource`, so outputs can be transformed, distributed, named, materialized, or passed
into another module independently.

## A self-similar plant

A plant library can recurse through one branch module without introducing one Vue component per branch or leaf:

```ts
export const branch = defineGeometry<BranchParameters>('plant.branch', p => {
  const segment = stem({ length: p.length, radius: p.radius })
  if (p.levels === 1) return geo.join([segment, terminalLeaves(p)])

  const smallerBranch = branch({
    ...p,
    levels: p.levels - 1,
    length: p.length * 0.66,
    radius: p.radius * 0.64,
  })
  return geo.join([
    segment,
    geo.distribute(smallerBranch, forkPoints(p)),
  ])
})

const crown = geo.distribute(
  branch({ ...branchParameters, levels: 5 }),
  trunkBranchPoints,
)
```

Every fork receives another instance of the same, smaller `branch()` graph. The fifth-level base case adds leaves;
there is no separate twig implementation. Any recursive branch, named tree part, or complete tree can still enter a
top-level Transform, Distribute, Parameter Map, Join, or Randomize operation. The bundled demo exposes reactive seed,
top-level branch count, fork count, spread, and leaf controls.

## Output node and events

```vue
<vx-geometry
  id="tree"
  :graph="treeGraph"
  :parameters="liveParameters"
  anchor="base"
  :material="{ color: 0xffffff, roughness: 0.72 }"
  :materials="materialChannels"
  @click="inspectGeneratedPart"
/>
```

`anchor` is `base`, `center`, or `origin`. The complete procedural result is one semantic Vuetrex node for layout,
focus, connectors, visibility, and events. Hits on generated mesh instances expose semantic item identity plus
`recordKey`, `materialKey`, and `groups` through `event.vxInstance`.

The underlying `GeometryNode` provides `recordsOf(selector)`, `localBoundsOf(selector)`, `worldBoundsOf(selector)`, and
`instanceWorldBounds(id)` for semantic groups, materials, or distributed items.

## Inspection and diagnostics

`describeGeometryGraph(graph)` returns a serializable DAG description without evaluating it, and
`geometryGraphToDot(graph)` emits Graphviz DOT for visual graph inspection. `inspectGeometry(graph, parameters?)`
reports record and prototype counts, material keys, groups, bounds, and warnings such as index-based item identity. A
mounted node's `geometryDiagnostics()` adds evaluation time, update classification, batch counts, topology build count,
and the size of the shared stage prototype pool.

Topology prototypes are reference-counted per Vuetrex stage. Separate `<vx-geometry>` nodes using an identical box,
pipe, plane, or icosphere share its immutable `BufferGeometry`; it is disposed after the final owner unmounts.

## Current boundaries

- The graph is authored in TypeScript; nested `<vx-geo-*>` operator elements are not provided.
- Join combines record streams; true CSG union/subtraction/intersection is not yet provided.
- Material channels are per record batch, not arbitrary per-instance shader/material objects.
- Generated records do not have individual labels or connector endpoints.
- Thin lines render separately and are not mesh-instanced.
- Runtime graph cycles and infinite recursion are unsupported.

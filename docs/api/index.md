---
title: Components and props
description: Reference for the Vuetrex component, built-in scene elements, materials, and events.
outline: deep
---

# Components and props

This page is a lookup reference. Start with [Build your first scene](/guide/) for a guided introduction.

## `<Vuetrex>`

```vue
<Vuetrex
  height="520px"
  width="100%"
  position="relative"
  :settings="settings"
  :camera="camera"
  :stopped="paused"
  :elements="customElements"
  @ready="onReady"
>
  <!-- vx-* scene tree -->
</Vuetrex>
```

| Prop | Type | Default | Purpose |
|---|---|---|---|
| `height` | `string` | `50vh` | Canvas wrapper CSS height |
| `width` | `string` | `100%` | Canvas wrapper CSS width |
| `position` | `string` | `static` | Canvas wrapper CSS position |
| `settings` | `VxSettings` | `{}` | Stage colors, spacing, lights, and particles |
| `camera` | `string` | `scene` | Named node to frame, or the overview |
| `stopped` | `boolean` | `false` | Pause the stage animation loop |
| `elements` | `ElementRegistry` | `{}` | Per-stage custom element registrations |

The `ready` event receives the [`VxStage`](/api/stage) interface.

## Built-in scene elements

### Containers

| Element | Purpose | Important props |
|---|---|---|
| `<vx-group>` | Automatic or dynamic layout group | `layout`, `size`, `height`, `gap`, `fit`, `direction`, `placement` |
| `<vx-row>` | X-axis layout | `size`, `height`, `gap`, `fit`, `direction`, alignment |
| `<vx-layer>` | Z-axis layout and scaling boundary | `size`, `height`, `gap`, `fit`, `direction`, `scale`, `elevation` |
| `<vx-stack>` | Y-axis layout | `size`, `height`, `gap`, `fit`, `direction` |
| `<vx-ring>` | XZ circular layout | `radius`, `start-angle`, `direction`, `gap-ratio`, `fit` |
| `<vx-panel>` | Rounded visual container with label/content regions | panel props below |
| `<vx-spacer>` | Empty measured layout reservation | `width`, `height`, `depth`, or `size` |

Every group supports `align`, `align-x`, `align-y`, and `align-z` with `start`, `center`, or `end`.

Every group also supports `fit="shrink|none"`. `shrink` is the default and uniformly scales oversized content down to
an explicit `size` or `height`; `none` preserves scale and permits visible overflow. `direction="reverse"` reverses
row, depth/layer, and stack order. On rings it reverses the angular sweep while keeping the first child at
`start-angle`.

`<vx-group layout>` accepts `grid`, `row`, `depth`, `stack`, and `ring`. `placement` accepts a composition
[`Placement`](/api/composition#placements) and removes that group from its parent's automatic layout.

### Identity and behavior

Every scene node supports the following props:

| Prop | Default | Purpose |
|---|---|---|
| `id` | Generated ID | Stable semantic address for focus, animation, connections, and diagnostics |
| `name` | empty | Human-readable node name; duplicate non-empty names throw in development |
| `text` | empty | Visible floor caption where the node type supports captions |
| `visible` | `true` | Show the node; hidden nodes still reserve layout space |
| `disabled` | `false` | Keep the node visible but suppress its pointer and click events |
| `participates-in-layout` | `true` | Include the node in parent measurement and automatic placement |

Use Vue's `:key` for virtual-tree identity and Vuetrex's `id` for scene identity. Use `name`, `text`, or shape labels for what people read.
Names and Vue keys never become scene IDs implicitly. Supply an explicit `id` for every referenced endpoint.

`visible` and `participates-in-layout` are deliberately independent. A hidden node reserves its slot unless layout
participation is also disabled. A visible node with `participates-in-layout="false"` renders at its parent's local
origin or at its explicit recipe placement.

### Reserve empty space

`<vx-spacer>` is the official non-visual layout item:

```vue
<vx-row :gap="0.3">
  <vx-box id="gateway" />
  <vx-spacer :width="1.5" :height="0.5" :depth="1" />
  <vx-box id="orders" />
</vx-row>
```

`size="1.5"` is shorthand for equal width and depth. An object `{ x, y, z }` or `Vector3` sets all dimensions.

### Shapes

Geometry props are intentionally shape-specific:

| Element | `size` | `height` | `depth` | Additional geometry props |
|---|---|---|---|---|
| `<vx-box>` | Width and default Z depth | Exact vertical extent | Overrides Z depth when positive | Rounded bevel is built in |
| `<vx-cylinder>` | Radial footprint | Exact vertical extent | Ignored | Bevel is built in |
| `<vx-wedge>` | Automatic-ring slot size | Extrusion height | Ignored | `thickness`; parent ring `radius` and `gap-ratio` |

`depth` is not a generic second radius. Radial shapes remain symmetric in X/Z and ignore it in both geometry and
layout measurement.

Shared mesh props:

| Prop | Purpose |
|---|---|
| `size` | Width and default depth |
| `height` | Vertical extent |
| `depth` | Box Z extent; ignored by cylinder and wedge |
| `material` | Reactive `VxMaterialProps` object |
| `hover` | Temporary material and scale overrides |
| `lines` | SDF text lines rendered on the mesh |
| `label-face` | `front` or `top` |
| `label-color` | RGB hex number |
| `label-padding` | Fractional face inset, clamped to `0..0.45` |
| `label-font-size` | World units; `0` enables automatic fitting |
| `label-line-height` | Text line-height multiplier |
| `label-align` | `left`, `center`, or `right` |

### Panel

```vue
<vx-panel
  name="api" id="api"
  :size="1.6"
  :depth="0.9"
  :height="0.22"
  :lines="['API service', 'healthy']"
  label-region="south"
  :label-share="0.4"
  :content-padding="0.08"
  layout="grid"
>
  <vx-stack><!-- content --></vx-stack>
</vx-panel>
```

`label-region` is `north` or `south`. `label-share` is clamped to `0.1..0.9`. The child `layout` accepts `grid`, `row`,
`depth`, `stack`, or `ring`. Panels also support material, hover, events, and the shared label styling props.

### Connector graph

```ts
import { connectors } from '@exceeder/vuetrex'

const graph = connectors
  .edges(links, {
    keyBy: ({ item: link }) => link.id,
    from: ({ item: link }) => link.source,
    to: ({ item: link }) => link.target,
  })
  .profile(({ item: link }) => link.critical ? 'ground' : 'air')
  .route({ strategy: ({ item: link }) => link.critical ? 'orthogonal' : 'bezier', lane: 'auto' })
  .bundle({ keyBy: ({ item: link }) => link.channel })
  .stroke({ key: 'shaft', color: ({ item: link }) => link.color, width: 0.015 })
  .named(({ item: link }) => `link:${link.id}`)
```

```vue
<vx-connectors :graph="graph" :parameters="parameters" @click="onConnectorClick" />
```

Sources are `connectors.empty()`, `edge()`, `edges()`, `bus()`, and `buses()`. Every source supports immutable fluent
`.profile()`, `.route()`, `.bundle()`, `.stroke()`, `.marker()`, `.flow()`, `.geometry()`, `.visible()`, `.named()`,
`.join()`, `.overlay()`, and `.pipe()` operators; matching functional operators are available on `connectors`.

`route()` accepts `strategy`, `surface`, `fromPort`, `toPort`, `clearance`, `elevation`, `lane`, `waypoints`, and
`obstacles`. Endpoints accept node IDs, `{ node, port }`, world positions, and positions local to a named node. Built-in
strategies are `orthogonal`, `direct`, `bezier`, `spline`, and `manual`. Register deterministic custom strategies with
`registerConnectorStrategy()`. Custom strategy points, normals, bounds, waypoints, obstacles, and result points use
frozen tuples rather than mutable Three.js values. Registrations are snapshotted when a stage controller is constructed.

`stroke()` accepts a stable layer `key` plus `color`, `width`, `opacity`, `dash`, `offset`, `markerStart`, `markerEnd`, and `depthTest`. Built-in
markers are `arrow`, `dot`, `diamond`, and `none`. `marker()` and `geometry()` use `GeometrySource`; `flow()` uses
`ParticleSource`. Fields consistently receive `{ item, key, index, ...domainContext }`. Parameter tokens are shared
across connector, geometry, and particle graphs and resolve through the host's `parameters`.

Resolution produces a route network with keyed runs, junctions, member keys, and one terminal traversal per target.
`flow()` and `geometry()` consume terminal traversals by default; pass `{ scope: 'network' }` to consume the whole
network explicitly. All public positions in these contexts are frozen `[x, y, z]` tuples.

Repeated `route()` calls merge properties with later values winning; `{ replace: true }` deliberately resets inherited
routing. Decoration layers with the same key merge or replace predictably. `connectors.join([])` is valid, matching
relationships auto-overlay their presentations, and independent reusable module instances accept `{ scope: 'name' }`.

Use `defineConnectors()` and `defineConnectorOutputs()` for reusable graph modules. Pure inspection is available through
`connectorGraphSignature()`, `describeConnectorGraph()`, `connectorGraphToDot()`, and `inspectConnectors()`; mounted
runtime state is returned by `stage.connectorDiagnostics()`.

`registerConnectorAppearance('stroke', factory)` can replace the stage-owned stroke realization contract for stages
constructed after registration; its unregister function affects future stages without mutating already-mounted ones.

The host is a non-spatial declaration: it never registers a node ID, participates in layout or camera bounds, or owns
an `Element3d`. Pointer handlers receive `(ConnectorHit, MouseEvent)` and activate owner-level picking.

### Instance repeater

```vue
<vx-instances
  :items="pods"
  key-by="id"
  :encoding="encoding"
  :geometry="geometry"
  :material="material"
  anchor="base"
/>
```

`anchor` is `base`, `center`, or `origin`. See [Large scenes](/guide/large-scenes) for encoding and current limitations.

### Procedural geometry

```vue
<vx-geometry
  :graph="geometry"
  :parameters="{ scale, color }"
  :material="{ color: 0xffffff, roughness: 0.7 }"
  :materials="{ foliage: { roughness: 0.55 } }"
  anchor="base"
/>
```

`graph` accepts a `GeometrySource` created by the exported `geo` primitives/operators or geometry modules. The result
is one semantic Vuetrex node backed by as many compatible Three.js instance batches and thin lines as the graph
requires. `parameters` resolves `geo.param()` bindings without replacing the graph. `materials` maps `geo.material()`
channel names to `VxMaterialProps`. `anchor` is `base`, `center`, or `origin`. See
[Procedural geometry](/guide/procedural-geometry).

Every `GeometrySource` supports immutable fluent composition through `.transform()`, `.distribute()`,
`.parameterMap()`, `.material()`, `.named()`, `.randomize()`, `.join()`, and `.pipe()`. The existing functional
`geo.transform(source, options)` style remains supported and interoperable.

### Particle systems

```vue
<vx-particles
  :graph="particleEffect"
  :parameters="{ size, speed }"
  anchor="origin"
  :paused="false"
  :time-scale="1"
  :interactive="false"
/>
```

`graph` accepts a `ParticleSource` created with `particles.path()`, `particles.paths()`, `particles.cloud()`, or
`particles.clouds()`. `parameters` resolves `particles.param()` values. `anchor` is `origin`, `center`, or `base`;
`paused` stops only this particle system and `time-scale` scales its clock.
`interactive` defaults to `false`; enable it only when individual particle/node pointer events are useful.

Every source supports `.appearance()`, `.motion()`, `.simulate()`, `.named()`, `.join()`, and `.pipe()`, with matching
functional operators on `particles`. The built-in `cpu` backend renders soft point batches and supports basic forces;
custom GPU/FBO execution is available through `registerParticleBackend()`. See
[Data-driven particles](/guide/particles).

### Display wall

```vue
<vx-display-wall
  shape="curved"
  :surface="surface"
/>
```

See [Display walls](/guide/display-walls) for canvas, SVG, and image-backed surfaces.

## Materials and hover

```ts
interface VxMaterialProps {
  color?: number
  opacity?: number
  transparent?: boolean
  roughness?: number
  metalness?: number
  emissive?: number
  emissiveIntensity?: number
  wireframe?: boolean
  map?: THREE.Texture | null
}

interface VxHoverProps extends VxMaterialProps {
  scale?: number
  transition?: number
}
```

Use RGB hex numbers such as `0x3e91c7`. Set `transparent: true` when using opacity below `1`.
Texture ownership remains with the caller, including disposal when a texture is replaced or its component unmounts.

## Events

Built-in interactive nodes support `click`, `dblclick`, `pointerenter`, and `pointerleave`.

```ts
interface VxMouseEvent extends MouseEvent {
  vxNode: Node
  vxPosition: unknown
  vxInstance?: InstanceHit<unknown> | GeometryHit<unknown> | ParticleHit<unknown>
}
```

Click and double-click bubble through the logical node tree. Pointer enter and leave do not.

## Public exports

The package exports:

- `Vuetrex`, `VxStage`, `VxSettings`, `VxFogSettings`, `VxDiagnosticsSettings`, `VxMouseEvent`, and camera/animation option types
- Material and hover types
- `DisplayWall`, `InstanceNode`, `Panel`, `Spacer`, `Node`, and `Base`
- Connector port, route, lane, and bus option types
- `registerElement()` and custom element registry types
- Instance geometry, encoding, key, anchor, item, and hit types
- The complete [composition API](/api/composition)
- `geo`, `defineGeometry()`, `defineGeometryOutputs()`, parameter and point-domain helpers, `GeometryNode`, graph
  inspection functions, and the procedural geometry source, output, material-channel, semantic, diagnostic, and
  operator option types
- `particles`, `defineParticles()`, `defineParticleOutputs()`, `ParticleNode`, particle graph/field types, and the
  custom backend registration API

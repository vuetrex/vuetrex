---
title: Components and props
description: Reference for the Vuetrex component, built-in scene elements, materials, and events.
outline: deep
---

# Components and props

This page is a lookup reference. Start with [Build your first scene](/guide/) for a guided introduction.

## `<Vuetrex>`

See the [complete root component reference](/api/vuetrex) for all attributes, settings, events, defaults, and editor support.

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
| `settings` | `VxSettings` | `{}` | Initial stage configuration; read at mount |
| `camera` | `VxCameraView` | `scene` | Named node, automatic overview, or explicit `{ orbit }` pose |
| `stopped` | `boolean` | `false` | Pause the stage animation loop |
| `elements` | `ElementRegistry` | `{}` | Per-stage custom element registrations |
| `items` | `unknown[]` | `[]` | Currently unused; supply content through the slot |

The `ready` event receives the [`VxStage`](/api/stage) interface.

## Built-in scene elements

### Scene declarations

These hosts extend `StageDeclaration`, take no layout space, and support reactive prop changes. One of each kind is
allowed per scene. Removing the declaration restores the previous stage configuration.

| Element | Props and defaults |
| --- | --- |
| `vx-environment` | `preset="studio"`, optional caller-owned `texture`, `enabled=true`, `intensity=0.55`, Y `rotation=0` in radians |
| `vx-lighting` | `keyIntensity=5.5`, `fillIntensity=2`, `shadowQuality="medium"` (`off`, `low`, `medium`, `high`) |
| `vx-camera` | `fit="content"`, `direction=[0, 0.65, 1]`, `padding=0.75`, `duration=0.6` seconds |
| `vx-floor` | `finish="matte"` or `"mirror"`, `color=0x3f3f3f`, `reflection=0.6`, `grid=false`, `captions=false`; optional paired `fadeStart` and `fadeEnd` |

Live lighting controls the two stage-owned directional lights. The shadow-casting key uses `lightColor2`;
the fill uses `lightColor1`. Intensities must be finite and nonnegative; zero turns off that light's contribution.

```vue
<vx-lighting :key-intensity="4" :fill-intensity="1.5" shadow-quality="high" />
```

Shadow presets use 256/8 (`low`), 512/16 (`medium`), or 1024/32 (`high`) map resolution/blur samples.
Resolution is capped by the GPU texture limit. `off` disables the key's shadow and releases its shadow targets.
The stage setting `shadows: false` remains authoritative for every preset. Quality changes preserve the existing
shadow camera and softness radius; higher quality does not expand shadow coverage. Removed props restore the
listed defaults; removing the declaration restores the configuration captured at mount. Only one `vx-lighting`
is allowed per scene. Environment lighting and application-added lights are independent. These controls do not
add baked/contact shading, composer ambient occlusion, or bloom.

Environment texture input takes precedence over the studio preset. Disabling preserves the generated texture for
reuse; replacing it with a borrowed texture disposes the generated resource. Camera direction sets the view heading,
while fitting determines distance. Floor reflection is 0–1; increasing it reduces the opaque floor contribution.
Set both floor fade values to blend the floor into the exact stage background by its world-space X/Z extent. For
example, `:fade-start="20" :fade-end="50"` keeps the central 40-by-40 area crisp and removes the distant edge.

Scene and connector declarations accept both kebab-case and camelCase multi-word
props (`fade-start` / `fadeStart`, `stroke-width` / `strokeWidth`). Use one spelling
per prop in a render. Omitting a binding or passing `null`/`undefined` restores the
scene default or connector inheritance; required endpoint/port fields must still
be supplied. Numeric props accept finite numbers and nonempty numeric strings,
not booleans, arrays, or objects. Boolean props accept booleans, `"true"`, `"false"`,
or an empty presence attribute. Unknown declaration props are errors.

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
<vx-connectors scope="network" :graph="graph" :parameters="parameters" @click="onConnectorClick" />
```

`vx-connectors` also accepts direct keyed `vx-edge` children instead of `graph`. Each child requires `from` and `to`.
A local `vx-edge` under a spatial host inherits its source node and public scope from that host's explicit `id`.
Keys must be unique per scope. Host `scope` defaults to a generated identity; give it a name for handles that survive remounts.

| Tag | Props | Contract |
| --- | --- | --- |
| `vx-connectors` | `graph`, `parameters`, `scope`, `interactive`, presentation props | Either graph or direct edge children |
| `vx-edge` | Vue `key`, `from`, `to`, `interactive`, presentation props | Required stable key; literal endpoints use `node` or `node.port`, and local `from` must address the parent ID |
| `vx-port` | `name`, `position` + `normal`, or `face` + optional `at`; `override`, `disabled`, `direction` | Direct owner must have explicit ID; one base and one override per name |

Presentation props are `appearance`, `route-strategy`, `clearance`, `elevation`, `stroke-color`, `stroke-width`,
`stroke-opacity`, `marker-start`, and `marker-end`. Stylesheet definitions support a separate `connectors` registry
in each common/light/dark scheme. Backend defaults, named appearance, host props, then edge props or explicit graph
fields determine the final values. `null`/`undefined` template props restore inheritance.

Stroke width, clearance, and elevation must be nonnegative; opacity is in [0, 1].
Markers accept `arrow`, `dot`, `diamond`, `none`, or bound `false`. Route strategy
names must be nonempty strings and may name a registered custom strategy.

A face is `left`, `right`, `front`, `back`, `top`, or `bottom`; `at` is a normalized pair, default `[0.5, 0.5]`.
Exact position and normal are finite local triples with a nonzero normal. Disabled overrides can omit coordinates.
Bind `{ node, port: { name } }` when an endpoint ID or port name contains a dot, or when either value is dynamic.
Bare node endpoints use the automatic port even when a declared port exists.
See [component ports and coordinates](/guide/connections-and-focus#publish-ports-from-a-reusable-component).

`stage.connections.get({ scope, key })`, `.list({ scope? })`, and `.portsOf(nodeId)` expose immutable read snapshots.
Edge hits include `handle: { scope, key }`. Port declarations are invisible and not pickable by themselves.

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

Start with the [stylesheet materials guide](/guide/stylesheet-materials) for reusable style objects and complete examples.

```ts
interface VxMaterialProps {
  color?: THREE.ColorRepresentation
  opacity?: number
  alphaMode?: 'opaque' | 'blend' | 'mask'
  alphaTest?: number
  roughness?: number
  metalness?: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  wireframe?: boolean
  side?: THREE.Side
  depthWrite?: boolean
  depthTest?: boolean
  flatShading?: boolean
  toneMapped?: boolean
  map?: THREE.Texture | null
  normalMap?: THREE.Texture | null
  bumpMap?: THREE.Texture | null
  bumpScale?: number
  roughnessMap?: THREE.Texture | null
  metalnessMap?: THREE.Texture | null
  emissiveMap?: THREE.Texture | null
  alphaMap?: THREE.Texture | null
  envMapIntensity?: number
}

interface VxHoverProps extends VxMaterialProps {
  scale?: number
  transition?: number
}
```

Colors accept RGB hex numbers, CSS color strings, or Three.js colors. On fixed shapes, panels, instances, and procedural materials, omitted fields
restore the stage's construction defaults; setting `material` to `undefined` restores the whole default appearance.
The stage supplies its main color, roughness `0.3`, and metalness `0.1`; other values use Three.js standard-material
defaults. A texture value of `null` clears that slot, while `undefined` falls back to the lower-priority layer.
Texture ownership remains with the caller, including disposal when a texture is replaced or its component unmounts.

`bumpMap` is a linear grayscale height texture (default `null`). `bumpScale` defaults to `1`; zero flattens
the effect and negative values invert it. A non-null `normalMap` takes precedence over `bumpMap`. These maps
change surface lighting, not silhouettes or geometric shadows. Start with a small scale for subtle relief.

When `alphaMode` is omitted, a positive `alphaTest` selects `mask`, otherwise opacity below `1` selects `blend`,
otherwise the material is `opaque`. An explicit mode wins. Mask mode defaults to a cutoff of `0.5`; the other modes
use a cutoff of `0`. Blending keeps depth writing enabled unless `depthWrite: false` is supplied. The old
`transparent` prop has been removed; use `alphaMode: 'blend'` or `alphaMode: 'opaque'` for an explicit policy.

Hover supports all material fields. `scale` multiplies the object's base scale, and `transition` is a duration in
seconds (default `0.18`; `0` applies immediately). Numeric fields and colors interpolate; textures and flags switch
immediately. Leaving a blended hover keeps blending enabled until its opacity transition completes. Pointer changes
cancel previous transitions. Editing or removing material/hover props during a transition cancels it and immediately
applies the newly resolved appearance, including while the pointer remains over the node.

`resolveMaterial(...layers)` is a pure public resolver. Pass inline descriptors in increasing priority order; it
returns a complete, frozen `VxResolvedMaterial`, with colors as frozen linear RGB tuples and borrowed texture
references. It allocates no materials and does not mutate inputs. With no layers it uses Three.js defaults, not
stage-specific defaults. The resolved value is intended for material realization; it is not an inline prop object.

`VxMaterialBinding` accepts an inline descriptor, a style name, or `{ preset: name, ...inlineOverrides }`.
`defineVxStyleSheet()` freezes the structure of `common`/`light`/`dark` material definitions without freezing textures.
`Vuetrex` takes reactive `sheets` and `scheme` (`light`, `dark`, `system`) props. The optional `VxStylesheet`
component (`<vx-stylesheet>`) supplies both to descendant scenes. Styles support `extends`, `base`, and `hover`.
Unknown names and inheritance cycles are errors. Later sheets override fields; undefined fields fall through.
The nearest provider supplies omitted scene props; explicit scene props take precedence. Named hover is used by fixed shapes and panels only.

`finishes.satinMetal()`, `polishedMetal()`, `matteCeramic()`, `glazedCeramic()`, and `tintedGlass()` return plain
`VxMaterialProps` values and accept overrides. They allocate no GPU resources.

`useCanvasTexture(paint, { purpose, width?, height? })` returns a readonly texture ref. The initial value is null;
creation occurs after mount, reactive paint dependencies trigger redraw, and disposal occurs on unmount. Dimensions
default to 256 and must be integers from 1 to 8192. Purpose is `color`, `emissive`, `roughness`, `metalness`, `normal`, `bump`, or
`alpha`; only color/emissive use sRGB. The owning component must outlive every consumer of that texture.

Thin procedural lines apply color, opacity, alpha cutoff, color map, depth test/write, and tone mapping. Lit material
fields and alpha maps are not supported on thin lines. Selected/disabled variants and material caching are deferred.

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

## Fixed-shape extension API

`MeshNode`, `MeshNodeStage`, and `MeshState` are exported from `@exceeder/vuetrex`.
Register subclasses through `elements` or `registerElement()`. See the
[fixed-shape extension guide](/guide/fixed-shape-extensions) for the supported hooks,
geometry/material ownership, compiler configuration, and packaged-consumer example.

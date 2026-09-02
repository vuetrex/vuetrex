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
| `<vx-group>` | Automatic or dynamic layout group | `layout`, `size`, `height`, `gap`, `placement` |
| `<vx-row>` | X-axis layout | `size`, `height`, `gap`, alignment |
| `<vx-layer>` | Z-axis layout and scaling boundary | `size`, `height`, `gap`, `scale`, `elevation` |
| `<vx-stack>` | Y-axis layout | `size`, `height`, `gap` |
| `<vx-ring>` | XZ circular layout | `radius`, `start-angle`, `direction`, `gap-ratio` |
| `<vx-panel>` | Rounded visual container with label/content regions | panel props below |
| `<vx-spacer>` | Empty measured layout reservation | `width`, `height`, `depth`, or `size` |

Every group supports `align`, `align-x`, `align-y`, and `align-z` with `start`, `center`, or `end`.

`<vx-group layout>` accepts `grid`, `row`, `depth`, `stack`, and `ring`. `placement` accepts a composition
[`Placement`](/api/composition#placements) and removes that group from its parent's automatic layout.

### Identity and behavior

Every scene node supports the following props:

| Prop | Default | Purpose |
|---|---|---|
| `id` | Legacy `name` or generated ID | Stable semantic address for focus, animation, connections, and diagnostics |
| `name` | empty | Human-readable node name; duplicate non-empty names throw in development |
| `text` | empty | Visible floor caption where the node type supports captions |
| `visible` | `true` | Show the node; hidden nodes still reserve layout space |
| `disabled` | `false` | Keep the node visible but suppress its pointer and click events |
| `participates-in-layout` | `true` | Include the node in parent measurement and automatic placement |

Use Vue's `:key` for virtual-tree identity and Vuetrex's `id` for scene identity. Use `name`, `text`, or shape labels for what people read.
For backwards compatibility, `name` remains the semantic ID when no explicit `id` is supplied. Vue keys never become
scene IDs implicitly.

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
| `connection` | Connect this node to a named target |
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
  name="api"
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

### Connector

```vue
<vx-connector
  from="gateway"
  to="orders"
  type="particles"
  layout="orthogonal"
/>
```

`type` is `particles` or `line`. `layout` is `orthogonal` or `direct`; `straight` is a compatibility alias. Connector
nodes do not participate in layout.

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

### Display wall

```vue
<vx-display-wall
  shape="curved"
  mode="continuous"
  :surface="surface"
/>
```

See [Display walls](/guide/display-walls) for continuous and independent screen modes.

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
}

interface VxHoverProps extends VxMaterialProps {
  scale?: number
  transition?: number
}
```

Use RGB hex numbers such as `0x3e91c7`. Set `transparent: true` when using opacity below `1`.

## Events

Built-in interactive nodes support `click`, `dblclick`, `pointerenter`, and `pointerleave`.

```ts
interface VxMouseEvent extends MouseEvent {
  vxNode: Node
  vxPosition: unknown
  vxInstance?: InstanceHit<unknown>
}
```

Click and double-click bubble through the logical node tree. Pointer enter and leave do not.

## Public exports

The package exports:

- `Vuetrex`, `VxStage`, `VxSettings`, `VxDiagnosticsSettings`, `VxMouseEvent`, and camera/animation option types
- Material and hover types
- `DisplayWall`, `InstanceNode`, `Panel`, `Spacer`, `Node`, and `Base`
- `registerElement()` and custom element registry types
- Instance geometry, encoding, key, anchor, item, and hit types
- The complete [composition API](/api/composition)

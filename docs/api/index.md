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

Every group supports `align`, `align-x`, `align-y`, and `align-z` with `start`, `center`, or `end`.

`<vx-group layout>` accepts `grid`, `row`, `depth`, `stack`, and `ring`. `placement` accepts a composition
[`Placement`](/api/composition#placements) and removes that group from its parent's automatic layout.

### Shapes

| Element | Geometry | Defaults and special props |
|---|---|---|
| `<vx-box>` | Rounded box | `size=1`, `height=0.5`, optional `depth` |
| `<vx-cylinder>` | Beveled cylinder | `size=1`, `height=0.33` |
| `<vx-wedge>` | Beveled ring segment | `size=1`, `height=0.33`, optional `thickness` |

Shared mesh props:

| Prop | Purpose |
|---|---|
| `name` | Stable address for focus, animation, and connectors |
| `text` | Shared scene caption |
| `size` | Width and default depth |
| `height` | Vertical extent |
| `depth` | Box Z extent; `0` falls back to `size` |
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

- `Vuetrex`, `VxStage`, `VxSettings`, `VxMouseEvent`, and camera/animation option types
- Material and hover types
- `DisplayWall`, `InstanceNode`, `Panel`, `Node`, and `Base`
- `registerElement()` and custom element registry types
- Instance geometry, encoding, key, anchor, item, and hit types
- The complete [composition API](/api/composition)

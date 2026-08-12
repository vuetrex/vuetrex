# Core concepts

## Layout containers

Vuetrex containers measure their children and place them in local 3D coordinate spaces:

| Element | Layout |
|---|---|
| `<vx-group>` | Automatic XZ grid |
| `<vx-row>` | Left-to-right on X |
| `<vx-layer>` | Front-to-back on Z |
| `<vx-stack>` | Bottom-to-top on Y |
| `<vx-ring>` | Circular placement in XZ |

Named containers are convenient aliases. The canonical form is also available when choosing a layout dynamically:

```vue
<vx-group layout="row">
  <vx-box />
  <vx-box />
</vx-group>

<vx-group layout="ring" start-angle="45" direction="reverse">
  <vx-wedge v-for="item in items" :key="item.id" />
</vx-group>
```

Supported `layout` values are `grid`, `row`, `depth`, `stack`, and `ring`.

Containers can be nested freely:

```vue
<vx-layer>
  <vx-row>
    <vx-stack>
      <vx-box text="service" />
      <vx-cylinder text="pod" />
    </vx-stack>
  </vx-row>
</vx-layer>
```

### Size, height, and gap

Without an explicit size, a container derives its footprint from its children. `gap` controls the space between
children. Its fallback is the stage `gap`, then the stage's legacy `distance` setting.

```vue
<vx-row :gap="0.4">
  <vx-box />
  <vx-box />
</vx-row>
```

`size` reserves an XZ footprint and `height` reserves Y. A reservation may shrink overflowing container content but
never enlarges it:

```vue
<vx-row :size="4" :height="1" />
<vx-group :size="{ x: 6, y: 2, z: 4 }" />
```

### Ring options

`start-angle` rotates the first child in degrees. Zero starts at the front (`+Z`); `90` starts at `+X`.
`direction` is `normal` or `reverse`. Both props are reactive.

For segmented wedge rings, `gap-ratio` reserves a fraction of each no-gap segment's outer chord as empty space
without changing the ring radius. Its range is `0` (solid) through values below `1`. For example, `0.25` makes the
separator width 25% of that full chord. With explicit `radius` and `thickness`, separators are constant-width radial
slots: their sides follow the ring normals instead of converging toward the inner circle. The ratio describes the
narrowest finished opening after beveling; the underlying cut and bevel adapt together so every separator retains
that width. Setting `gap-ratio` selects this spacing mode and ignores the world-unit `gap`.

Set `radius` on the ring to control the exact outer arc radius, and `thickness` on each wedge to control the radial
distance between its outer and inner arcs. Both use world units and remain constant when the number of wedges changes.
When these props are omitted, wedges retain their content-driven legacy sizing.

```vue
<vx-ring :radius="1" :start-angle="45" direction="reverse" :gap-ratio="0.25">
  <vx-wedge v-for="item in items" :key="item.id" :thickness="0.15" />
</vx-ring>
```

### Alignment

Alignment shifts a child inside its content-sized slot. Values are `start`, `center`, and `end`; the default is
`center`, preserving existing scenes.

```vue
<vx-row align="center" />
<vx-row align-x="start" align-y="center" align-z="end" />
<vx-stack align-z="end" />
```

`align` sets all three axes. `align-x`, `align-y`, and `align-z` override individual axes.

## Panels

`panel` is a visual rounded-box container that divides its top face between a label and child content. By default the
label uses the south 40% and children are fitted into the north 60%.

```vue
<vx-panel
  name="api"
  :size="1.6"
  :depth="0.9"
  :height="0.22"
  :lines="['API service']"
  label-region="south"
  :label-share="0.4"
  :material="{ color: 0x174f88 }"
>
  <vx-stack :gap="0.025">
    <vx-box :size="0.4" :height="0.12" />
    <vx-box :size="0.4" :height="0.12" />
    <vx-box :size="0.4" :height="0.12" />
  </vx-stack>
</vx-panel>
```

Use `label-region="north"` to reverse the split. `label-share` is clamped to `0.1–0.9`; `content-padding` controls the
inset inside the child region. `layout` accepts `grid`, `row`, `depth`, `stack`, or `ring`. `lines`, label font/color/
alignment props, material, hover, events, names, nesting, and connector endpoints are reactive.

## Custom elements

Use `registerElement()` before mounting to register a node globally:

```ts
import { registerElement } from '@exceeder/vuetrex'
import { ServerNode } from './ServerNode'

registerElement('vx-server', ServerNode)
```

Then use the tag in Vuetrex templates:

```vue
<vuetrex>
  <vx-server text="API" />
</vuetrex>
```

For one Vuetrex instance, pass an element registry through its `elements` prop instead.

## Connectors and captions

```vue
<vuetrex>
  <vx-box name="a" />
  <vx-cylinder name="b" text="Round" connection="a" />
  <vx-connector from="a" to="b" type="line" layout="direct" />
</vuetrex>
```

Named nodes can be connected through the `connection` shorthand or a `<vx-connector>`. Caption text is reactive.

## Events

Vuetrex supports `click`, `dblclick`, `pointerenter`, and `pointerleave`. Click and double-click bubble through the
logical node tree; pointer enter and leave do not.

```vue
<vx-box
  :text="String(counter)"
  @click="counter++"
  @pointerenter="hovered = true"
  @pointerleave="hovered = false"
/>
```

## Camera

Set `camera` to a node name to focus it, or to `scene` for the overview:

```vue
<vuetrex :camera="camera">
  <vx-row>
    <vx-box
      v-for="item in items"
      :key="item"
      :name="item"
      :text="item"
      @click="camera = camera === item ? 'scene' : item"
    />
  </vx-row>
</vuetrex>
```

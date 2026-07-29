# Core concepts

## Layout containers

Vuetrex containers measure their children and place them in local 3D coordinate spaces:

| Element | Layout |
|---|---|
| `<group>` | Automatic XZ grid |
| `<row>` | Left-to-right on X |
| `<layer>` | Front-to-back on Z |
| `<stack>` | Bottom-to-top on Y |
| `<ring>` | Circular placement in XZ |

Named containers are convenient aliases. The canonical form is also available when choosing a layout dynamically:

```vue
<group layout="row">
  <box />
  <box />
</group>

<group layout="ring" start-angle="45" direction="reverse">
  <wedge v-for="item in items" :key="item.id" />
</group>
```

Supported `layout` values are `grid`, `row`, `depth`, `stack`, and `ring`.

Containers can be nested freely:

```vue
<layer>
  <row>
    <stack>
      <box text="service" />
      <cylinder text="pod" />
    </stack>
  </row>
</layer>
```

### Size, height, and gap

Without an explicit size, a container derives its footprint from its children. `gap` controls the space between
children. Its fallback is the stage `gap`, then the stage's legacy `distance` setting.

```vue
<row :gap="0.4">
  <box />
  <box />
</row>
```

`size` reserves an XZ footprint and `height` reserves Y. A reservation may shrink overflowing container content but
never enlarges it:

```vue
<row :size="4" :height="1" />
<group :size="{ x: 6, y: 2, z: 4 }" />
```

### Ring options

`start-angle` rotates the first child in degrees. Zero starts at the front (`+Z`); `90` starts at `+X`.
`direction` is `normal` or `reverse`. Both props are reactive.

```vue
<ring :start-angle="45" direction="reverse">
  <wedge v-for="item in items" :key="item.id" />
</ring>
```

### Alignment

Alignment shifts a child inside its content-sized slot. Values are `start`, `center`, and `end`; the default is
`center`, preserving existing scenes.

```vue
<row align="center" />
<row align-x="start" align-y="center" align-z="end" />
<stack align-z="end" />
```

`align` sets all three axes. `align-x`, `align-y`, and `align-z` override individual axes.

## Custom elements

Use `registerElement()` before mounting to register a node globally:

```ts
import { registerElement } from '@exceeder/vuetrex'
import { ServerNode } from './ServerNode'

registerElement('server', ServerNode)
```

Then use the tag in Vuetrex templates:

```vue
<vuetrex>
  <server text="API" />
</vuetrex>
```

For one Vuetrex instance, pass an element registry through its `elements` prop instead.

## Connectors and captions

```vue
<vuetrex>
  <box name="a" />
  <cylinder name="b" text="Round" connection="a" />
  <connector from="a" to="b" type="line" layout="straight" />
</vuetrex>
```

Named nodes can be connected through the `connection` shorthand or a `<connector>`. Caption text is reactive.

## Events

Vuetrex supports `click`, `dblclick`, `pointerenter`, and `pointerleave`. Click and double-click bubble through the
logical node tree; pointer enter and leave do not.

```vue
<box
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
  <row>
    <box
      v-for="item in items"
      :key="item"
      :name="item"
      :text="item"
      @click="camera = camera === item ? 'scene' : item"
    />
  </row>
</vuetrex>
```

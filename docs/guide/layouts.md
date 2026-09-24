---
title: Layout in 3D
description: Build deep scenes from measured, nested local layouts.
---

# Layout in 3D

## The problem: every child needs coordinates

Three.js normally expects a position, rotation, and scale for every object. That works for a hand-built model but makes
data-driven scenes brittle: one new pod can force dozens of coordinates to change.

Vuetrex containers measure their children and place them in a **local coordinate space**.

```vue
<vx-row :gap="0.35">
  <vx-box :size="1.2" />
  <vx-cylinder :size="0.7" />
  <vx-box :size="0.9" />
</vx-row>
```

The row uses each child's measured width. No slot index or manual X coordinate is required.

## Choose the relationship you mean

| Element | Spatial meaning |
|---|---|
| `<vx-group>` | Automatic grid on XZ |
| `<vx-row>` | Left to right on X |
| `<vx-layer>` | Front to back on Z |
| `<vx-stack>` | Bottom to top on Y |
| `<vx-ring>` | Circular placement on XZ |

`<vx-group :layout="mode">` supports `grid`, `row`, `depth`, `stack`, and `ring` when layout is selected dynamically.

![Four local layout relationships: row follows X, layer follows Z, stack follows Y, and ring follows a circle on the XZ plane.](/images/layout-relationships.svg)

For example, put three service components in a row, then put that row and a database in a layer. The row handles
horizontal spacing; the layer handles depth between the two groups. Neither service needs to know its world position.

```vue
<vx-layer :gap="0.8">
  <vx-row :gap="0.3">
    <ServiceNode v-for="service in services" :key="service.id" :service="service" />
  </vx-row>
  <DatabaseNode :database="primaryDatabase" />
</vx-layer>
```

## Start at the ground plane

Vuetrex uses Three.js's Y-up coordinate system. The visible floor is exactly at world `Y = 0`, and the standard
`base` anchor places an object's lowest point there. Height and stack layout then grow in the positive Y direction.
This makes vertical scaling predictable: a box with `height="0.6"` spans Y `0..0.6` instead of growing equally above
and below its position.

Mesh nodes and the default `base` anchors for instances and procedural geometry follow this convention. Explicit
recipe placements also treat `position.y = 0` as the floor. Use `anchor="center"` or `anchor="origin"` only when the
authored coordinates intentionally need a different origin; a negative Y placement deliberately puts content below
the floor.

When floor reflection is enabled, the reflector is the floor: one material combines the reflected scene with the
floor tint, grid, captions, lighting, and shadows on the same surface at world `Y = 0`. No internal floor clearance
leaks into layout, so application placements never need to compensate for rendering details.

## Build depth by nesting

```vue
<vx-layer :gap="0.8">
  <vx-row :gap="0.5">
    <ServiceNode v-for="service in edge" :key="service.id" :service="service" />
  </vx-row>

  <vx-row :gap="0.5">
    <ServiceNode v-for="service in core" :key="service.id" :service="service" />
  </vx-row>

  <vx-ring :radius="1.8" start-angle="45" direction="reverse">
    <DatabaseNode v-for="database in stores" :key="database.id" :database="database" />
  </vx-ring>
</vx-layer>
```

Each container establishes its own origin. Moving or scaling the outer layer carries every descendant with it. This is
what makes five to seven levels of composition manageable: each component only reasons about its immediate children.

## Let content determine size

With no explicit size, a container derives its footprint from its children. `gap` is measured in world units.

```vue
<vx-stack :gap="0.03">
  <vx-box :size="0.6" :height="0.12" />
  <vx-box :size="0.6" :height="0.18" />
  <vx-box :size="0.6" :height="0.08" />
</vx-stack>
```

An explicit `size` or `height` becomes a maximum reservation. The default `fit="shrink"` behavior uniformly shrinks
larger nested content to fit; it does not enlarge smaller content.

```vue
<vx-group :size="{ x: 5, y: 2, z: 3 }">
  <!-- measured content is fitted inside this reservation -->
</vx-group>
```

Use `fit="none"` when the reservation should affect parent layout measurement without scaling the subtree:

```vue
<vx-row :size="4" fit="none">
  <!-- Content may render beyond the four-unit reservation. -->
</vx-row>
```

## Reverse linear layouts

Rows, layers, and stacks accept `direction="reverse"`. It changes placement order without changing Vue child order,
keys, or event bubbling.

```vue
<vx-row direction="reverse">
  <vx-box v-for="service in services" :key="service.id" />
</vx-row>
```

## Align when comparison matters

Alignment shifts children around their calculated positions:

```vue
<vx-row align-y="start" :gap="0.4">
  <vx-box :height="0.3" />
  <vx-box :height="0.8" />
  <vx-box :height="0.5" />
</vx-row>
```

Use `align="start|center|end"` for all axes, or `align-x`, `align-y`, and `align-z` individually.

## Use rings for cycles and radial comparison

```vue
<vx-ring
  :radius="2.2"
  start-angle="90"
  direction="reverse"
  :gap-ratio="0.12"
>
  <vx-wedge
    v-for="segment in segments"
    :key="segment.id"
    :height="segment.load * 0.5 + 0.08"
    :thickness="0.24"
  />
</vx-ring>
```

`start-angle` is in degrees. `radius` fixes the outer radius. For wedge rings, `gap-ratio` controls the empty fraction
between segments and `thickness` controls radial thickness.

## Use a placement when layout is data-dependent

Built-in containers answer common structural questions. A recipe can supply an explicit placement for arrangements
such as spheres, geographic projection, or temporal depth:

```vue
<vx-group
  v-for="node in scene.fragment.nodes"
  :key="node.id"
  :name="node.id" :id="node.id"
  :placement="node.placement"
>
  <ServiceNode :service="node.data" />
</vx-group>
```

The placement positions the whole local subtree. The component inside can continue using rows, stacks, rings, and
panels without knowing its world position.

## Reserve a deliberate gap

Do not add invisible geometry when the layout needs an empty slot. Use `<vx-spacer>` so the reservation remains
measurable without adding draw calls, shadows, captions, or camera bounds:

```vue
<vx-row :gap="0.25">
  <ServiceNode :service="gateway" />
  <vx-spacer :width="1.2" :height="0.6" :depth="0.8" />
  <ServiceNode :service="orders" />
</vx-row>
```

For conditional data, choose whether the missing item should collapse:

```vue
<ServiceNode v-if="service" :service="service" />
<vx-spacer v-else :size="1" :height="0.5" />
```

`visible="false"` is another way to hide a node while retaining its measured slot. Set
`participates-in-layout="false"` when the slot should collapse independently of visibility.

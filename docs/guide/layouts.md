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

An explicit `size` or `height` becomes a maximum reservation. If nested content is larger, the container uniformly
shrinks its subtree to fit; it does not enlarge smaller content.

```vue
<vx-group :size="{ x: 5, y: 2, z: 3 }">
  <!-- measured content is fitted inside this reservation -->
</vx-group>
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
  :name="node.id"
  :placement="node.placement"
>
  <ServiceNode :service="node.data" />
</vx-group>
```

The placement positions the whole local subtree. The component inside can continue using rows, stacks, rings, and
panels without knowing its world position.

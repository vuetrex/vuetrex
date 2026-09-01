---
title: Composition API
description: Reference for representation recipes, placements, scene fragments, and operators.
outline: deep
---

# Composition API

The composition API is a pure planning layer. See [Composition recipes](/guide/composability) for the problem-led
introduction.

## `compose()`

```ts
compose(recipe, data, context?): ComposedScene
```

Runs `select`, `aggregate`, `arrange`, and `emit` in order. Returns the emitted fragment and a copy of the recipe's
capabilities.

## Recipe and context

```ts
interface RepresentationRecipe<T, Selected, Aggregated, Emitted> {
  select(data: T, context: CompositionContext): Selected
  aggregate(data: Selected, context: CompositionContext): Aggregated
  arrange(data: Aggregated, context: SpatialContext): Placement[]
  emit(data: Aggregated, placements: Placement[]): SceneFragment<Emitted>
  capabilities: Capability[]
}

interface CompositionContext {
  time?: number
  selectedId?: string
  parameters?: Readonly<Record<string, unknown>>
}

interface SpatialContext extends CompositionContext {
  origin?: Vector3
}
```

## Placements

```ts
interface Placement {
  position: Vector3
  orientation: Quaternion
  scale: Vector3
  visibility?: boolean
  lod?: number
}
```

`visibility: false` hides the placed group. `lod` is reserved and currently has no renderer behavior.

### Spatial operators

All spatial operators preserve item order and return one placement per item. Positions are local to `context.origin`.

| Function | Options | Default behavior |
|---|---|---|
| `row(items, context?, options?)` | `gap`, `scale` | Centered on X; gap `1` |
| `stack(items, context?, options?)` | `gap`, `scale` | Starts at origin and rises on Y |
| `ring(items, context?, options?)` | `radius`, `startAngle`, `arc`, `faceCenter`, `scale` | Full ring |
| `sphere(items, context?, options?)` | `radius`, `orientOutward`, `scale` | Fibonacci sphere, outward orientation |
| `timeline(items, context?, options?)` | `gap`, `rise`, `scale` | Recedes along negative Z |
| `radialFocus(items, context, options)` | `id`, `relations`, inner/outer radii, per-band scales | Selected centre, direct neighbours inside, remaining context outside |

Recipe ring angles and arcs use **radians**. The `<vx-ring start-angle>` template prop uses **degrees**.

`radialFocus()` reads the selected ID from `context.selectedId`. Relations are treated as bidirectional for placement,
and output order always matches item order so the result can be passed directly to `encode()`. Without a valid selected
item it falls back to an outer overview ring.

## Collection operators

```ts
filter(items, predicate): T[]
groupBy(items, keyOf): Array<{ key, items }>
aggregate(items, reducer, initial): Result
```

`groupBy()` preserves first-seen key order. `aggregate()` is a typed wrapper around `Array.reduce`.

## Scene fragments

```ts
interface SceneFragment<T> {
  nodes: SceneNode<T>[]
  connections: SceneConnection[]
  labels: SceneLabel[]
}

interface SceneNode<T> {
  id: string
  data: T
  placement: Placement
  representation?: string
  props?: Readonly<Record<string, unknown>>
}

interface SceneConnection<T = unknown> {
  id: string
  from: string
  to: string
  data?: T
  bundle?: string
}

interface SceneLabel {
  id: string
  target: string
  text: string
}
```

### Emission operators

```ts
encode(items, placements, {
  id: (item, index) => string,
  representation?: string | ((item, index) => string),
  props?: (item, index) => Record<string, unknown>,
}): SceneFragment
```

`encode()` throws when item and placement counts differ.

```ts
connect(fragment, connections): SceneFragment
bundleBy(connections, keyOf): SceneConnection[]
label(fragment, textForNode): SceneFragment
```

These functions return new top-level arrays and leave the input fragment available to the caller.

## Capabilities

```ts
type CapabilityType =
  | 'select'
  | 'inspect'
  | 'focus'
  | 'restart'
  | 'pause'
  | 'animate'

interface Capability {
  type: CapabilityType
  target: 'scene' | 'node' | 'instance'
}
```

Capabilities describe intended controls. They do not invoke actions or grant authorization.

## Operator discovery

`operatorCatalog` exposes each built-in operator as a short `{ name, phase, result }` record. It is suitable for
composition editors and machine-readable tool descriptions that should not expose low-level Three.js controls.

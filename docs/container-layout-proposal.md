# Container Layout Design

*Scope: child placement within containers. Rendering, events, materials, connectors, animation, and scene setup are out of scope.*

---

## Why This Change

The current containers each carry private conventions: `size` means something different in `Group` and `Ring`; Y placement is inconsistent across layouts; overflow is implicit; and slot sizing is not exposed at all. Users must learn per-container rules instead of one shared model.

This design replaces per-container rules with a single layout engine and a shared vocabulary, while keeping named containers as familiar authoring shortcuts.

---

## Mental Model

Every container answers four questions:

1. **Space** — What is my available footprint?
2. **Slots** — How do I divide that space among children?
3. **Placement** — Where inside each slot does a child sit?
4. **Fit** — What happens when the child is larger than its slot?

Every prop maps to exactly one of these questions. The question is noted beside each prop below.

---

## Vocabulary

| Term | Meaning |
|------|---------|
| `size` | Container's available local space (XYZ vector) |
| `height` | Canonical shorthand for `size.y` |
| `bounds` | A node's declared XYZ extent; read by the parent layout |
| `slot` | Area assigned to one child |
| `slot-size` | How each slot's dimensions are computed |
| `gap` | Fixed space between adjacent slots (world units) |
| `align` | Child position inside its slot |
| `fit` | Scale behavior when the child exceeds its slot |
| `direction` | Ordering along the primary axis |
| `wrap` | Whether a 1-D layout may continue on a second axis |
| `origin` | Local anchor point of the container |

**`size` describes usable content space, not outer bounds.** Gap is subtracted from content space before slots are computed.

**`height` is the canonical Y-extent prop.** `size.y` is accepted in object literals and normalized to `height` internally. When both appear on the same element, the last write wins; a development warning fires if they disagree.

**Every node type exposes a computed `bounds: Vector3`.** Mesh nodes derive it from their `size` and `height`. Container nodes derive it from their declared `size`. The layout engine reads `bounds` for `slot-size="content"`.

---

## Containers

Named containers are authoring aliases for `<group layout="...">`. The layout engine is the same for all of them. Layout-specific props are valid on the `<group layout="...">` form as well as the named alias.

| Alias | `layout` value | Primary axis | `normal` direction |
|-------|---------------|-------------|-------------------|
| `<group>` | `grid` | XZ plane | left-to-right, then front-to-back |
| `<row>` | `row` | X | left → right |
| `<layer>` | `depth` | Z | front → back |
| `<stack>` | `stack` | Y | bottom → top |
| `<ring>` | `ring` | XZ circle | clockwise from front (+Z) |

### Group

- Auto-computes columns and rows from child count and container aspect ratio (X/Z).
- Fills the XZ footprint completely; row-major order (left-to-right, then front-to-back).
- `<group>` is equivalent to `<group layout="grid">`.

### Row

- Places children along X, left-to-right by default. No wrapping by default.
- `<row>` is equivalent to `<group layout="row">`.
- `<row wrap="grid">` produces the same result as `<group layout="grid">`. Both forms are valid; `<row>` lets authors discover wrapping incrementally without changing element types.

### Layer

- Places children along Z, front-to-back by default. No wrapping by default.
- `<layer>` is equivalent to `<group layout="depth">`.

### Stack

- Places children upward along Y.
- Slots are content-sized by default (each slot height = child `bounds.y`).
- `<stack>` is equivalent to `<group layout="stack">`.

### Ring

- Places children around an XZ circle.
- Radius is `min(size.x, size.z) / 2`.
- `<ring>` is equivalent to `<group layout="ring">`.
- Accepts `start-angle` (degrees, default `0` = front/+Z) in addition to shared props.

---

## Props

### `size` — *Space*

The container's available local space.

```vue
<group :size="{ x: 10, z: 6 }" height="4" />
<row :size="{ x: 8 }" />
```

Rules:
- A number means `{ x: n, z: n }` with `height` unchanged.
- An object accepts any of `x`, `y`, `z`; `y` sets `height`.
- Omitted axes keep current defaults.

### `height` — *Space*

Shorthand for the Y extent. Normalizes to `size.y` internally.

```vue
<stack height="3" />
```

### `direction` — *Placement*

Controls child order along the primary axis.

```vue
<row direction="reverse" />
<stack direction="reverse" />
<ring direction="reverse" start-angle="90" />
```

Values: `normal` (default) | `reverse`

"Normal" for each container is defined in the container table above. `ring` additionally accepts `start-angle` (in degrees).

### `gap` — *Slots*

Fixed spacing between adjacent slots in world units. Default: `0`.

```vue
<row :gap="0.5" />
<stack :gap="0.2" />
```

Rules:
- With `slot-size="equal"`: total gap (`gap × (n−1)`) is subtracted from available space before equal division.
- With `slot-size="content"`: gap is appended between each pair of children; total size may overflow (subject to `fit`).
- For `ring`: gap shrinks the effective radius; a development warning fires when the requested gap cannot fit.

`gap=0` with `slot-size="equal"` exactly reproduces current behavior — this is the baseline for migration.

### `slot-size` — *Slots*

Controls how each slot's size is computed.

```vue
<row slot-size="equal" />
<stack slot-size="content" />
<row :slot-size="{ x: 2, z: 1 }" />
```

Values:
- `equal` (default for `row`, `layer`, `group`): available space divided equally.
- `content` (default for `stack`, `ring`): sized from each child's `bounds`.
- Explicit vector: fixed slot size applied to all children.

When `slot-size="content"` and the child has no declared bounds, the full container size is used as a fallback.

### `align` — *Placement*

Controls child position inside its slot. Default: `center`.

```vue
<row align="center" />
<row align-x="start" align-y="center" align-z="center" />
<stack align-x="center" align-z="end" />
```

Values: `start` | `center` | `end`

Per-axis props (`align-x`, `align-y`, `align-z`) override the shorthand.

- `align-x`: left / right inside slot.
- `align-y`: bottom / top inside slot.
- `align-z`: back / front inside slot.

### `fit` — *Fit*

Controls behavior when a child's `bounds` exceed its slot.

```vue
<group fit="shrink" />
<group fit="none" />
<group fit="contain" />
<group fit="overflow" />
```

Values:
- `none` (default for mesh children): preserve child scale; no adjustment.
- `shrink` (default for container children): uniformly scale child down until it fits; never scales up.
- `contain`: uniformly scale child to fill the slot; may scale up or down.
- `overflow`: preserve child scale; mark the child as overflowing for inspection.

### `wrap` — *Slots*

Controls multi-line behavior for 1-D layouts.

```vue
<row wrap="none" />
<row wrap="grid" />
<layer wrap="grid" />
```

Values: `none` (default for `row`, `layer`) | `grid`

`group` wraps by definition. `stack` and `ring` do not support `wrap`.

When `wrap="grid"`, the primary axis fills first, then the container's secondary planar axis continues. Y is never used as a wrap axis.

### `origin` — *Placement*

Controls the container's local anchor. Default: `center`.

```vue
<group origin="center" />
```

Values:
- `center`: local origin is the centroid of the container's footprint.

`origin="start"` is reserved for a future revision. In 3D, "start corner" requires specifying all three axes, which needs a separate design pass. For now, all containers anchor at center.

---

## Elevation

Each child node may declare an `elevation` Y-delta. The layout engine applies `elevation` after computing the slot-centered position for **all** containers, including `row`, `layer`, and `ring`. This corrects the current inconsistency where elevation only applied inside `stack` and `grid`.

---

## API Examples

```vue
<!-- Horizontal row with gaps, children float to center vertically -->
<row :gap="0.5" align-y="center" fit="none">
  <box />
  <box />
  <box />
</row>

<!-- Auto-grid container; nested containers scale down to fit -->
<group :size="{ x: 8, z: 6 }" height="3" fit="shrink">
  <stack />
  <ring />
  <box />
</group>

<!-- Row that wraps into a grid; equivalent to <group wrap is implied> -->
<row wrap="grid" :gap="0.4">
  <box v-for="item in items" :key="item.id" />
</row>

<!-- Canonical layout form; ring props are valid here too -->
<group layout="ring" :size="{ x: 6, z: 6 }" direction="reverse" start-angle="45">
  <box v-for="item in items" :key="item.id" />
</group>
```

---

## Implementation Interface

Layout is a pure function with no scene side effects.

```ts
type Alignment = 'start' | 'center' | 'end'

type LayoutOptions = {
  slotSize: 'equal' | 'content' | Vector3
  gap: number
  align: { x: Alignment; y: Alignment; z: Alignment }
  fit: 'none' | 'shrink' | 'contain' | 'overflow'
  direction: 'normal' | 'reverse'
  wrap: 'none' | 'grid'
  origin: 'center'
  // ring-specific
  startAngle?: number
}

type LayoutChild = {
  bounds: Vector3     // child's declared extent
  elevation: number   // child's Y delta, applied after slot centering
}

type LayoutInput = {
  containerSize: Vector3
  children: LayoutChild[]
  options: LayoutOptions
}

type ChildPlacement = {
  position: Vector3   // local position in container space, including elevation
  slotSize: Vector3   // allocated space for this child
  scale: number       // layout-driven uniform scale; 1.0 means no change
  overflow: boolean   // true when child bounds exceed slotSize after scale
}

type LayoutResult = {
  slots: Vector3[]            // slot origin positions (before child centering)
  children: ChildPlacement[]
}

type LayoutFn = (input: LayoutInput) => LayoutResult
```

Layout scale must not be baked into mesh geometry. Apply it at the `THREE.Group` transform level so child geometry stays stable across parent changes and nested layout debugging remains tractable.

---

## Migration

1. Keep all current containers working without API breakage (no breaking changes in this phase).
2. Add `LayoutOptions` to `GroupNode` state; initialize each field to reproduce the current hardcoded behavior exactly (`gap: 0`, `slotSize: 'equal'`, `align: center/center/center`, `fit: 'shrink'`).
3. **Rewrite layout factories to accept `LayoutOptions`.** This is the heaviest step. The current `LayoutFactory` signature is `(containerPos, containerSize) => LayoutFn`; the new signature adds `options`. Every factory and every `GroupNode` subclass is touched here. Target: each factory produces identical output to today when called with default options.
4. Apply `elevation` uniformly in all factories (currently missing from `horizontalLayout`, `depthLayout`, `ringLayout`).
5. Add `bounds: Vector3` computed property to `Node`; implement in `MeshNode` (from `size`/`height`) and `GroupNode` (from `size`).
6. Update tests to cover `gap`, `align`, `fit`, `wrap`, and `direction` for each layout type, including the regression case: `gap=0` + `slot-size="equal"` must produce the same positions as today.
7. Add `layout` prop to `GroupNode`; make named containers (`Row`, `Stack`, `Ring`, `Layer`) delegate to the shared engine.
8. Deprecate any container-specific behavior superseded by shared props; remove in a later cleanup PR.

---

## Decisions

The following were open questions in earlier drafts.

**`size` describes content space, not outer bounds.**
Gap is subtracted from content space before slot computation. Matches CSS `content-box` intuition.

**Nodes expose a formal `bounds` property.**
`slot-size="content"` needs a stable reading point. Inferring from `size`/`height` inline works only for types the layout engine knows about; `bounds` keeps this open to new node types.

**`ring` supports `start-angle` and `direction` from day one.**
The first child's position and rotation direction are load-bearing authoring expectations. Deferring these would silently break visual layouts when they ship later.

**`fit="contain"` may scale up or down.**
`shrink` covers the common safe case (down-only). `contain` is an explicit opt-in for fill-to-slot behavior. Two names, clear intent.

**Overflow warnings are development-only.**
A visual debug overlay for layout boundaries is a separate proposal.

**`origin="start"` is deferred.**
In 3D, "start" is ambiguous (minimum X, Y, Z simultaneously, or just the layout axis?). Default `center` covers all current use cases. A precise definition can be added later without breaking changes.
# Content-Driven Layout Engine

> Supersedes the fixed-box premise of `2026-05-04-nodes-simplification-design.md`. That spec kept the
> grid-cleanup and uniform-lifecycle goals but assumed a container declares a fixed bounding box and
> *subdivides* it among children (top-down). This document reverses that one decision: footprints flow
> *up* from content. The lifecycle and class-structure goals of the earlier spec still hold.

## Problem

The current layout is **top-down / fixed-box**. Every container declares a fixed `size: Vector3` (a `Layer`
defaults to `10×5×10`) and divides it among children: `containerSize.x / count`. A child's only response to
its slot is `fitScale()`, which can *only shrink* (`Math.min(1.0, ...ratios)`) and never tightens spacing.

Consequences, visible in `concepts/screenshot1.jpg`:

- With a large box and few children, everything spreads to the corners of a `10×5×10` void — the scatter.
- A `<box size="1.5">` has no influence on where it lands; slot width is unrelated to box width.
- Nesting (layer → row → stack → layer → ring) compounds the mismatch.
- `stackLayout` has no floor reference (`baseY = containerPos.y`), and the `//todo` comments in `layouts.ts`
  show the `childHeight/2 + elevation` Y-offset was dropped from horizontal/depth/ring — stacks float.

No constant fixes this. The fixed box is the wrong primitive. The aspirational look (`concepts/stacked1.png`)
is a compact platform: children of intrinsic size sit on a surface with tight, uniform gaps, and the
container's footprint is *derived from its contents*.

---

## Goal

A predictable, content-driven layout engine where every node's footprint and the position of every child are
**pure functions** of `(child intrinsic sizes, gap)`. Declared sizes become an optional constraint, not the
driver. The result is deterministic, unit-testable, and produces the platform aesthetic by default.

---

## Design

### 1. The contract — two reactive passes

Add one reactive primitive to every node:

```ts
// footprint in the node's own local axes: x = width, y = height, z = depth
measuredSize: ComputedRef<Vector3>
```

- **Leaf (`MeshNode`)** derives `measuredSize` from geometry params (`size`, `height`).
- **Container (`GroupNode`)** derives it from its layout — `layout.measure(childSizes, gap)` — unless an
  explicit `size`/`height` override is set (see §3).

A layout stops being "divide a fixed box" and becomes a **measure/place pair**:

```ts
interface Layout {
    measure(children: Vector3[], gap: number): Vector3            // total footprint of children + gaps
    place(index: number, children: Vector3[], gap: number): Vector3 // local base-center position of child i
}
```

`measure` and `place` are duals: `place` walks the cumulative child sizes, `measure` returns the total extent.

**Pass 1 — measure (bottom-up):** `measuredSize` computeds form a pure derivation. A leaf bottoms out the
recursion; a container reads its children's `measuredSize`. No writes.

**Pass 2 — arrange (top-down):** `layoutPositionOf(child)` reads the sibling `measuredSize` computeds and calls
`layout.place(...)`. Position is still *pulled* lazily through the existing
`Element3d.getPosition() → parent.layoutPositionOf(node)` path, so the existing `syncWithThree` watchEffects
re-fire correctly when any descendant resizes or a sibling is added/removed. Because measure writes nothing
back to reactive state, there are no cycles and no `nextTick` workarounds.

### 2. Anchoring & gap conventions

**Every node is anchored at the center of its base** — XZ-centered, Y at the surface it rests on. A
container's local origin sits at its own base (local `y = 0`). This is the single convention that fixes
"stacks float / have no floor."

| Layout            | Children placed                                                              |
|-------------------|------------------------------------------------------------------------------|
| `horizontalLayout`| `y = 0`, spread along X by cumulative half-footprints + `gap`                |
| `depthLayout`     | `y = 0`, spread along Z by cumulative half-footprints + `gap`                |
| `stackLayout`     | `y = Σ heights[0..i-1]`, XZ-centered — grows straight up from the floor      |
| `ringLayout`      | `y = 0` on a circle whose radius is derived to fit child footprints + `gap`  |
| `gridLayout`      | `y = 0`, rows×cols packed by measured footprints + `gap` (count-driven)      |

Centered geometries render at `mesh.position.y = baseY + height/2`, honoring base-anchoring uniformly.

**`gap` replaces the role of `distance`.** One value sourced from `VxSettings` (default derived from today's
`boxDistance`), overridable per container via a `gap` prop. It is the only spacing knob that remains.

### 3. Override semantics — the optional declared size

If a container declares an explicit `size`/`height`:

- its reported footprint = the declared size (reserves that region);
- if measured children **exceed** it → scale the group down via the existing `fitScale` (min ratio ≤ 1);
- otherwise children arrange inside, base/center anchored.

`allocatedSizeOf` / `slotSizeOf` (the fixed-box subdivision machinery) are **deleted** — they have no role in
a content-driven engine.

### 4. Footprint of each shape

**Box-equivalent footprint for all leaves.** A `Box`, `Cylinder`, and `Wedge` of declared `size` all occupy a
`size × height × size` footprint. Circular/triangular geometry sits inside that square footprint. This keeps
grid/row/stack alignment uniform and predictable; the visual mesh is unchanged, only its declared occupancy is
squared.

### 5. Files & blast radius

| File                  | Change                                                                                  |
|-----------------------|-----------------------------------------------------------------------------------------|
| `layouts.ts`          | Rewrite the five factories as measure/place pairs (the heart of the change).            |
| `GroupNode.ts`        | Add `measuredSize`; route `layoutPositionOf` through `place()`; simplify override/`fitScale`; drop subdivision. |
| `MeshNode.ts`         | `measuredSize` from geometry; base-anchored mesh Y.                                      |
| `Node.ts`             | Declare `measuredSize`; base-anchor helper; keep `getElevation`.                         |
| `Box/Cylinder/Wedge`  | Report box-equivalent geometry footprint.                                                |
| `Row/Stack/Ring/Layer.ts` | Drop `defaultSize` magic numbers; keep only true semantics (Layer = floor + elevation + scale). |
| `VxSettings`          | Add `gap`.                                                                               |

`three/` is untouched. The uniform-lifecycle / `syncWithThree` plumbing from the prior spec is preserved.

### 6. Predictability & verification

Once footprints and positions are pure functions of `(childSizes, gap)`, they are deterministic and
unit-testable. This is the point of the change.

- **Unit assertions replace magic numbers.** `verify-geometry` / `verify-nodes` gain real assertions, e.g.
  "a stack of three unit boxes measures `1×3×1`"; "a row of three with `gap = 0.5` places centers at
  `−2.5 / 0 / +2.5`"; "an empty container measures `0×0×0`". These become the regression guard.
- **Visual loop for final polish.** Playwright screenshots of TabB/TabC from a fixed camera, checked against
  the `stacked1.png` aesthetic and structural invariants: no overlap, stacks rest on the floor, uniform gaps,
  pods centered under their deployment.

---

## What does not change

- `three/stage.ts`, `three/scene.ts`, `three/element3d.ts` — the `getPosition → layoutPositionOf` pull stays.
- `MeshNode` hover / GSAP animation, material sync.
- Connector renderers and strategies.
- `patchProp.ts`, `nodeOps.ts`, `renderer.ts`.
- Template authoring: `<layer>`, `<row>`, `<stack>`, `<ring>`, `<box>`, etc. continue to work; authors simply
  stop computing container sizes.

---

## Open questions

None outstanding. Sizing model (content-driven, declared size = optional override), container visibility
(invisible arrangement groups), and shape footprint (box-equivalent) are decided.
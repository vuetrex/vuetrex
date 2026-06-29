# Node Tree Simplification

## Problem

The node tree has accumulated three entangled complexity sources:

1. **Grid baked into `Base`** — `numRows`, `numColumns`, `renderSize` derive a two-level rows×columns grid from
   parent/grandparent sibling counts. Every node carries these computeds even when they are irrelevant.
   `Row.layoutPositionOf` and `Node.layoutPositionOf` are identical because both implement this same implicit grid.

2. **`nextTick` scatter** — `subscribeEvents()` defers to `nextTick` because the geometry watchEffect (which creates the
   mesh) hasn't fired yet when `applySync` calls it. `Root.afterFlush` adds a second `nextTick` for
   `reconcileConnections()`. Both are timing workarounds, not design.

3. **`syncWithThree()` has different contracts per class** — `MeshNode` and `ConnectorNode` install idempotent
   watchEffects; `GroupNode` runs imperatively on every call with no guard; `Layer` mixes group positioning and mesh
   rendering in one watchEffect while also partially behaving like a `MeshNode`.

The result: adding any new container or shape requires understanding all three systems at once.

---

## Goal

A self-similar tree where every node follows the same lifecycle contract, layout is a pure function owned by the
container, and no node needs to read beyond its own children to position them.

---

## Design

### 1. Remove the implicit grid from `Base`

Delete from `Base`: `numRows`, `numColumns`, `renderSize`.

Keep: `myIdx` (index within parent's renderable children), `elements` (renderable children computed), `parent`,
`children`, `nextSibling`, `registerSync`, `applySync`.

Remove `subscribeEvents()` from `applySync` — event wiring becomes the geometry watchEffect's responsibility (see
Section 3).

### 2. Bounded space — layout as a factory

Every `GroupNode` declares its own bounding box via state props `size: Vector3` and `height: number`. The scene root
allocates an initial space (e.g. center `(0,0,0)`, extents `(10,5,10)`). Each container's layout divides that space
among its children.

A layout is a **factory** — it takes the container's allocated space and returns a per-child positioning function:

```ts
type LayoutFn = (child: Node, siblings: Node[], stage: VuetrexStage) => Vector3
type LayoutFactory = (containerPos: Vector3, containerSize: Vector3) => LayoutFn
```

`GroupNode` accepts a `LayoutFactory` in its constructor. `layoutPositionOf(child)` calls the current `LayoutFn`, which
was created from the factory when the group's own `pos`/`size` settled in `syncWithThree`. No reading of parent,
grandparent, `numRows`, or `numColumns`.

A new file `nodes/layouts.ts` exports the built-in factories:

| Factory            | Distributes children along | Space consumed                                                         |
|--------------------|----------------------------|------------------------------------------------------------------------|
| `horizontalLayout` | X                          | `size.x` divided by sibling count                                      |
| `depthLayout`      | Z                          | `size.z` divided by sibling count                                      |
| `stackLayout`      | Y                          | cumulative child heights within `size.y`                               |
| `ringLayout`       | XZ circle                  | `min(size.x, size.z) / 2` as radius                                    |
| `gridLayout`       | X and Z grid               | `size.x × size.z`, rows×cols auto-computed from count and aspect ratio |

`gridLayout` requires no `columns` parameter — it fits all children into the container's XZ footprint. Because the
container already knows its total allocated size, no grandparent reads are needed.

If a `GroupNode` child is smaller than its allocated slot it sits centered. If a `GroupNode` child is larger, the parent
scales the child's `THREE.Group` proportionally so the whole subtree shrinks uniformly.

### 3. Uniform lifecycle

Every node that touches Three.js follows the same contract:

- **`syncWithThree()`** — idempotent, guarded by a `stopHandle`. Installs watchEffects. Never runs its body twice.
- **`onRemoved()`** — stops all handles, removes mesh or group from scene.
- **No `subscribeEvents()` in `applySync`** — event wiring happens inside the geometry watchEffect, after `renderMesh`
  returns and the mesh is guaranteed to exist. No `nextTick`.

`MeshNode.syncWithThree()` structure:

```
watchEffect (geometry, flush: flushMode):
    read layoutContext (myIdx, size, height)
    clearMesh()
    renderMesh() → mesh now exists
    subscribeEvents()        ← here, mesh is live, no nextTick needed

watchEffect (material):
    apply material props to this.material
    update baseProps snapshot

watchEffect (connection + text, flush: 'post'):
    stage.connect(from, to)
    stage.reconcileConnections()   ← here, not in Root.afterFlush
```

`GroupNode.syncWithThree()` becomes an idempotent watchEffect that re-runs when the group's position or parent changes.
`Root.afterFlush` and its `nextTick(() => reconcileConnections())` are removed.

`Layer` loses its `modelGen` / `renderMesh` calls. A visible floor plane is expressed as `<box v-if="visible" />` in the
Vue template — the renderer handles tree changes; no hybrid MeshNode/GroupNode behavior inside the class.

### 4. Resulting class structure

```
Base              tree ops, registerSync/applySync, myIdx, elements
  Node            stage, element, events, layoutPositionOf stub
    Root          destroy(); no afterFlush nextTick
    ConnectorNode watchEffect → stage.connect / stage.disconnect
    GroupNode     state{ size, height }, layoutFactory, group, syncWithThree watchEffect
      Row         GroupNode(stage, horizontalLayout)
      Stack       GroupNode(stage, stackLayout)
      Ring        GroupNode(stage, ringLayout)
      Layer       GroupNode(stage, depthLayout) + scale/elevation state
    MeshNode      modelGen(), three watchEffects, hover, material
      Box         unchanged
      Cylinder    unchanged
      Wedge       unchanged
```

`nodes/layouts.ts` is the only new file. Nothing in `three/` changes.

### 5. Template authoring — unchanged

`TabB.vue` and all existing templates continue to use `<layer>`, `<row>`, `<stack>`, `<box>`, etc. The element type
registry (`nodes/types.ts`) maps these names to the appropriate constructors. Authors of new reusable components express
them as Vue components containing `<vx-group>` or the named aliases — from the parent scene's perspective they are just
a node with a declared `size` and `height`.

---

## What does not change

- `three/stage.ts`, `three/scene.ts`, `three/element3d.ts` — untouched
- `MeshNode` hover / GSAP animation — untouched
- Connector renderers and strategies — untouched
- `patchProp.ts`, `nodeOps.ts`, `renderer.ts` — untouched
- Shape classes `Box`, `Cylinder`, `Wedge` — untouched

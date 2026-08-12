# Vuetrex Architecture

Vuetrex replaces Vue's DOM renderer with a Three.js scene. Vue templates author 3D diagrams; the custom renderer drives
Three.js instead of the browser DOM.

---

## Rendering pipeline

```
Vue template
    │ Vue Custom Renderer (nodeOps.ts, patchProp.ts)
    ▼
Base / Node tree          ← logical, reactive (Vue refs/computed)
    │ syncWithThree() + watchEffect
    ▼
Three.js scene            ← visual, imperative
    │ gsap ticker (25 fps)
    ▼
WebGL canvas
```

---

## Key abstractions

### `Base` (`nodes/Base.ts`)

Tree node skeleton. Owns parent/children refs, `appendChild`/`removeChild`/`insertBefore`, and the deferred sync queue
(`registerSync` → `applySync`). No Three.js knowledge. `Comment` and `TextNode` extend this directly.

### `Node` (`nodes/Node.ts`)

Extends `Base`. Everything that can exist in the 3D scene. Holds:

- `element: Element3d` — the bridge to Three.js
- `stage: VuetrexStage` — scene-level services
- click / dblclick bubbling and pointer enter/leave dispatch
- **`layoutPositionOf(child): Vector3`** — returns local coordinates for children
- **`allocatedSizeOf(child): Vector3`** — reports the slot reserved for a child container
- **`nearestAncestorObject()`** — finds the closest `THREE.Group` in the parent chain

### `GroupNode` (`nodes/GroupNode.ts`)

Extends `Node`. Establishes local coordinate spaces in the Three.js scene graph. Owns a `THREE.Group` where its children
are parented, plus a declarative layout contract: `state.size: Vector3`, `state.height: number`, and a `LayoutFactory`
from `nodes/layouts.ts`. Containers (`Row`, `Ring`, `Stack`, `Layer`) extend this.

### `MeshNode` (`nodes/MeshNode.ts`)

Extends `Node`. Base for all geometry nodes. Provides reactive `state` (`text`, `size`, `height`, `connection`,
`material`, `hover`), shared idempotent `syncWithThree()` lifecycle (geometry/material/connection watchEffects →
`stage.renderMesh()` / `stage.connect()` / `stage.reconcileConnections()`), and `onRemoved()` cleanup. Event wiring
happens inside the geometry watchEffect after the mesh exists. **To add a new shape: extend `MeshNode`, implement
`modelGen()`.**

### `ConnectorNode` (`nodes/ConnectorNode.ts`)

Extends `Node`. Declarative connector record independent of any shape node. Reactive `from`, `to`, `layout`, and `type`
props update one stable keyed registration through `stage.connect()`. Connector nodes synchronize with the renderer but
return `participatesInLayout() === false`, so declarations do not change measurement or placement. Unmounting
unregisters only that declaration, and parallel edges remain independent. This complements `MeshNode.state.connection`,
which is still the shorthand for "connect this node to target id".

### Material & Interaction (`nodes/material.ts`)

- **`VxMaterialProps`:** reactive material state (color, opacity, roughness, metalness, emissive, etc.)
- **`VxHoverProps`:** hover overrides (`VxMaterialProps` + `scale`, `transition`)
- **`MeshNode` hover:** manages snapshots of base material, applies overrides on `onMouseOver` using `gsap` for smooth
  transitions, and restores from snapshot on `onMouseOut`.

### Concrete nodes

| Class           | Role                                  | Key override                         |
|-----------------|---------------------------------------|--------------------------------------|
| `Box`           | Rounded-box geometry                  | `modelGen()`                         |
| `Cylinder`      | Beveled cylinder                      | `modelGen()`, `flushMode = 'sync'`   |
| `Wedge`         | Beveled ring segment                  | `modelGen()`, `flushMode = 'sync'`   |
| `Layer`         | Depth layout container / world anchor | `isLayer()`, `getIntrinsicScale()`   |
| `GroupNode`     | Base for local coordinate spaces      | `LayoutFactory`, `allocatedSizeOf()` |
| `Row`           | Horizontal layout container           | `horizontalLayout`                   |
| `Stack`         | Vertical stacking container           | `stackLayout`                        |
| `Ring`          | Circular layout container             | `ringLayout`                         |
| `Panel`         | Visual top-surface container          | Split label/content regions          |
| `ConnectorNode` | Declarative link between nodes        | `syncWithThree()`                    |
| `Root`          | Tree root, owns destroy               | —                                    |

### `Element3d` (`three/element3d.ts`)

Thin bridge: holds `mesh: THREE.Object3D` and `pos: Vector3`. `getPosition()` delegates to
`node.parent.layoutPositionOf(node)` — no layout logic lives here.

### `VuetrexStage` (`three/stage.ts`)

Scene infrastructure. Manages floor, mirror, lights, caption texture, connectors, `renderMesh()`, `removeObject()`,
camera, raycasting. Exposes `boxRadius` / `boxDistance` (configurable via `VxSettings`).

`renderMesh()` can parent meshes either under the scene root or under a container's `THREE.Group`. Connection
declarations are registered first, then `reconcileConnections()` resolves them against live `Element3d` instances after
sync.

- **Connector renderers:** `particles` and `line`
- **Connector strategies:** `orthogonal` and `direct` (`straight` remains a compatibility alias for `direct`)

Connector segments carry the world scale of the closest Three.js parent shared by both endpoints. Particle spread, size,
and velocity and the line renderer's world-space thickness follow that enclosing scale. Routes are rebuilt when either
endpoint or an enclosing `GroupNode` changes, allowing diagrams to be scaled down while a closer camera preserves their
apparent connector proportions. A route also carries a shared world-space elevation derived from its endpoints, keeping
every orthogonal segment above platform/base meshes instead of hiding bends at a fixed floor height. Segments retain
explicit X/Z start and end coordinates: the orthogonal strategy emits a contiguous, axis-aligned zigzag, while the
direct strategy emits one true endpoint-to-endpoint span. Sampling is coordinate-independent, so line geometry and
particle velocity use the same complete route.

- **`VxAnimProps`:** target transform values for `animateTo()` (positionY, scale, etc.)
- **`VxAnimOptions`:** animation timing and easing (duration, ease, delay, onComplete)
- **`animateTo(id, props, opts)`:** programmatically animates a node's transform, isolating callers from Three.js
  internals.

---

## Layout system

Each container node (extending `GroupNode`) owns the position calculation for its children via a `LayoutFactory`
from [layouts.ts](air-file://kicm6ubdhg7b09hlspf9/Users/alex.pakka/dev/github/vuetrex/src/lib-components/nodes/layouts.ts?type=file&root=%252F).
The factory is created from the container's declared `size` / `height`, then `layoutPositionOf(child: Node): Vector3`
returns coordinates in the container's **local space**.

- **`GroupNode` (default):** `gridLayout`
- **`Row`:** `horizontalLayout`
- **`Layer`:** `depthLayout`
- **`Ring`:** `ringLayout`
- **`Stack`:** `stackLayout`
- **`Panel`:** configurable child layout fitted into a north/south top-surface content region

Children meshes are automatically parented to the nearest ancestor's `THREE.Group` via `nearestAncestorObject()`. This
enables recursive nesting of containers.

`Panel` owns a rounded backing mesh and a separate child `THREE.Group`. `label-share` divides its top face along Z:
the label occupies the named `label-region`, while children are uniformly shrink-fitted into the complementary region.
The panel remains one measured, named connector endpoint; its label does not participate in child layout.

Adding a new layout: add a factory in `nodes/layouts.ts`, then subclass `GroupNode` with that factory.

### Measure and place

Layout is content-driven and runs bottom-up:

- `Node.measuredSize` is a reactive `Vector3` derived from `intrinsicSize()`.
- Mesh nodes report their declared `size × height × size` footprint.
- `GroupNode.contentSize()` asks its pure `Layout` object to measure all child footprints.
- `layoutPositionOf()` asks the same layout to place a child in the container's local space.
- `Node.renderOffset()` converts the base-center layout anchor into the mesh's visual center; mesh nodes add half their
  height on Y.
- An explicit container `size` or `height` is a maximum reservation. `GroupNode.fitScale()` applies a uniform,
  shrink-only scale when measured content exceeds that reservation.

The effective gap follows `container state.gap → stage.gap → stage.boxDistance`. `Stack` overrides the stage fallback
with its tighter `0.05` default while still accepting an explicit `gap`.

---

## Reactive sync

Structural changes (append/remove/insert) call `registerSync()` which batches via `queuePostFlushCb`. After Vue's render
flush, `applySync()` calls `syncWithThree()` on each child. Every Three-aware node uses an idempotent `syncWithThree()`
that installs its own watchEffects exactly once; `onRemoved()` stops those handles and detaches scene objects.
Connection reconciliation now runs from the node watchEffects themselves, so there is no `Root.afterFlush()` /
`nextTick()` stage pass.

---

## Events

### click:

1. DOM mousedown → `scene.ts:bindEvents` → `stage.ts:onCanvasClick` → `el3d.mesh.dispatchEvent({type:'click'})` →
   Three.js event on mesh
2. `MeshNode.syncWithThree()` renders the mesh, then `Node.subscribeEvents()` binds clickListener on the live mesh →
   calls `dispatchClick()` → `nodeEvents.onClick(e)`
3. `patchProp.ts` sets `el.onClick = handler` via the set onClick () setter on Node

### dblclick is like click

DOM event → raycast → Three.js mesh event → node dispatch → bubbles up the tree

### pointerenter/pointerleave

Driven by the existing per-frame hover tracker in mouseAnimationFn (maintains selectedObject). They call new
onMouseOver/onMouseOut hooks that stage.ts overrides, keeping scene.ts generic. These don't bubble, matching DOM
semantics

---

## Adding a new node type

1. Create `nodes/shapes/MyShape.ts`, `extends MeshNode`
2. Implement `modelGen()` returning a `(height, size) => THREE.Object3D` factory
3. Override `protected readonly flushMode` if sync timing matters
4. Register in `nodes/types.ts`: `'vx-myshape': MyShape`

For a new container layout: `extends GroupNode`, override `layoutPositionOf(child)`. For a new container layout:
`extends GroupNode` with a new `LayoutFactory`.

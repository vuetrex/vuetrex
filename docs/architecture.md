---
title: Architecture
description: How Vue's custom renderer, the logical node tree, and Three.js stay synchronized.
outline: deep
---

# Architecture

This page is for contributors and authors of low-level extensions. Application developers should begin with the
[guide](/guide/).

## The problem: Vue and Three.js own different kinds of state

Vue is good at reconciling declarative trees. Three.js is an imperative scene graph with mutable objects and GPU
resources. Mirroring every Three.js object inside application code would create two lifecycles and two sources of
truth.

Vuetrex inserts a logical node tree between them. Vue owns component identity and reactivity; logical nodes own scene
semantics and layout; Three.js owns rendering resources.

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

For data-driven scenes, an optional planning pass sits before the template:

```
event data → RepresentationRecipe → SceneFragment + Placement[] → Vue template → Vuetrex renderer
```

The recipe describes selection, aggregation, spatial arrangement, and emitted semantic records. Vue components still
own representation details, and the custom renderer still exclusively owns Three.js objects.

Procedural geometry adds a separate authored-geometry pass without adding operator objects to the logical scene tree:

```
Vue refs → computed GeometrySource → immutable geometry DAG → GeometrySet records
                                                     → Mesh / Line / InstancedMesh batches
                                                     → one logical GeometryNode
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

Each node also has an immutable renderer `key`, a semantic `id`, and a human-facing `name`. The stage registry resolves
IDs without searching Three.js object names and rejects duplicate IDs or non-empty names in development. Common node
behavior keeps visibility, interaction disabling, and layout participation independent.

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

### `InstanceNode` (`nodes/InstanceNode.ts`)

Extends `Node` and realizes a keyed semantic collection as one `THREE.InstancedMesh`. It keeps stable GPU slots for
item IDs, applies one transform and color encoding per item, reports the encoded batch bounds to parent layouts, and
maps raycast `instanceId` values back to `VxMouseEvent.vxInstance`. It is intentionally one logical node: the first
draft has one shared geometry/material and one whole-batch connector endpoint.

### Procedural geometry (`geometry/`)

The procedural package separates three representations:

- immutable authored nodes from `geo.*`, which contain named inputs and parameters but no Three.js resources;
- evaluated `GeometrySet` records, which carry a shared prototype, matrix, color, visibility, stable key, and field
  context;
- realized objects owned by `GeometryNode`, which groups compatible records into `InstancedMesh` batches and renders
  zero-thickness lines separately.

`defineGeometry()` packages a parametrized subgraph without changing its output type. A module call remains a
`GeometrySource`, so modules can call modules, shared sources can form a DAG, and bounded construction-time recursion
can express self-similar models. Graph operators are not `Base`/`Node` subclasses and do not register with the stage.
Only `<vx-geometry>` is a renderer element and semantic scene node.

The `GeometryNode` compiler effect reads the shallow graph prop, evaluates it deterministically, reconciles keyed
instance records, and reports compiled bounds. Separate effects apply material and layout/identity state so geometry
evaluation does not mutate a reactive dependency it consumes. Prototype topology is cached by signature for the node's
lifetime and disposed when no longer referenced or when the node unmounts.

### Composition recipes (`composition/index.ts`)

`RepresentationRecipe` is a pure data-to-plan contract with four phases: `select`, `aggregate`, `arrange`, and `emit`.
`arrange` returns `Placement` values (position, orientation, scale, visibility), while `emit` produces a `SceneFragment`
of semantic nodes, connections, and labels. Operators cover collection transforms (`filter`, `groupBy`, `aggregate`),
spatial patterns (`row`, `stack`, `ring`, `sphere`, `timeline`, `radialFocus`), and emission (`encode`, `connect`,
`bundleBy`, `label`).
Focus and animation are capabilities because they change interaction policy rather than data shape.

Passing a `Placement` to a `GroupNode` opts that subtree out of its parent's automatic layout and applies the placement
to the group's local transform. This lets a recipe position an arbitrarily detailed Vue subtree without knowing how
that subtree is rendered.

### Connector records (`nodes/ConnectorNode.ts`, `nodes/BusConnectorNode.ts`)

`ConnectorNode` is a declarative point-to-point record. Reactive endpoints, ports, strategy, elevation, lane, and
clearance update one stable keyed registration through `stage.connect()`. `BusConnectorNode` owns one source and a
reactive target collection through `stage.connectBus()`, producing one trunk and terminal branches. Both synchronize
with the renderer but return `participatesInLayout() === false`. Unmounting unregisters only that declaration, and
parallel edges remain independent. `MeshNode.state.connection` remains the shorthand for a default route to one ID.

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
| `DisplayWall`   | Canvas/SVG-backed display surface      | Flat or curved wall geometry          |
| `ConnectorNode` | Declarative link between nodes        | `syncWithThree()`                    |
| `BusConnectorNode` | Shared one-to-many route          | `syncWithThree()`                    |
| `InstanceNode`  | Keyed GPU-instanced semantic repeater | `InstanceEncoding`, `instanceHitAt()`|
| `GeometryNode`  | Procedural graph output and batching  | Reactive compiler, generated bounds  |
| `Root`          | Tree root, owns destroy               | —                                    |

### `Element3d` (`three/element3d.ts`)

Thin bridge: holds `mesh: THREE.Object3D` and `pos: Vector3`. `getPosition()` delegates to
`node.parent.layoutPositionOf(node)` — no layout logic lives here.

### `VuetrexStage` (`three/stage.ts`)

Scene infrastructure. Manages floor, optional flat/curved textured background wall, mirror, lights, caption texture,
connectors, `renderMesh()`, `removeObject()`, camera, and raycasting. Exposes `boxRadius` / `boxDistance` (configurable
via `VxSettings`).

Camera framing is bounds-driven. `fitToContent({ padding, duration })` measures authored Three.js roots in world space,
fits all eight corners against the perspective camera's horizontal and vertical field of view, and keeps the selected
options for later refits. Geometry, group placement, instance, panel, structural removal, and viewport changes coalesce
into one refit per animation frame. Named focus uses the same calculation on the target object's world bounds, so nested
placement groups and scaled descendants are handled correctly.

`renderMesh()` can parent meshes either under the scene root or under a container's `THREE.Group`. Connection
declarations are registered first, then `reconcileConnections()` resolves them against live `Element3d` instances after
sync.

- **Connector renderers:** `particles` and `line`
- **Connector strategies:** `orthogonal`, `direct`, `bezier`, and `spline` (`straight` aliases `direct`)

Ports resolve against `Box3.setFromObject()` world bounds, either from named faces or normalized `{x,y,z}` coordinates.
Connector segments carry full XYZ endpoints and the world scale of the closest Three.js parent shared by both endpoints.
Particle spread, size, velocity, and the line renderer's world-space thickness follow that enclosing scale. Routes rebuild when either
endpoint or an enclosing `GroupNode` changes, allowing diagrams to be scaled down while a closer camera preserves their
apparent connector proportions. Orthogonal routes use endpoint leads and axis-aligned bends; direct routes use edge-to-edge
spans; Bezier and spline strategies sample smooth curves into the same segment representation. Elevation raises route
crests, lanes offset parallel paths, and `avoid` currently supplies endpoint clearance. Sampling is coordinate-independent,
so line geometry and particle velocity use the same complete 3D route. Bus records add one shared trunk plus branches
without duplicating the trunk for every target.

Terminal `line` segments include a scale-aware cone marker pointing into their resolved target port. Bus branches each
receive a terminal marker; the shared source lead and trunk do not.

- **`VxAnimProps`:** target transform values for `animateTo()` (positionY, scale, etc.)
- **`VxAnimOptions`:** animation timing and easing (duration, ease, delay, onComplete)
- **`animateTo(id, props, opts)`:** programmatically animates a node's transform, isolating callers from Three.js
  internals.

---

## Layout system

Each container node (extending `GroupNode`) owns the position calculation for its children through the pure layouts in
`src/lib-components/nodes/layouts.ts`.
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

`DisplayWall` owns its closed frame geometry and canvas texture. Structural props rebuild the flat or curved wall;
surface changes repaint existing textures. Inline SVG is rasterized into the same canvas path, so Canvas 2D, SVG, and
existing canvas/image sources share one scene-node contract.

Adding a new layout: add a factory in `nodes/layouts.ts`, then subclass `GroupNode` with that factory.

### Measure and place

Layout is content-driven and runs bottom-up:

- `Node.measuredSize` is a reactive `Vector3` derived from `intrinsicSize()`.
- `<vx-spacer>` contributes an explicit measured footprint but no renderable geometry.
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

Layout-affecting Three.js sync paths also call `stage.invalidateContentBounds()`. The stage coalesces those notifications
and only then measures world bounds, after the current Vue/Three synchronization work has settled.

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

For `vx-instances`, moving between members of the same `InstancedMesh` also produces leave/enter transitions because
the hover tracker compares both the selected object and Three.js `instanceId`. Click, double-click, enter, and leave
events carry `{ id, item, instanceIndex }` in `event.vxInstance`.

---

## Adding a new node type

1. Create `nodes/shapes/MyShape.ts`, `extends MeshNode`
2. Implement `modelGen()` returning a `(height, size) => THREE.Object3D` factory
3. Override `protected readonly flushMode` if sync timing matters
4. Register in `nodes/types.ts`: `'vx-myshape': MyShape`

For a new container layout, extend `GroupNode` with a new `Layout` implementation and add focused measurement and
nesting tests.

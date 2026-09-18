---
title: Fluent Connector Graph
description: Proposal for composable connector authoring, incremental route realization, and host-only lifecycle ownership.
outline: deep
---

# Fluent Connector Graph

**Status:** Implemented, with the route-network refinements below as the normative public contract.

**Goal:** Give connectors the same immutable, fluent, data-driven authoring model as procedural geometry and particles,
while keeping route declarations out of layout, scene identity, focus, event bubbling, and the Three.js object tree.
Connector topology, routing, appearance, markers, and flow should compose independently and reconcile by stable key.

**Core architectural choice:** Connector operators are immutable data values, not Vue renderer elements. One optional
`<vx-connectors>` host owns a complete connector graph and its lifecycle. That host extends `Base`, not `Node`: it is
present in Vue's raw host tree only because Vue requires parent/sibling identity and an unmount target, but it is absent
from `elements`, stage node registration, layout measurement, camera bounds, focus, scene events, and the Three.js scene
graph.

**Tech stack:** TypeScript, Vue 3 `computed`/`watchEffect`, the Vuetrex custom renderer, immutable graph combinators,
Three.js, the existing geometry prototype pool and particle compiler/backend boundary, and Vitest.

---

## Current-state audit

### Are connector tags unwanted children today?

They are not layout children, but they are more scene-like than they need to be.

`ConnectorNode` and `BusConnectorNode` currently:

- extend `Node`;
- return `true` from `isRenderableNode()`;
- return `false` from `participatesInLayout()`;
- have an `Element3d` whose `mesh` remains null;
- enter `Base.childList` so Vue can place, move, and remove them;
- are filtered out of `parent.elements`, so they do not reserve layout space or affect `myIdx` for visual siblings;
- are nevertheless registered in `VuetrexStage.nodesById` / `nodesByName` as if they were spatial scene nodes;
- inherit ID, name, visibility, disabled state, pointer-event, focus, and bubbling concepts that do not describe a route
  declaration;
- receive generic endpoint-removal cleanup after their own registration cleanup, even though they cannot be an endpoint.

The raw host-tree entry is not itself a bug. A custom renderer needs a stable host object for Vue's keyed reconciliation,
`parentNode`, `nextSibling`, and unmount lifecycle. The unwanted part is treating that host object as a `Node`.

The target distinction is:

| Layer | Connector graph owner belongs here? | Reason |
|---|---:|---|
| Vue custom-renderer host tree (`Base.childList`) | Yes, one host per graph | Vue lifecycle and keyed ownership |
| Layout children (`elements`) | No | Routes reserve no spatial slot |
| Semantic scene nodes (`Node`, stage ID registry) | No | A declaration is not a focusable endpoint |
| Three.js authored scene graph | No | Rendered paths are stage-owned derived output |
| Connector controller registry | Yes | Stable ownership, reconciliation, and disposal |

### Fragmented authoring paths

The current feature has four partly overlapping entry points:

1. `<vx-connector>` owns one reactive point-to-point registration.
2. `<vx-bus-connector>` owns one reactive one-to-many registration.
3. `MeshNode.state.connection` owns a shorthand registration from one mesh.
4. `VuetrexStage.connect()` / `connectBus()` provide internal imperative registration.

Composition recipes add a fifth description shape, `SceneConnection`, which must currently be expanded into one
`<vx-connector v-for>` child per record. These paths do not share one public source type or one compilation step.

### Fixed routing and appearance

- `layout` and `type` are open strings even though only a small built-in set is registered.
- Routing and rendering are coupled through mutable `Segment.type` values.
- `LineRenderer` uses one stage-wide material, fixed width, fixed arrow geometry, and rebuilds all line geometry when
  any line signature changes.
- The connector particle renderer is the pre-fluent `VuetrexParticles` implementation. It cannot reuse particle
  modules, fields, named operators, simulations, or registered particle backends.
- Particle volume, color, blending, spread, size, lifetime, and speed are stage-wide rather than per route.
- Markers are hard-coded terminal cones and cannot be replaced with authored geometry.
- Bus routing is a separate record family and special function rather than a topology operator.
- `avoid` means endpoint clearance only. It does not avoid unrelated scene geometry, so its name over-promises.
- Port resolution supports bounds faces and normalized coordinates but not node-defined named ports, free anchors, or
  record-level fields.

### Coarse reconciliation

`reconcileConnections()` walks every registration and rebuilds every resolved route. Node synchronization calls it
from several places. `LineRenderer` then hashes the complete line set and reconstructs every shaft and arrow if any
signature changes. Stable registration IDs prevent stale routes, but they do not yet provide record-level incremental
realization.

---

## Design principles

1. **The connector graph is semantic topology, not the scene tree.** It describes which things are related, directed,
   weighted, or grouped. It remains useful when nothing is rendered and never turns each relationship into a `Base`
   or `Node` instance.
2. **One host owns many routes and their resources.** A graph with 10,000 edges should not require 10,000 renderer
   children. One lifecycle owner reconciles keyed records, registers them with the stage, and disposes its resources.
3. **The host is a lifecycle anchor, not a spatial node.** `<vx-connectors>` gives Vue somewhere to mount, update,
   move, and unmount a connector graph. It has no bounds, transform, focus, layout role, or Three.js object of its own.
4. **Every authoring stage remains composable.** Sources and operators consume and return `ConnectorSource`.
5. **Topology, routing, and decoration are separate.** An edge or bus can change appearance without recomputing its
   path, and a route can change without recreating unrelated GPU resources.
6. **Identity comes from data.** Record keys, not array positions or generated component instances, own cache entries,
   hits, diagnostics, and lifecycle.
7. **Reactivity stays in Vue.** Applications construct graphs in `computed()`. The connector package does not add a
   second reactive system.
8. **Resolved route networks are a reusable boundary.** Line, geometry, particle, diagnostic, export, and future label
   backends consume the same immutable keyed runs, junctions, and terminal traversals.
9. **Reuse fluent geometry and particles.** Connector-specific code resolves relationships and paths; it should not
   maintain parallel geometry or particle authoring frameworks.
10. **Unresolved endpoints are valid state.** Declarations survive endpoint timing changes and become active when both
    sides resolve.
11. **Extensions are explicit and disposable.** Custom route strategies and appearance backends register through
    typed APIs that return unregister functions.
12. **Legacy syntax lowers into the new model.** Existing tags remain compatible while the graph API becomes the
    preferred surface.

### Three structures, each with one job

The fluent API should not collapse the relationship model, the spatial route, and the rendered object into one
mutable connector class.

| Structure | Answers | Stable identity | Consumers |
|---|---|---|---|
| Semantic graph | What is connected? Is it directed? What are its weight, capacity, kind, and metadata? | Node and edge keys | graph algorithms, filtering, selection, serialization, application state |
| Resolved route plan | Where should it travel? Which runs are shared? Where are its branches and anchors? | Edge key plus route revision | routing, bundling, labels, particles, picking |
| Rendered presentation | How does it look and animate now? | Backend allocation keyed by edge or bundle | strokes, custom geometry, markers, particles, hit testing |

The same semantic edge may be rendered as a low ground route, promoted to an air route, hidden inside a bundle, or
temporarily highlighted without changing its graph identity. Changing its endpoints is a topology change even if the
resulting curve happens to look identical.

This also separates two meanings of "shortest route":

- A **shortest graph path** walks semantic edges from one logical node to another using application-defined weights.
- A **shortest spatial route** finds a drawable path between two resolved endpoint positions while respecting routing
  surfaces, obstacles, clearances, and bend costs.

Those operations may inform each other, but neither should silently redefine the other.

### Normative implementation refinements

- Resolution returns a route network. Every run and junction has a stable key and semantic member keys; every terminal
  owns an ordered traversal through those runs. An edge is the one-run case. Buses share split trunk runs, and bundles
  combine real member networks rather than inventing an averaged highway path.
- All graph fields and collection mappings receive one object context: `{ item, key, index, ...domainContext }`.
  Geometry, particle, and connector helpers create the same parameter token, while retaining distinct source types.
- `connectors.empty()` and empty joins are valid. Matching relationships auto-overlay presentation layers; independent
  reusable module instances use an explicit `{ scope }` to namespace their semantic keys.
- Routing properties merge from inner to outer, with later values winning. `{ replace: true }` is the explicit reset.
  Presentation layers have stable keys (`shaft` by default), so later layers modify named presentation rather than
  relying on array position.
- Ground and air presets lower to ordinary public `route()` and `stroke()` operators. A highway router is a separate
  routing feature with separate tests; bundle under-styling does not stand in for it. Adding markers or flow does not
  remove the default shaft.
- Public connector positions are frozen `[x, y, z]` tuples. Three.js vectors remain inside resolution and realization.
  Picking forwards the actual raycast intersection and reports normalized traversal progress in `[0, 1]`.

### What “host” means

A host is the Vue/Vuetrex lifecycle owner for a connector graph. It is comparable to a mount point or controller, not
to a visible group in the diagram.

```vue
<vx-connectors
  :graph="networkGraph"
  @click="inspectConnection"
/>
```

Here, `<vx-connectors>` is the host. It owns:

- the reactive effect that compiles `networkGraph`;
- the stage-controller registration and stable owner ID;
- keyed route, bundle, stroke, particle, and picking allocations;
- host-level interaction callbacks;
- complete cleanup when Vue unmounts it.

It does **not** own a position, size, transform, material, or visible Three.js container. Its place in the Vue template
expresses ownership and lifetime, not spatial placement. Endpoints resolve through refs or stage lookup and may live
in different layout containers.

Internally, the host still appears in `Base.childList` because Vue's custom renderer needs ordinary parent, sibling,
move, and unmount semantics. That renderer record must never appear in `Node.elements`, layout projections, focus
traversal, or the Three.js scene graph.

Multiple hosts are valid when an application wants separate ownership domains—for example infrastructure links, live
query flows, and temporary analysis results. Edge keys are scoped by host ownership so independent graphs cannot
accidentally dispose or overwrite each other.

## Product roles and default visual language

Connectors should serve four related purposes without forcing all of them into the same abstraction.

### 1. Relationship model and graph algorithms

The authored graph is the source of truth for connectivity. Its keyed nodes and edges should be inspectable as plain,
serializable data with enough metadata for directed traversal, weights, capacities, categories, and application
payloads.

The initial fluent API does not need to ship a catalogue of graph algorithms. It should expose a clean topology
boundary so applications or future modules can run shortest-path, reachability, centrality, cycle detection,
clustering, or simplification without reading Three.js objects or sampled curve points.

Algorithm results should return to the renderer as ordinary data:

- a set of selected edge keys;
- a filtered or simplified connector source;
- weights used by a route or flow field;
- annotations that choose a profile, style, visibility, or priority.

Visual aggregation must retain provenance. If twenty semantic edges share one rendered highway, the resolved bundle
still knows all member edge keys. Simplifying the picture must not destroy the underlying relationships.

### 2. Ground, air, and user-defined profiles

The fluent layer should provide two strong built-in visual profiles while leaving the underlying operators
independently overridable:

- **Ground** is the normal case: low to a routing surface, grid or orthogonal, obstacle-aware, bundle-friendly, and
  visually restrained. It should read like PCB traces or roads between buildings.
- **Air** is the exception case: elevated, usually direct, Bézier, or spline-based, less aggressively bundled, and
  visually more prominent. It suits rare jumps, cross-links, alerts, or routes that cannot remain legible on the
  ground plane.

Profiles are convenience presets, not topology types:

```ts
const graph = connectors
  .edges(connections, {
    keyBy: edge => edge.id,
    from: edge => edge.source,
    to: edge => edge.target,
  })
  .profile(edge => edge.isExceptional ? 'air' : 'ground')
  .flow({ speed: edge => edge.queriesPerSecond })
```

`profile('ground')` lowers into routing, bundling, stroke, and marker defaults, plus defaults for any flow layer the
author adds. Explicit `.route()`, `.bundle()`, `.stroke()`, or `.flow()` operators override the corresponding part.
Registered routing strategies, custom geometry, manual waypoints, and application-defined profiles preserve the
builder's freedom.

Changing an edge from ground to air normally invalidates its route and presentation, not its semantic identity.

### 3. A legible “highway” default

The collection default should optimize for a stable overview, not a mathematically perfect wiring diagram. A practical
ground router can use a deterministic, bounded heuristic:

1. Project endpoint ports and selected obstacle bounds onto a ground routing plane.
2. Expand obstacles by a configurable clearance and rasterize them onto a coarse grid.
3. Process edges in a stable order, optionally grouped by an explicit bundle key or nearby endpoint zones.
4. Route each group with a Manhattan-style search whose cost penalizes distance, bends, crossings, and new corridor
   creation while discounting reuse of a compatible existing corridor.
5. Turn shared grid runs into bundle trunks and fan member routes into deterministic lanes near their endpoints.
6. Promote explicit exceptions—and optionally routes with excessive detours or unresolved crossings—to the air
   profile.
7. Simplify collinear points and soften corners only after route topology is stable.

The corridor-reuse discount is the simple mechanism that creates chokepoints and highways. It deliberately prefers a
readable general outline over individually optimal paths. It is not a promise of globally optimal bundling or general
3D obstacle avoidance.

Good defaults also require stability:

- stable edge and bundle keys determine routing and lane order;
- small endpoint movements remain snapped within the same cells where possible;
- cached trunks survive until topology or relevant obstacle bounds change;
- deterministic tie-breaking prevents jumps between equivalent solutions;
- a configurable air threshold prevents an unreadable ground detour from dominating the scene.

A useful default rendering is a quiet, wider bundle under-stroke with thinner semantic lanes or particles above it.
Normal flow uses the scene's secondary data colour; hover, selection, and anomaly state temporarily earn the accent
colour.

### 4. Selection and live inspection

Every visible route, branch, marker, particle field, and shared trunk should remain pickable when interaction is
enabled. Picking resolves to stable graph identity instead of exposing a `Node`, `Segment`, mesh, line, or mutable
Three.js object.

For an individual route, a hit identifies its edge key and original item. For a shared trunk, it identifies the bundle
and all member edge keys so an application can show an aggregate card or ask the user to choose a member. A hit also
carries a readonly world-space anchor and normalized path position so UI can place a card near the selected route.
The discriminated public hit type is specified under “Stroke, markers, and interaction.”

Selection state belongs to the application or host. A click can select the stable key, retrieve live metrics such as
current queries per second, and display a card anchored at `point`. Feeding selected keys back into `.stroke()`,
`.flow()`, or `.visible()` keeps interaction declarative and avoids putting connector records in the stage's spatial
node registry.

---

## Desired author experience

### One edge

```ts
import { connectors } from '@exceeder/vuetrex'

const dependencies = connectors
  .edge('gateway', 'orders', { key: 'gateway-orders' })
  .route({ strategy: 'orthogonal', fromPort: 'right', toPort: 'left', clearance: 0.2 })
  .stroke({ color: 0x6fcbd1, width: 0.012, markerEnd: 'arrow' })
```

```vue
<vx-connectors :graph="dependencies" />
```

The component's position among visual children has no spatial meaning. It may be placed directly under `<Vuetrex>`
for clarity.

### A keyed data collection

```ts
interface Dependency {
  id: string
  source: string
  target: string
  critical: boolean
  throughput: number
}

const graph = computed(() => connectors
  .edges(dependencies.value, {
    keyBy: dependency => dependency.id,
    from: dependency => dependency.source,
    to: dependency => dependency.target,
  })
  .route({
    strategy: dependency => dependency.critical ? 'orthogonal' : 'bezier',
    elevation: dependency => dependency.critical ? 0.45 : 0.15,
    lane: 'auto',
  })
  .stroke({
    color: dependency => dependency.critical ? 0xff8a65 : 0x73cad1,
    width: dependency => 0.008 + dependency.throughput * 0.0004,
    markerEnd: 'arrow',
  }))
```

Reordering `dependencies` preserves compiled records, resolved paths, backend slots, and hit identity for every stable
key.

### Fluent particle flow on resolved routes

```ts
import { connectors, particles } from '@exceeder/vuetrex'

const traffic = connectors
  .edges(dependencies, {
    keyBy: edge => edge.id,
    from: edge => edge.source,
    to: edge => edge.target,
  })
  .route({ strategy: 'spline', elevation: 0.3 })
  .flow(route => particles
    .path(route.points, {
      key: route.key,
      count: Math.max(2, Math.round(route.item.throughput / 10)),
      distribution: 'even',
      spread: 0.015,
    })
    .appearance({
      color: route.item.critical ? 0xffa06a : 0x73cad1,
      size: 0.035,
      blending: 'additive',
    })
    .motion({ speed: 0.7 }))
```

`flow()` receives a resolved path context and returns a normal `ParticleSource`. The connector controller combines the
resulting sources into a stage-owned particle program and uses the registered particle backend. No hidden
`<vx-particles>` child or legacy connector-only particle engine is created.

### Authored geometry for markers or the full route

```ts
import { connectors, defineGeometry, geo } from '@exceeder/vuetrex'

const diamond = geo.box({ width: 0.12, height: 0.12, depth: 0.12 })
  .transform({ rotate: [0, Math.PI / 4, Math.PI / 4] })

const cable = defineGeometry<{ points: readonly [number, number, number][]; width: number }>(params =>
  geo.line({ points: params.points, thickness: params.width, path: 'smooth' }),
)

const graph = connectors
  .edge('producer', 'consumer')
  .route({ strategy: 'bezier', elevation: 0.5 })
  .marker({ end: diamond, scale: 0.8 })
  .geometry(route => cable({ points: route.pointTuples, width: 0.018 }))
```

Markers use connector-controlled endpoint placement and tangent orientation. `geometry()` is the advanced escape hatch
for tubes, ribbons, multi-part decorations, or application-defined cable modules. It consumes ordinary
`GeometrySource` output and reuses the stage's geometry prototype pool.

### Composition recipe adapter

```ts
const graph = connectors
  .edges(scene.fragment.connections, {
    keyBy: connection => connection.id,
    from: connection => connection.from,
    to: connection => connection.to,
  })
  .bundle({ keyBy: connection => connection.bundle })
  .route({ strategy: 'orthogonal' })
  .stroke({ markerEnd: 'arrow' })
```

This replaces a `<vx-connector v-for>` expansion with one keyed graph owner without changing `SceneFragment`.

### Reusable connector modules

```ts
import { connectors, defineConnectors } from '@exceeder/vuetrex'

export const serviceTraffic = defineConnectors<{
  edges: readonly Dependency[]
  color: number
}>(params => connectors
  .edges(params.edges, {
    keyBy: edge => edge.id,
    from: edge => edge.source,
    to: edge => edge.target,
  })
  .route({ strategy: 'spline', lane: 'auto' })
  .stroke({ color: params.color, markerEnd: 'arrow' }))
```

`defineConnectors()` and `defineConnectorOutputs()` follow the same finite-construction and named-output rules as
geometry and particle modules.

---

## Proposed authoring model

### Core graph types

```ts
export const CONNECTOR_GRAPH_NODE: unique symbol
export const CONNECTOR_PARAMETER: unique symbol

export interface ConnectorParameter<Value = unknown> {
  readonly [CONNECTOR_PARAMETER]: true
  readonly name: string
  readonly fallback?: Value
}

export interface ConnectorContext<Item = unknown> {
  readonly key: string
  readonly index: number
  readonly item: Item
  readonly from: ConnectorEndpoint
  readonly to: readonly ConnectorEndpoint[]
}

export type ConnectorField<Value, Item = unknown> =
  | Value
  | ConnectorParameter<Value>
  | ((item: Item, context: ConnectorContext<Item>) => Value | ConnectorParameter<Value>)

export interface ConnectorGraphNode<Parameters extends object = Record<string, unknown>, Item = unknown>
  extends ConnectorChain<Item> {
  readonly [CONNECTOR_GRAPH_NODE]: true
  readonly kind: string
  readonly key?: string
  readonly inputs: Readonly<Record<string, ConnectorInput>>
  readonly parameters: Readonly<Parameters>
  readonly __connectorItem?: Item
}

export type ConnectorSource<Item = unknown> = ConnectorGraphNode<object, Item>
```

Graph objects use the same frozen shared-prototype approach as `GeometrySource` and `ParticleSource`. Functional and
fluent calls build identical nodes:

```ts
connectors.stroke(connectors.route(source, routeOptions), strokeOptions)
source.route(routeOptions).stroke(strokeOptions)
```

### Sources

The initial source catalog should be deliberately small:

| Source | Purpose |
|---|---|
| `connectors.edge(from, to, options?)` | One point-to-point relationship |
| `connectors.edges(items, mapping)` | A keyed collection mapped to point-to-point relationships |
| `connectors.bus(from, to[], options?)` | One explicit source/trunk/branch topology |
| `connectors.buses(items, mapping)` | A keyed collection mapped to bus topologies |

`edges()` must require or reliably derive stable keys. Objects with an `id` field may default to `id`; all other
collections require `keyBy`. Duplicate keys throw before reconciliation.

### Operators

Every operator returns `ConnectorSource`:

| Operator | Responsibility |
|---|---|
| `profile()` | Expand a named authoring preset such as `ground` or `air`; explicit later operators override it |
| `route()` | Strategy, ports, clearance, elevation, lanes, waypoints, route coordinate space |
| `bundle()` | Group compatible edges into shared trunks using stable bundle keys |
| `stroke()` | Optimized solid/dashed shaft styling and built-in markers |
| `marker()` | Geometry-source start, end, junction, and repeated path markers |
| `flow()` | Build fluent particle sources from resolved route contexts |
| `geometry()` | Build arbitrary geometry sources from resolved route contexts |
| `visible()` | Record-level visibility field without pretending the graph is a scene node |
| `named()` | Diagnostic grouping and inspection name, not a stage endpoint ID |
| `join()` | Combine independent connector sources without flattening authoring identity |
| `pipe()` | Apply reusable connector operators with runtime type validation |

Multiple decoration operators accumulate layers. A route may have a faint wide under-stroke, a narrow colored
over-stroke, a geometry marker, and particle flow simultaneously. Applying `route()` twice uses the outermost route
operator as the effective path policy and should produce a development warning unless an explicit override option is
provided.

### Endpoint references

The endpoint type should grow without abandoning stable semantic node IDs:

```ts
export type ConnectorEndpoint =
  | string
  | Readonly<{ node: string; port?: ConnectorPort }>
  | Readonly<{ position: ConnectorVector3Like; space?: 'world' | { node: string } }>

export type ConnectorPort =
  | ConnectorPortName
  | ConnectorPortCoordinates
  | Readonly<{ name: string }>
```

Required behavior:

- A string continues to mean a stage semantic node ID with `auto` port selection.
- Bounds face names and normalized coordinates remain compatible.
- Free positions allow routes to originate from annotations, geographic coordinates, or non-node data.
- `{ space: { node } }` interprets a point in a named node's local space and follows its world transform.
- Custom named ports are resolved through a new optional `Node.connectorPorts()` contribution API.
- Port definitions carry both position and outward normal. Routing never guesses a tangent when the owner supplies one.
- IDs remain stage-global in the first release. Lexical subtree scoping is a separate problem and must not be inferred
  from where `<vx-connectors>` appears in the host tree.

### Routing options

```ts
export type ConnectorRoutingSurfaceName = 'ground' | 'air' | (string & {})

export type ConnectorObstacleRef =
  | string
  | Readonly<{ node: string; clearance?: number }>
  | Readonly<{ min: ConnectorVector3Like; max: ConnectorVector3Like }>

export type ConnectorObstacleSource<Item = unknown> =
  | 'none'
  | 'stage-nodes'
  | ConnectorField<readonly ConnectorObstacleRef[], Item>

export interface ConnectorRoutingOptions<Item = unknown> {
  strategy?: ConnectorField<ConnectorStrategyName, Item>
  surface?: ConnectorField<ConnectorRoutingSurfaceName, Item>
  fromPort?: ConnectorField<ConnectorPort, Item>
  toPort?: ConnectorField<ConnectorPort, Item>
  clearance?: ConnectorField<number, Item>
  elevation?: ConnectorField<number, Item>
  lane?: ConnectorField<number | 'auto', Item>
  waypoints?: ConnectorField<readonly ConnectorWaypoint[], Item>
  obstacles?: ConnectorObstacleSource<Item>
}
```

`clearance` replaces the misleading authored meaning of `avoid`. Legacy `avoid=false|true|number` lowers to zero,
stage-default, or numeric clearance. Obstacle avoidance is a separate, explicit routing input. The `ground` profile may
default to projected stage-node bounds, excluding declarations and endpoint exit zones; applications can provide a
filtered obstacle source or disable it. Each strategy must document which obstacle shapes it supports and its
complexity.

Built-in strategies remain `direct`, `orthogonal`, `bezier`, and `spline`. `straight` remains an input compatibility
alias but is normalized to `direct` in compiled output. A `manual` strategy consumes waypoints without modifying them.

### Stroke, markers, and interaction

```ts
export interface ConnectorStrokeOptions<Item = unknown> {
  color?: ConnectorField<THREE.ColorRepresentation, Item>
  width?: ConnectorField<number, Item>
  opacity?: ConnectorField<number, Item>
  dash?: ConnectorField<readonly [length: number, gap: number] | false, Item>
  offset?: ConnectorField<number, Item>
  markerStart?: ConnectorField<BuiltinConnectorMarker | false, Item>
  markerEnd?: ConnectorField<BuiltinConnectorMarker | false, Item>
  depthTest?: ConnectorField<boolean, Item>
}
```

Built-in marker names should start with `arrow`, `dot`, `diamond`, and `none`. `marker()` accepts `GeometrySource` for
custom shapes and adds size, color/material channel, tangent alignment, and inset fields.

Connector picking, if enabled, returns owner-level typed hits. The union distinguishes one semantic edge from a shared
presentation bundle:

```ts
export type ConnectorHit<Item = unknown> =
  | ConnectorEdgeHit<Item>
  | ConnectorBundleHit

export interface ConnectorEdgeHit<Item = unknown> {
  readonly kind: 'edge'
  readonly key: string
  readonly item: Item
  readonly part: 'stroke' | 'marker-start' | 'marker-end' | 'junction' | 'particle'
  readonly point: ConnectorVector3Tuple
  readonly pathPosition?: number
  readonly sourceName?: string
}

export interface ConnectorBundleHit {
  readonly kind: 'bundle'
  readonly key: string
  readonly part: 'bundle'
  readonly memberKeys: readonly string[]
  readonly point: ConnectorVector3Tuple
  readonly pathPosition?: number
  readonly sourceName?: string
}
```

Picking must not create one `Node` per edge. `<vx-connectors @click>` receives the hit from tagged backend objects;
connectors do not enter normal `Node` event bubbling or stage focus identity. The host may also expose a helper that
projects `point` to screen coordinates for route-anchored cards without making the connector a spatial node.

---

## Runtime architecture

```text
Vue refs / reactive data
          │
          ▼
computed<ConnectorSource>
          │
          ▼
immutable connector DAG ─────────► defineConnectors() modules
  sources + topology + decoration
          │
          ▼
ConnectorCompiler
  stable keys, fields, parameters, decoration layers
          │
          ▼
AuthoredConnectorPlan
  endpoint refs + route policy + appearance descriptions
          │
          ▼ endpoint revision / stage registry
ConnectorResolver
  ports + world transforms + unresolved records
          │
          ▼
ResolvedConnectorPlan
  immutable points, tangents, arc lengths, route parts
          │
          ├────────► StrokeBackend
          ├────────► Geometry bridge / GeometryRealizer
          ├────────► Particle bridge / registered ParticleBackend
          └────────► diagnostics, picking, export
```

### Authored, resolved, and realized state must stay separate

The current mutable `Segment` mixes endpoint objects, routing output, renderer choice, scale, marker inset, and legacy
orthogonal coordinates. Replace it internally with immutable records:

```ts
interface ResolvedConnectorPath<Item = unknown> {
  ownerId: string
  key: string
  item: Item
  topology: 'edge' | 'bus'
  from: ResolvedConnectorEndpoint
  to: readonly ResolvedConnectorEndpoint[]
  points: readonly THREE.Vector3[]
  parts: readonly ConnectorPathPart[]
  cumulativeLengths: readonly number[]
  totalLength: number
  scale: number
  routeSignature: string
}
```

Render backends never resolve node IDs or recalculate routes. Strategies never allocate GPU resources. The compiler
never touches Three.js scene objects.

### Owner-scoped reconciliation

The stage controller should expose internal owner operations instead of public string registration IDs:

```ts
controller.reconcile(ownerId, authoredPlan)
controller.removeOwner(ownerId)
```

Compiled record IDs are namespaced as `ownerId + recordKey`, so two graph hosts may use the same application key
without colliding. Reconciliation diffs four signatures independently:

1. **Topology signature:** source/target membership and bundle structure.
2. **Route signature:** endpoint revisions, ports, strategy, clearance, lane, elevation, and waypoints.
3. **Decoration signature:** stroke, marker, geometry, and particle source descriptions.
4. **Dynamic field signature:** time-varying/backend state that can update buffers without route compilation.

Expected invalidation behavior:

| Change | Required work |
|---|---|
| Input array reorder with stable keys | Reorder diagnostics only; preserve paths and backend slots |
| One edge color change | Update that decoration attribute/material batch only |
| One endpoint transform change | Resolve and reroute only dependent records |
| Container transform change | Invalidate descendant endpoint revisions once |
| Route strategy change | Rebuild affected path and its dependent decorations |
| One target removed | Keep authored record unresolved; remove only its realized output |
| Graph host unmount | Remove all owner records and dispose owner-specific state |
| Stage destroy | Dispose all backends, shared registrations, geometry, materials, and particle programs |

Automatic lanes must be deterministic from stable peer ordering, not current insertion order. Adding one parallel edge
may reroute its peer group but must not rebuild unrelated endpoint pairs.

### Endpoint revision flow

Replace broad calls to `reconcileConnections()` with explicit stage notifications:

```text
node registered/unregistered ─┐
node geometry bounds changed ─┼─► EndpointRevisionRegistry
node/world transform changed ─┘            │
                                           ▼
                              dependent connector keys only
```

An initial implementation may adapt existing `connectors.update(element)` calls into this registry. The final API
should not require every node watcher to trigger a full connector pass.

---

## Host and lifecycle model

### New host-only declaration base

Introduce a small internal base for stage declarations:

```ts
abstract class StageDeclaration extends Base {
  readonly stage: VuetrexStage
  // Base defaults remain: isRenderableNode() === false,
  // participatesInLayout() === false.
}
```

`ConnectorGraphHost` extends `StageDeclaration` and owns:

- a shallow-reactive `graph?: ConnectorSource`;
- a shallow-reactive parameter map;
- one stable owner ID unrelated to semantic scene IDs;
- one compiler effect;
- optional owner-level interaction handlers;
- `onRemoved()` cleanup through `controller.removeOwner(ownerId)`.

It does not own:

- `Element3d`;
- a Three.js object or group;
- measured size or render offset;
- stage node ID/name registration;
- focus/camera behavior;
- `visible`, `disabled`, or standard `Node` event bubbling.

Visibility is a graph field. Diagnostics use graph names and record keys. Interaction is explicitly owner-level.

### Why not remove the host from `Base.childList` entirely?

Doing so would break the custom renderer contract. Vue must be able to ask for a connector element's parent and next
sibling, move a keyed declaration, and unmount it. Maintaining a second hidden host topology inside `nodeOps` would
duplicate `Base` bookkeeping and repeat the exact tree-coherency risks already solved there.

The correct invariant is not “connector tags have no host parent.” It is:

> Connector declarations may exist in the renderer host tree, but never in the spatial `Node` tree or its `elements`
> projection.

### Legacy tag adapters

`<vx-connector>` and `<vx-bus-connector>` should become thin `StageDeclaration` adapters that lower their props into a
single-record `ConnectorSource`. This immediately removes their unwanted `Node` identity without requiring users to
migrate templates.

The `connection` prop on `MeshNode` should remain compatible for one release series, but lower into an owner-scoped
single edge managed by the connector controller. It should be documented as convenience syntax and eventually
deprecated because route ownership, fields, decoration layers, and parallel edges belong in a connector graph.

---

## Geometry and particle reuse

### Particle bridge

The existing connector `ParticleRenderer` and `three/connectors/particles.ts` should not grow a second fluent API.
`flow()` should:

1. receive each resolved connector path context;
2. call the author-provided factory to obtain a `ParticleSource`;
3. join owner-compatible sources into one compiled particle program;
4. use the normal particle backend registry;
5. preserve connector key/item identity in `ParticleHit` metadata;
6. rebuild only sources whose resolved paths or flow descriptions changed;
7. dispose the owner program on graph removal.

The bridge needs a runtime path source that accepts already-resolved immutable points without introducing a public
scene node. If the current particle compiler cannot incrementally replace one emitter, add keyed emitter
reconciliation there rather than retaining the legacy connector particle system indefinitely.

### Geometry bridge

`marker()` and `geometry()` should use `GeometrySource`, `GeometryEvaluator`, the stage-scoped prototype pool, and
`GeometryRealizer` primitives where possible. They should not instantiate hidden `GeometryNode`s.

- Marker geometry is evaluated once per source signature and instanced at path endpoints or junctions.
- Connector placement supplies transforms, tangent orientation, visibility, key, and item context.
- Full-route geometry factories receive immutable point tuples and path metadata.
- Shared authored marker sources retain shared topology until their final connector owner releases them.
- Connector geometry remains excluded from layout and camera bounds by default.

The bridge should be factored as reusable compiler services rather than reaching into `GeometryNode` private state.

### Do not merge the three graph types

`ConnectorSource`, `GeometrySource`, and `ParticleSource` solve different domain problems. Sharing their immutable
graph conventions, parameter model, fluent prototype technique, module helpers, and compiler services is valuable;
forcing them into one universal graph type would erase useful type constraints.

---

## Extensibility boundaries

### Route strategies

```ts
export interface ConnectorStrategy {
  resolve(context: ConnectorStrategyContext): ConnectorStrategyResult
}

export function registerConnectorStrategy(
  name: string,
  strategy: ConnectorStrategy,
): () => void
```

`ConnectorStrategyContext` contains resolved endpoints, normals, bounds, lane distance, elevation, clearance,
waypoints, and scale—never `Element3d` or stage internals. Results are immutable points and typed path parts. This makes
strategies deterministic, unit-testable, serializable at the boundary, and usable outside WebGL.

### Appearance backends

```ts
export interface ConnectorAppearanceBackend {
  reconcile(records: readonly ConnectorDecorationRecord[]): void
  update?(timeSeconds: number, deltaSeconds: number): void
  hitAt?(object: THREE.Object3D, instanceId?: number): ConnectorHit | undefined
  dispose(): void
}

export function registerConnectorAppearance(
  name: string,
  factory: ConnectorAppearanceBackendFactory,
): () => void
```

Built-in `stroke`, geometry, and particle bridges use the same controller contract. Animation is registered only while
at least one active backend needs frames.

Custom registries should be stage-scoped or explicitly snapshot global registrations during stage construction, so
one application or test cannot silently change another mounted stage.

---

## Diagnostics and inspection

Add pure graph and runtime inspection functions parallel to geometry diagnostics:

```ts
connectorGraphSignature(source)
describeConnectorGraph(source)
connectorGraphToDot(source)
inspectConnectors(source, parameters?)
stage.connectorDiagnostics()
```

Diagnostics should report:

- authored record count;
- resolved, unresolved, edge, bus, and bundled counts;
- route strategy and appearance backend counts;
- path/segment/point counts;
- geometry batch and particle emitter counts;
- reroute and backend update counts;
- duplicate keys, missing endpoints, unknown ports, invalid bundles, and fallback strategies;
- owner names and record keys without adding them to `nodesById`.

Existing connection-port diagnostics should consume resolved endpoint records from the controller instead of mutable
segments.

---

## Compatibility and migration

### Compatibility table

| Current API | Proposed lowering | Compatibility |
|---|---|---|
| `<vx-connector from to>` | Host-only single `edge()` graph | Preserve |
| `<vx-bus-connector from :to>` | Host-only single `bus()` graph | Preserve |
| `<bus-connector>` | Same bus adapter | Preserve alias, document deprecation |
| `layout="straight"` | `route({ strategy: 'direct' })` | Preserve input alias |
| `type="line"` | `stroke()` default layer | Preserve |
| `type="particles"` | Default fluent particle-flow preset | Preserve visually, migrate backend |
| `avoid` | `clearance` | Preserve as deprecated alias |
| mesh `connection` prop | Owner-scoped single edge | Preserve initially, document limits |
| `SceneConnection[]` + `v-for` | `connectors.edges()` | Add preferred adapter |
| internal `stage.connect()` | Controller owner reconciliation | Keep internal adapter during migration |

No existing tag should begin participating in layout. Moving legacy classes from `Node` to `StageDeclaration` is an
internal semantic correction, but tests must cover any application that takes refs to connector tags. Such refs should
not promise `Node` methods in the public API.

### Defaults

Legacy defaults remain stable for adapters:

- connector: orthogonal route with particle flow;
- bus: line stroke with one source lead, shared trunk, and terminal branches;
- automatic bounds ports;
- automatic parallel lanes;
- stage-derived default clearance;
- existing stage connector and particle colors as fallback style values.

The fluent API may choose clearer defaults, but its first documentation must state them explicitly.

---

## Proposed module layout

```text
src/lib-components/connectors/
  types.ts                         public graph, fields, endpoints, paths, hits
  graph.ts                         immutable nodes, fluent methods, signatures
  parameters.ts                    connector parameters and resolution
  fields.ts                        keyed field evaluation
  modules.ts                       defineConnectors / named outputs
  index.ts                         public connectors namespace and exports
  sources/
    edge.ts
    bus.ts
  operators/
    route.ts
    bundle.ts
    stroke.ts
    marker.ts
    flow.ts
    geometry.ts
    visible.ts
    named.ts
    join.ts
  compiler/
    evaluator.ts                   graph to authored records
    resolver.ts                    endpoints/ports to immutable paths
    signatures.ts                  topology/route/decoration invalidation
    types.ts
  runtime/
    ConnectorController.ts         owner registry and keyed reconciliation
    EndpointRevisionRegistry.ts    targeted endpoint invalidation
    StrokeBackend.ts               optimized shafts/dashes/built-in markers
    GeometryBridge.ts              GeometrySource realization
    ParticleBridge.ts              ParticleSource realization
    picking.ts
    diagnostics.ts
  strategies/
    direct.ts
    orthogonal.ts
    bezier.ts
    spline.ts
    manual.ts

src/lib-components/nodes/
  StageDeclaration.ts
  ConnectorGraphHost.ts
  ConnectorNode.ts                 legacy tag adapter
  BusConnectorNode.ts              legacy tag adapter
```

The existing `three/connectors/` implementation remains during migration. It should be removed only after visual
parity, resource-disposal tests, and compatibility adapters use the new controller.

---

## Implementation phases

### Phase 1: Immutable authoring package

- Add connector graph symbols, types, frozen graph-node construction, and runtime guards.
- Add `edge`, `edges`, `bus`, `buses`, `route`, `bundle`, `stroke`, `visible`, `named`, `join`, and `pipe`.
- Add connector parameters, fields, graph signatures, `defineConnectors`, and named outputs.
- Compile graphs into keyed authored records without stage or Three.js access.
- Add functional/fluent parity and immutability tests.

### Phase 2: Correct host ownership

- Add `StageDeclaration` and `ConnectorGraphHost` extending `Base` rather than `Node`.
- Register `<vx-connectors>` without making it a renderable scene node.
- Prove it never enters `elements`, stage node identity, layout, focus, or Three.js output.
- Prove Vue keyed reorder, conditional removal, `<Vuetrex>` unmount, and effect cleanup.
- Convert legacy connector tags to host-only adapters while retaining props and registration behavior.

### Phase 3: Resolved path controller

- Introduce immutable endpoint and path records.
- Port the four existing route strategies behind the pure strategy interface.
- Add manual waypoints and normalize `straight` / `avoid` compatibility inputs.
- Add owner-scoped keyed reconciliation and unresolved endpoint retention.
- Add endpoint revision tracking and dependent-record invalidation.
- Port bus topology, then implement data-driven `bundle()` over the same resolved record model.

### Phase 4: Incremental stroke backend

- Replace global signature rebuilds with keyed shaft and marker reconciliation.
- Support per-record color, width, opacity, visibility, dash, offset, and built-in markers.
- Batch compatible segments and markers; preserve stable slots across input reorder.
- Tag backend objects for diagnostics and optional owner-level picking.
- Verify GPU resource disposal on record removal, owner removal, backend replacement, and stage destroy.

### Phase 5: Fluent particle bridge

- Add resolved route contexts and `flow()` factories.
- Compile returned `ParticleSource` graphs through the registered particle backend.
- Preserve key/item hit metadata and per-route appearance/motion/simulation fields.
- Add keyed emitter reconciliation if the particle runtime cannot update one route efficiently.
- Retire the legacy connector `VuetrexParticles` backend after visual and performance parity.

### Phase 6: Geometry bridge and custom markers

- Reuse geometry evaluator/prototype-pool services outside `GeometryNode`.
- Add custom `GeometrySource` markers with instanced tangent-aligned placement.
- Add advanced full-route `geometry()` factories.
- Ensure connector geometry remains excluded from authored bounds, layout, lighting bakes, and focus unless a future
  explicit inclusion policy is designed.

### Phase 7: Composition, diagnostics, and migration

- Document `SceneConnection[]` to `connectors.edges()` mapping.
- Add graph and runtime inspection tools.
- Update architecture, guide, API, examples, and exports.
- Mark mesh `connection`, `avoid`, unprefixed bus tag, and internal imperative registrations with their intended
  compatibility timelines.
- Remove old connector renderers only after all compatibility tests pass through adapters.

---

## Test strategy

### Authoring tests

- Functional and fluent construction produce equal signatures.
- Inputs are immutable and reusable across several parents.
- `join`, modules, named outputs, and bounded construction recursion match geometry/particle conventions.
- Fields retain item types through `edges`, `bundle`, route, and decoration operators.
- Duplicate keys, invalid sources, cycles, and invalid `pipe()` results fail clearly.

### Host-tree tests

- `<vx-connectors>` exists in raw host order so `parentNode`, `nextSibling`, keyed moves, and unmount work.
- It never appears in `parent.elements`.
- It never calls `stage.registerNode`, receives an `Element3d`, or becomes a focus target.
- Visual sibling `myIdx` and layout measurement are unchanged by graph insertion, reorder, or removal.
- Graph host removal disposes only its owner records; it never removes endpoint nodes.
- `<Vuetrex>` unmount stops graph effects before stage destruction.

### Compiler and resolver tests

- Stable-key reorder preserves compiled objects and renderer slots.
- One membership change adds/removes only one record.
- Missing endpoints retain authored declarations without realized paths.
- Endpoint appearance after declaration activates only dependent records.
- Bounds faces, normalized ports, custom named ports, local points, and world points resolve correctly under nested
  translation, rotation, and non-uniform scale.
- Parallel lanes are deterministic and localized to one endpoint pair.
- Edge, bus, bundle, manual, direct, orthogonal, Bezier, and spline path parts carry correct tangents and lengths.

### Backend tests

- One style change does not rebuild route points or unrelated GPU geometry.
- Stroke resources and custom marker prototypes are reference-counted and disposed exactly once.
- Particle flow uses the registered backend and preserves per-route key/item identity.
- Geometry markers share prototypes and retain stable instance slots across reorder.
- Disabling the final animated layer unregisters the frame callback.
- Stage destroy clears every owner, backend, material, geometry, particle program, and hit mapping.

### Integration and visual tests

- Existing connector and bus examples remain visually compatible through legacy adapters.
- Nested groups, recipe placements, stage scale, camera fitting, hover scale, and dynamic endpoint geometry reroute
  correctly.
- Large keyed edge collections reorder without duplicates, stale paths, or full backend reconstruction.
- Visual baselines cover line thickness, dashes, markers, particle motion, multi-layer routes, automatic lanes, buses,
  and unresolved-to-resolved transitions.
- Browser memory checks repeatedly add, reroute, and remove graphs without monotonically growing GPU resources.

---

## Performance targets

These are acceptance targets, not premature implementation constraints:

- A pure reorder of 10,000 stable keyed edges performs zero route recomputations and zero GPU allocations.
- Moving one endpoint reroutes only records that reference that endpoint.
- Changing one edge's color updates only its decoration data or material batch.
- One graph host creates no per-edge Vue component, `Base`, `Node`, `Element3d`, `Group`, or frame callback.
- Static stroke-only graphs register no continuous animation callback.
- Compatible shafts, markers, and flows batch across records without losing record-level hit identity.

Diagnostics counters should make these targets testable rather than inferred from frame time alone.

---

## Non-goals for the first fluent release

- Do not make connector declarations spatial `Node`s to gain events or IDs.
- Do not make connector paths contribute to parent layout or automatic camera bounds.
- Do not infer endpoint scope from the host location of `<vx-connectors>`.
- Do not promise general 3D obstacle avoidance under the existing `avoid` name.
- Do not merge geometry, particle, and connector graph types into an untyped universal graph.
- Do not expose mutable `Segment`, `Element3d`, renderer groups, or backend materials through the public graph API.
- Do not create one Three.js group, material, or Vue component per edge when batching can retain identity.
- Do not remove legacy tags until adapters provide behavior and visual parity.
- Do not require users to adopt connector graphs for simple existing scenes immediately.

---

## Acceptance criteria

The proposal is complete when an implementation can demonstrate all of the following:

1. Connector operators are immutable fluent values and never enter the Vue/Vuetrex scene tree.
2. One `<vx-connectors>` host owns an arbitrary keyed graph while remaining a non-renderable `Base` declaration.
3. Connector hosts are absent from layout, `myIdx` projections, stage node IDs, focus, camera bounds, and Three.js
   authored objects.
4. Stable-key reorder preserves route and backend identity.
5. Endpoint, route, and decoration changes invalidate only dependent work.
6. Solid, dashed, multi-layer, marker, particle-flow, bus, and bundled connectors share one resolved path model.
7. Particle flow uses `ParticleSource` and registered particle backends rather than the legacy connector particle API.
8. Custom markers and advanced cable geometry consume `GeometrySource` and reuse geometry prototype ownership.
9. Legacy connector tags and current defaults pass compatibility and visual regression tests through adapters.
10. Every graph owner and stage teardown disposes all derived resources and stops all reactive/frame work.

The key architectural test is simple: deleting all connector graph hosts must remove connector output, but adding,
moving, or deleting them must never change the visual node layout or semantic endpoint registry.

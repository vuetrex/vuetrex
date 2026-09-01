# Vuetrex gaps and improvement proposals

This document records issues encountered while recreating `../K8sDiagram.jpg` with the current public Vuetrex node set. The
demo deliberately avoids direct Three.js scene construction; every architecture object is a Vue component composed from
Vuetrex nodes.

## What worked well

- `row`, `group`, `stack`, and `layer` are enough to build a large nested topology while keeping the source declarative.
- Reactive material props make health-state changes straightforward.
- Named nodes and declarative `connector` records allow a data-defined graph.
- Compound Vue components are a good way to prototype domain elements. `K8sWorkload`, `K8sDatabase`, `K8sCache`, and
  `K8sPlatform` all remain reactive without reaching into Three.js.
- The `lines` face-label API is much more useful than floor captions for dense cards.
- `VuetrexStage.animateTo()` and camera focus provide useful interaction hooks without exposing mesh mutation to app
  code.

## Health-demo audit against the five composition-pattern reference

The health demo now exercises three useful ingredients from the reference image: a curved canvas-backed display wall,
data-driven placement recipes, and a selectable graph of deployment components. It also names its current modes
`radial` and `temporal`. Those names currently describe simple placement variants, not the complete **Radial Focus** and
**Temporal Depth** compositions shown in the reference.

This section records what prevents an exact implementation of all five pictured patterns: **Layered Map**,
**Data Wall + Floor**, **Graph + Detail Portal**, **Radial Focus**, and **Temporal Depth**. It distinguishes library gaps
from missing demo data or integration work.

### Cross-cutting blockers

#### Composition plans are flat and only partially realized

`RepresentationRecipe` can select, aggregate, arrange, and emit a flat `SceneFragment`. A fragment can contain nodes,
connections, labels, representation names, props, bundles, and capabilities, but the health demo consumes only
`fragment.nodes`. Relations are rendered from a separate prop, labels have no built-in realization, `representation`
does not dispatch to a component registry, `props` are ignored, bundles do not change routing, and capabilities do not
drive the toolbar.

The five reference patterns require plans with nested semantic regions: map layers, a focused centre plus satellite
rings, repeated time slices, and a portal containing a secondary representation. Today each one needs a bespoke Vue
template that manually interprets part of the plan. There is no fragment-composition contract for child fragments,
named layers/surfaces, or representation-component dispatch.

#### No general-purpose textured surface

`vx-display-wall` provides an opaque canvas texture on a flat or curved framed display. It is suitable for dashboards,
but it is not a general `plane`/`surface` element:

- it always behaves as a display with frame/bezel semantics;
- its canvas material is not exposed for alpha blending, depth-write, polygon offset, or render order;
- it cannot act as a container for Vuetrex children;
- it cannot expose independent hit regions inside its canvas;
- arbitrary image/texture material props are not available on boxes or panels.

Transparent map sheets, floor overlays, portal glass, timeline slice panes, and composited diagrams therefore require
direct Three.js work or misuse of the display wall.

#### Connectors are planar even when the composition is not

Connector endpoints are measured in world space, but rendered routes are flattened onto XZ at one shared Y elevation.
Segment length, particles, line geometry, and direct arrowheads use X/Z only. This works for a floor topology, but not
for vertical links between map layers, a raised detail portal, or corresponding nodes across time slices.

Connectors also lack per-edge style, ports, obstacle avoidance, curved routes, lane allocation, and realized bundles.
Those gaps are visual in a small graph and structural in the pictured compositions because links must communicate
layer, direction, flow, and temporal correspondence.

#### Placement changes have no transition contract

Recipe placements contain position, quaternion, scale, visibility, and reserved LOD data. `GroupNode` applies a changed
placement by copying the transform, so switching row/radial/temporal modes snaps immediately. `animateTo()` can animate
Y and scale, but not X/Z position, quaternion, visibility, or an entire keyed placement set.

The reference compositions imply stable objects moving between explanations. Exact reproduction needs keyed enter,
update, and exit transitions for placement changes, including orientation interpolation and connector updates during
motion.

#### Camera framing is correct but camera intent is too small

World-bounds fitting and nested-node focus are resolved. The remaining gap is composition-owned camera policy. The
public contract can focus one named object or the complete scene using fixed focus/overview directions. It cannot:

- frame an arbitrary subset such as focus plus first-hop neighbours;
- specify azimuth, elevation, target offset, or preferred screen region;
- preserve context while enlarging a selected node;
- track a moving placement continuously;
- render a second camera into a portal or inset viewport.

This matters most for Radial Focus and Graph + Detail Portal. Moving the camera to one deployment is not equivalent to
recomposing the scene around it.

#### Missing scene annotation primitives

Face labels and canvas displays cover local text, but there are no billboard labels, callouts, axes, ticks, legends,
markers, or screen-space visibility rules. The map pins, radial ring annotations, `NOW`/`PAST` timeline axis, and portal
leader all need custom geometry or DOM overlays that are not part of the composition.

#### LOD and selective realization remain metadata only

`Placement.lod` is reserved but unused. `vx-instances` efficiently renders one repeated leaf batch, but it cannot
provide per-instance labels, materials, nested children, hover style, or connector endpoints. Reproducing the reference
at the intended scale of hundreds of services and thousands of leaves still needs semantic LOD, clustering, or
representation switching based on camera context.

### Pattern 1: Layered Map

**What already exists**

- Explicit `Placement` can put Vue subtrees at different elevations.
- `layer`, `row`, and `group` can compose content within each level.
- Material opacity works on ordinary mesh nodes.
- Canvas and SVG content can be painted onto `vx-display-wall`.

**What prevents the pictured result**

1. There is no thin, optionally frameless, textured `surface` node for map rasters, vector overlays, heatmaps, or
   topology sheets. A rotated display wall is visually and semantically the wrong primitive.
2. Display textures are opaque and expose no render ordering/depth-bias controls, so stacked translucent sheets would
   suffer from incorrect compositing or z-fighting.
3. There is no geographic projection operator or data contract for mapping longitude/latitude or arbitrary X/Y values
   into a surface's local bounds. The health fixture also contains no geographic coordinates.
4. Connectors cannot travel vertically from a point on one layer to the corresponding point on another.
5. There are no pin, icon, billboard, dashed correspondence line, clipping, or masking primitives.
6. A recipe emits one flat node set; it cannot describe one record appearing in several coordinated layers while
   retaining one semantic identity and selection state.

The minimum library addition is a general canvas/image/SVG-backed `surface` with alpha/depth controls and local point
anchors, followed by fully 3D connector paths. Geographic projection can remain an application operator once the
surface coordinate contract exists.

### Pattern 2: Data Wall + Floor

**What already exists**

- `vx-display-wall` supports flat/curved continuous canvases and independent displays.
- Canvas 2D, inline SVG, and existing canvas/image sources can paint live charts.
- The stage supplies a floor, lights, shadows, and reflection.
- Panels, stacks, cylinders, and connectors can create the floor topology.

This is the closest pattern to current capability and the health demo already produces a recognizable approximation.

**What prevents the pictured result**

1. The floor is stage-owned rather than a composition node. Its shape, rounded platform boundary, local size, texture,
   material, and placement cannot be authored alongside the wall.
2. Floor grid, mirror, overlay texture, shadows, and captions cannot be controlled independently per composition.
3. A display is texture-only: chart regions have no semantic IDs, pointer events, tooltips, or focus targets.
4. Wall displays cannot contain 3D Vuetrex children or reserve layout regions for them.
5. Per-edge connector color, width, arrows, rate, and ports are still missing, so the floor graph cannot match the
   visual hierarchy in the reference.
6. Camera policy cannot intentionally frame the wall and selected floor node as one authored shot; it only fits their
   union or focuses one named subtree.

The display wall itself is no longer the principal blocker. A composition-owned floor/platform, semantic display hit
regions, connector styling, and camera-shot options are.

### Pattern 3: Graph + Detail Portal

**What already exists**

- Named nodes, pointer selection, connectors, and bounds-based focus provide the graph foundation.
- A flat display wall can show a 2D detail card.
- The application already derives a selected deployment and renders an HTML inspector.

**What prevents the pictured result**

1. There is no graph layout operator such as force-directed, hierarchical, radial-by-hop, or constrained placement.
   `grid`, `row`, `ring`, and hand-authored placements do not resolve overlap for a changing topology.
2. There is no portal abstraction: no secondary camera, render target, clipping region, or inset viewport that can show
   another live 3D representation of the selected node.
3. `vx-display-wall` cannot host Vuetrex children. It can paint a 2D summary, but not contain the selected service's
   component tree.
4. There is no focus-to-detail representation mapping or transition. Selection opens an external DOM inspector and
   focuses the original object; it does not create or update a scene-local portal.
5. A connector cannot rise from a graph node to a portal plane, terminate on a chosen portal edge, or reserve an
   elevated route.
6. There is no clipping/masking or independent interaction routing for portal content.

A useful first version does not require a full render-to-texture portal. A `detail-surface` that is a real Vuetrex
container with its own local layout and a leader anchor would cover the reference's composition. A true second-camera
portal can remain a later rendering feature.

### Pattern 4: Radial Focus

**Implemented in the health demo**

- `radialFocus()` preserves input order while placing the selected deployment at the centre, directly related active
  deployments on an inner ring, and remaining context on an outer ring.
- `selectedId` and the filtered active relation graph are passed into `compose()`.
- The selected centre, inner ring, and outer ring have independent scale policies.
- Radial selection frames the named `main-stage` group instead of the selected node, preserving all surrounding context.
- With no valid selection, the composition remains the original equal-ring overview.

**What still prevents the exact pictured result**

1. The selected deployment has no alternate focused representation. A larger central service with detailed internals
   must currently be hand-authored as a separate component branch.
2. Placement changes snap, so selecting another centre cannot smoothly rotate/reorder rings.
3. Connectors terminate at object centres without radial ports, lane separation, or edge style, producing overlap near
   the centre.
4. There are no authored radial guides, ring ticks, or orbit labels independent from child layout.
5. The operator currently distinguishes only direct neighbours and other context. Weighted edges, directed hop bands,
   pinned angular sectors, and collision-aware radial ordering remain application work.

The primary remaining end-to-end change is keyed placement transitions. Connector ports and richer focused
representations are the next visual improvements.

### Pattern 5: Temporal Depth

**What the health demo currently does**

The `temporal` branch passes the five **current** deployments to `timeline()`, alternating X and receding along Z. Every
deployment still represents the same current simulation time. Scrubbing replaces current state rather than retaining
several times in the scene.

That is depth placement, not temporal depth.

**What prevents the pictured result**

1. The demo model retains only the latest snapshot/metric sample. Although the fixture exposes deterministic events and
   supports seeking, the client does not build a window of simultaneous historical snapshots.
2. The recipe works on one flat current collection. It has no time-slice abstraction for placing a complete nested
   scene fragment at each timestamp.
3. Repeated semantic nodes need time-qualified scene IDs while retaining a shared resource identity for comparison and
   selection. No identity contract currently separates `resourceId` from `sliceId`.
4. `SceneFragment` cannot nest or instance another fragment, so every slice must manually duplicate the Vue component
   tree.
5. There is no transition policy for scrub, playback, window insertion/removal, or interpolation between samples.
6. There are no slice planes, timeline axis/ticks, `NOW` marker, depth fading, per-slice opacity, or camera-distance
   visibility rules.
7. Connectors cannot express vertical/3D correspondence between the same node across slices, and bundles are metadata
   only.
8. Fitting all historical slices can make the current slice unreadably small; camera framing cannot prioritize `NOW`
   while keeping past slices as context.

The data-history window is a health-demo responsibility. Reusable time-slice composition, nested fragments, temporal
identity, transitions, 3D correspondence links, annotation primitives, and focus-weighted camera framing are Vuetrex
gaps.

### Practical priority for reaching the reference

The patterns do not require five unrelated feature sets. The following sequence unlocks most of them:

1. **General `surface`/`platform` node** with canvas/image/SVG texture, transparency, thickness, local anchors, and
   depth/render-order controls.
2. **Hierarchical fragment realization** that maps `representation` to Vue components and realizes connections, labels,
   props, bundles, and capabilities instead of consuming only `fragment.nodes`.
3. **Fully 3D connectors** with endpoint ports, vertical/curved paths, per-edge styling, and bundle/lane realization.
4. **Keyed placement transitions** covering XYZ position, quaternion, scale, visibility, and enter/exit.
5. **Composition camera shots** that fit declared semantic subsets with preferred view direction and focus context.
6. **Temporal and richer focus operators** built on relation-aware input and nested/time-slice fragments.
7. **Annotation and semantic-detail primitives** for billboards, axes, markers, portal/detail containers, and
   camera-distance visibility.

With those contracts, the five pictured designs become different recipes and representation components rather than
five renderer-specific implementations.

## Difficulties, resolved gaps, and current workarounds

### Resolved: connector layout participation and lifecycle

Connector records now synchronize without participating in layout through `participatesInLayout() === false`. The demo
can declare them directly under `Vuetrex` without a zero-gap wrapper. Registrations have stable IDs, reactive changes
replace the original record, unmount removes only the owning record, and parallel edges remain independent.

Segments also carry their closest common parent scale. Particle spread, particle size, flow velocity, and world-space
line thickness scale with enclosing groups and rebuild when an ancestor group changes.

The original segment representation could only describe one X- or Z-aligned span. As a result, a `direct` connector
between nodes on both axes rendered only its X projection and appeared truncated. Segments now retain explicit start/end
coordinates, and both line and particle renderers follow the complete diagonal while orthogonal routes keep every bend.

### Connector styling is global

The reference uses white arrows for dependencies, blue flow for requests, red dashed links for Redis, and green links
for coordination. Current connectors provide only:

- renderer: `particles` or `line`
- route: `orthogonal` or `direct` (`straight` is retained as a compatibility alias)

Color, opacity, thickness, dash pattern, arrow direction, particle speed, and particle density cannot be set per edge.
The demo uses particle versus line rendering as the only semantic distinction.

### Resolved for node cards: top-surface panel regions

The built-in `panel` is a visual container with a rounded backing mesh, a north/south label region, and a complementary
child-content region. Kubernetes workload cards now reserve the south 40% for their label and fit the replica stack into
the north 60%. The split, content scale, material, hover state, and labels remain reactive.

### No auto-fitting platform boundary element

`group` and `layer` establish layout but have no visual shell. The source diagram uses outlined platform boundaries with
titles. `K8sPlatform` approximates these with a shallow translucent box under the content. It cannot produce a raised
outline, title tab, padding independent from child gap, or an automatically fitted boundary.

### Layout is composition-only

The current layouts cover grid, row, depth, stack, and ring, but architecture diagrams often need explicit placement and
routing anchors. Reproducing the source precisely requires swimlanes, two-dimensional row/column spans, controlled empty
space, and occasional absolute offsets. The demo therefore preserves topology and grouping more closely than exact
placement.

### Camera framing follows world bounds (resolved)

The overview now fits authored world-space bounds and automatically refits after structural, layout, and viewport
changes. Applications can override persistent padding and transition duration through
`fitToContent({ padding, duration })`; top-level breakpoint scales are no longer required for framing.

Named focus measures the selected object's world bounds, including nested placement transforms and descendants.

### Labels are hard to manage at architecture scale

Floor captions become small and can overlap connectors. Face labels work well on boxes, but there is no label
background, billboard label, truncation policy, visibility threshold, or screen-space sizing. Cylinders also need
purpose-built label placement rather than the generic planar face label.

### Built-in geometry is too generic for infrastructure diagrams

Boxes, cylinders, and wedges convey the major categories, but the load balancer, Kubernetes pods, Redis, ZooKeeper,
message queues, and platform boundaries are only approximations. Cylinder height is now geometry-driven, enabling
metric-driven database/tower visuals; infrastructure-specific silhouettes remain a gap.

### Connector routing still needs hardening

- Orthogonal routes have no obstacle avoidance, port selection, lane allocation, or edge-specific elevation.
- Direction is explicit for direct line connectors; orthogonal and particle routes still have no end markers.
- Dense fan-out creates overlapping segments with no shared-bus representation.

## Proposed connector additions

### 1. Directional connector styling

The first low-cost step is implemented: direct `line` connectors receive a scale-aware arrowhead immediately before
the source-facing edge of the `to` endpoint.
The remaining work is per-edge styling and explicit marker control:

```vue
<vx-connector
    from="city-edge-lb"
    to="public-api"
    type="line"
    color="0x44aaff"
    width="0.025"
    :opacity="0.9"
    dash="0.12 0.08"
    end-cap="arrow"
/>
```

It should support `start`, `end`, `both`, and `none` direction markers, dashed status lines, and reactive
color/opacity/width. Orthogonal markers should wait for port-aware routing so arrowheads do not terminate inside nodes.

### 2. `flow` renderer

A semantic particle connector designed for metrics rather than a global particle effect:

- `rate` controls particle frequency.
- `speed` controls travel time.
- `color` and `pulseColor` reflect health.
- `direction` supports bidirectional traffic.
- `paused` freezes one edge independently.
- `value`/`unit` optionally drive a label such as `1.2k rps`.

This maps directly to the planned cluster event emulator.

### 3. Port-aware routes

Add endpoint props such as `from-port="right"`, `to-port="left"`, or explicit normalized face coordinates. Route
strategies should operate on world-space bounding boxes, not only object centers. This would stop links from cutting
through nodes and make nested composition predictable.

### 4. Bus/fan-out connector

Support one source to many targets with a shared trunk and short branches:

```vue

<bus-connector from="gateway" :to="apiIds" side="right"/>
```

This is especially useful for gateways, queues, service discovery, and database client pools.

### 5. Curved and elevated routes

Add `bezier`/`spline` strategies plus `elevation`, `lane`, and `avoid` props. Even basic automatic lane offsets would
make crossed links legible in a topology of this size.

## Proposed elements

### 1. `zone` / `boundary`

An auto-fitting visual container for clusters, namespaces, platforms, availability zones, and security boundaries.
Suggested props: `title`, `padding`, `borderColor`, `fillColor`, `opacity`, `titlePosition`, `status`, and `collapsed`.

### 2. `icon` / `billboard`

A camera-facing SVG, texture, or icon-atlas element with consistent screen-space sizing. This enables Kubernetes
resource glyphs without requiring bespoke geometry for every kind.

### 3. Infrastructure primitives

Small native elements would improve both recognition and label placement:

- `database` / `storage`
- `queue` / `topic`
- `cache`
- `pod` and `deployment`
- `ingress` / `load-balancer`
- `service`

These can initially be compound nodes implemented inside Vuetrex and later gain optimized geometry.

### 4. `badge`, `metric`, and billboard labels

Screen-readable overlays for health, replica counts, alerts, and short metrics. They should support visibility by camera
distance and avoid altering the node's measured layout footprint.

### 5. `plane` / explicit architecture layout

A two-dimensional container with rows, columns, spans, padding, and named anchors would cover most system diagrams. An
optional explicit `position="x y z"` escape hatch is also useful, provided it stays local to the nearest group.

## Ideas for the event-emulator phase

The demo model already separates resource identity from visual computation. A future emulator can update the existing
reactive records rather than manipulating scene objects.

Recommended design:

1. Define timestamped domain events (`PodRestarted`, `DeploymentScaled`, `LatencyChanged`, `TrafficChanged`,
   `DatabasePressureChanged`, `DependencyFailed`).
2. Reduce those events into the reactive workload/database/cache records.
3. Keep visual mappings bounded; for example, clamp load-driven height and use status thresholds for color.
4. Separate durable state from short-lived effects. Health and replica count live in the model; request bursts and alert
   pulses become transient animation records.
5. Use a deterministic seed and virtual clock so a 5–10 minute scenario can pause, replay, change speed, and scrub.
6. Add an event timeline/legend outside the canvas while keeping all architecture visuals inside Vuetrex components.
7. Once per-edge flow props exist, bind connector rate, speed, color, and pause state directly to traffic and dependency
   health.

## Scene scaling, particle fields, and meaningful atmosphere

The intended large-deployment policy should keep the logical scene inside a 20×20-unit envelope. Measure unscaled
content, apply one uniform root scale when either horizontal extent exceeds 20 units, and move the camera closer to the
resulting bounds. Connector segments now carry their closest common parent scale, so world-space line thickness and
particle spread/size/velocity follow the same reduction.

Connector particles should remain a specialized flow renderer. Log/event clouds and ambient background effects should
reuse the GPU particle engine through a separate `particle-field` node rather than pretending to be point-to-point
connections. Useful field layouts include orbit, shell, volume, stream, and background plane. For a deployment log cloud,
particle age can represent time within the last N minutes, radial distance can represent age or severity, color can
represent log level, and density can represent rate.

Fog and background should encode slow aggregate signals rather than decoration:

- fog density: exponentially smoothed cluster CPU/memory saturation;
- fog hue: dominant health state, with neutral blue-grey for healthy and warmer hues for elevated error budget burn;
- background particle density: aggregate log/event rate;
- background drift/turbulence: rate of change or incident volatility;
- brief low-amplitude pulses: cluster-wide deploy or scaling events.

All mappings should be clamped, smoothed, included in the legend, and kept below a visibility ceiling so degraded health
never makes the resources required for diagnosis unreadable.

## Small API quality improvements

- Add stable node keys/IDs separate from display names and reject duplicate names in development.
- Add `visible`, `disabled`, and `participatesInLayout` props to nodes.
- Add an official way to reserve empty layout space.
- Document which geometry props each shape honors; for example, box supports `depth`, while radial shapes do not.
- Provide a scene diagnostics mode that draws group bounds, measured footprints, connection ports, and node IDs.
- Allow the floor grid, mirror, shadows, and floor captions to be disabled independently for large dashboards.

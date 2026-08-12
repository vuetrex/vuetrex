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

### Camera framing is fixed

The overview camera is hard-coded rather than fit to measured scene bounds. Large scenes have to tune a top-level
`scale` manually. A `fit="contain"`/`fit="cover"` mode with padding would make examples robust across aspect ratios and
node counts.

Node focus also uses the selected object's local position. For deeply nested groups, camera targeting should use
`getWorldPosition()`.

### Labels are hard to manage at architecture scale

Floor captions become small and can overlap connectors. Face labels work well on boxes, but there is no label
background, billboard label, truncation policy, visibility threshold, or screen-space sizing. Cylinders also need
purpose-built label placement rather than the generic planar face label.

### Built-in geometry is too generic for infrastructure diagrams

Boxes, cylinders, and wedges convey the major categories, but the load balancer, Kubernetes pods, Redis, ZooKeeper,
message queues, and platform boundaries are only approximations. `Cylinder.modelGen()` currently does not use its
declared `height`, which limits metric-driven database/tower visuals.

### Connector routing still needs hardening

- Orthogonal routes have no obstacle avoidance, port selection, lane allocation, or edge-specific elevation.
- Direction is not visually explicit.
- Dense fan-out creates overlapping segments with no shared-bus representation.

## Proposed connector additions

### 1. `arrow` renderer

Highest priority. Add a low-cost directional renderer with per-edge props:

```vue

<connector
    from="gateway"
    to="api-auth"
    type="arrow"
    color="0x44aaff"
    width="0.025"
    :opacity="0.9"
    dash="0.12 0.08"
    end-cap="arrow"
/>
```

It should support `start`, `end`, and `both` direction markers, dashed status lines, and reactive color/opacity/width.

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

- Make the `camera` watcher immediate or apply the initial camera value during mount.
- Expose a public `fitToContent({ padding, duration })` method.
- Add stable node keys/IDs separate from display names and reject duplicate names in development.
- Add `visible`, `disabled`, and `participatesInLayout` props to nodes.
- Add an official way to reserve empty layout space.
- Document which geometry props each shape honors; for example, box supports `depth`, while radial shapes do not.
- Provide a scene diagnostics mode that draws group bounds, measured footprints, connection ports, and node IDs.
- Allow the floor grid, mirror, shadows, and floor captions to be disabled independently for large dashboards.

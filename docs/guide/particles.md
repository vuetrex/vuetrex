---
title: Data-driven particles
description: Build path flows, object clouds, and extensible particle simulations with immutable fluent graphs.
outline: deep
---

# Data-driven particles

Particle effects use the same authored-graph pattern as procedural geometry. `particles.*` creates an immutable
`ParticleSource`; one `<vx-particles>` node compiles and animates it. Functional operators and fluent methods create
the same graph and can be mixed freely.

```vue
<script setup lang="ts">
import { particles } from '@exceeder/vuetrex'

const requests = particles.path([
  [-3, 0.2, 0],
  [-1, 0.8, 0.4],
  [1, 0.4, -0.2],
  [3, 0.7, 0],
], {
  count: 180,
  spread: 0.035,
  seed: 'requests',
})
  .appearance({
    color: 0x39c6ff,
    size: 0.075,
    opacity: ({ random }) => 0.45 + random * 0.5,
  })
  .motion({ speed: 1.2, turbulence: 0.025 })
  .named('request-flow')
</script>

<template>
  <vx-particles :graph="requests" anchor="origin" />
</template>
```

The built-in CPU backend uses one soft-point shader batch per compatible appearance. Particle positions and attributes
live in buffers; particles are not Vue nodes.

## Several data-bound paths

Use `particles.paths()` when each route corresponds to a metric or domain item. `count` receives a context containing
`item`, `key`, `index`, and `emitterIndex`, while
appearance and motion fields receive a stable particle context containing `item`, `index`, `emitterIndex`, `random`,
and `phase`.

```ts
const routes = services.map((service, index) => ({
  key: service.id,
  item: service,
  points: [service.source, [0, 1 + index * 0.1, 0], service.target],
}))

const traffic = particles.paths(routes, {
  count: ({ item }) => Math.round(item.requestsPerSecond / 5),
  spread: ({ item }) => item.errorRate * 0.1,
})
  .appearance({
    color: ({ item }) => item.healthy ? 0x3cc9ff : 0xff5b65,
    size: ({ item }) => 0.05 + item.latencyMs / 8000,
    opacity: ({ random }) => 0.55 + random * 0.4,
  })
  .motion({
    speed: ({ item }) => 0.4 + item.requestsPerSecond / 300,
  })
```

Path motion uses world units per second. Standalone paths default to `interpolation: 'catmull-rom'` for a smooth
centripetal spline. Use `interpolation: 'linear'` on `particles.path()` or `particles.paths()` to follow the supplied
segments exactly, including sharp corners. Motion advances by distance, so unequal segment lengths do not change
particle speed. Set `closed: true` to include the closing segment back to the first point.
`distribution: 'even'` spaces particles along a path, while `'random'` creates a seeded irregular flow.

Connector `.flow()` defaults path emitters to linear interpolation because the connector router has already shaped
the route. This preserves orthogonal corners and keeps particles on the same path as the stroke. An explicit
`interpolation: 'catmull-rom'` opts back into smoothing. For a thin additive trace:

```ts
const flow = connectors.edge('source', 'target')
  .route({ strategy: 'orthogonal', elevation: 0, lane: 0 })
  .flow(route => particles.path(route.points, {
    interpolation: 'linear',
    count: Math.round(route.totalLength * 1000),
    spread: 0.005,
  })
    .appearance({ size: 0.018, opacity: 0.28, color: 0xa8f5ff, blending: 'additive' })
    .motion({ speed: 0.5 }))
```

Import `connectors` and `particles` from `@exceeder/vuetrex`. With zero spread the particle centers stay exactly on
the route; a small nonzero spread adds sparkle around it. TabA uses this graph API, with density expressed as
`count: Math.round(route.totalLength * 1000)` and spread configured on the particle source.
For particle-only connections, set `.stroke({ opacity: 0, markerEnd: false })`; a fully transparent stroke allocates
no mesh and cannot occlude particles.

## Clouds around scene objects

A cloud target can be a local `[x, y, z]` position or the ID of another Vuetrex node. Named targets are resolved every
frame, so the cloud follows a moving object. With `radius: 'bounds'`, the cloud derives its ellipsoid from that object's
current bounds.

```ts
const databaseHalo = particles.cloud('database', {
  count: 420,
  radius: 'bounds',
  distribution: 'surface',
  seed: 'database-halo',
})
  .appearance({ color: 0x69d7ff, size: 0.06, opacity: 0.5 })
  .motion({
    turbulence: 0.035,
    turbulenceScale: 1.8,
    orbit: { axis: [0, 1, 0], speed: 0.18 },
  })
```

Use `particles.clouds()` for several targets with independent keys, items, and radii. Cloud shapes are `sphere` and
`box`; distribution can fill the volume or stay on the surface.

## Basic forces

`.simulate()` enables stateful motion. The CPU backend supports gravity, attractors, vortices, drag, and a bounded
per-frame integration step.

```ts
const orbiting = particles.cloud('gateway', { count: 260, radius: 1.2 })
  .motion({ velocity: ({ random }) => [0, random * 0.08, 0] })
  .simulate({
    backend: 'auto',
    drag: 0.08,
    maxDelta: 0.04,
    forces: [
      { type: 'attractor', target: 'gateway', strength: 0.16, radius: 3 },
      { type: 'vortex', center: 'gateway', axis: [0, 1, 0], strength: 0.28, radius: 3 },
    ],
  })
```

For standalone `<vx-particles>`, `auto` selects the built-in CPU backend. Connector `.flow()` output automatically
uses GPU-evaluated motion for linear paths with speed and spread. A static route texture preserves full XYZ segments,
constant travel speed, sharp corners, closed paths, and wrapping; frames update only a clock uniform. Appearance fields,
fog, and selected bloom are retained. Picking evaluates current positions on demand, and bounds conservatively cover
the entire path plus spread.

Explicit smoothing, velocity offsets, turbulence, orbit, stateful simulation, and paths exceeding 65,535 input vertices
continue on the CPU. A joined flow can use GPU paths alongside CPU emitters. Explicit `backend: 'cpu'` or a registered
backend takes precedence for the entire joined program. CPU simulation is intended for modest effects, not hundreds
of thousands of stateful particles.

## FBO and custom GPU backends

The graph does not expose render textures, texel layouts, or shader passes. Those belong to an execution backend. This
keeps authored effects portable: an FBO backend can interpret the same emitters, fields, motion, and force declarations
without changing components.

Register a backend once, then select it in a graph:

```ts
import { registerParticleBackend } from '@exceeder/vuetrex'

registerParticleBackend('fbo', (program, context) => new MyFboParticleBackend(program, context))

const largeMetricField = source.simulate({ backend: 'fbo' })
```

A backend owns one Three.js `object`, implements `update()`, reports local bounds and particle hits, and disposes its
GPU resources. The built-in backend includes the connector path optimization above; `cpu` remains the only built-in
explicit backend name; requesting an unregistered backend fails with an actionable error rather
than silently falling back.

## Reusable effects and composition

`defineParticles()` packages a parametrized effect. `defineParticleOutputs()` exposes several named sources. Module
outputs remain ordinary `ParticleSource` values, so all fluent methods remain available.

```ts
import { defineParticles, particles } from '@exceeder/vuetrex'

const halo = defineParticles<{ target: string; color: number }>('halo', p =>
  particles.cloud(p.target, { count: 240, radius: 'bounds' })
    .appearance({ color: p.color, size: particles.param('size', 0.06) })
    .motion({ turbulence: 0.03 }),
)

const effects = halo({ target: 'api', color: 0x4bc8ff })
  .join(halo({ target: 'worker', color: 0xa783ff }))
  .named('service-halos')
```

Pass parameter values without rebuilding the graph:

```vue
<vx-particles
  :graph="effects"
  :parameters="{ size: selected ? 0.1 : 0.06 }"
  :paused="paused"
  :time-scale="1"
  :interactive="false"
/>
```

Available fluent methods are `appearance`, `motion`, `simulate`, `named`, `join`, and `pipe`. Their functional forms
are available on the `particles` namespace.

Particle systems are non-interactive by default so a dense cloud does not steal pointer hits from diagram objects.
Set `interactive` to receive node events and expose the hit particle as `event.vxInstance`.

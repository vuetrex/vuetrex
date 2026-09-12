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

Use `particles.paths()` when each route corresponds to a metric or domain item. `count` receives the route item, while
appearance and motion fields receive a stable particle context containing `item`, `index`, `emitterIndex`, `random`,
and `phase`.

```ts
const routes = services.map((service, index) => ({
  key: service.id,
  item: service,
  points: [service.source, [0, 1 + index * 0.1, 0], service.target],
}))

const traffic = particles.paths(routes, {
  count: service => Math.round(service.requestsPerSecond / 5),
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

Path motion uses world units per second. Paths use centripetal Catmull–Rom interpolation; set `closed: true` for loops.
`distribution: 'even'` spaces particles along a path, while `'random'` creates a seeded irregular flow.

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

`auto` currently selects the built-in CPU backend. CPU simulation is intended for modest effects, not hundreds of
thousands of stateful particles.

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
GPU resources. Vuetrex ships only `cpu` today; requesting an unregistered backend fails with an actionable error rather
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

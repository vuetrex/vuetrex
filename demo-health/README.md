# Vuetrex health fixture

A deterministic cluster simulator for developing live Vuetrex visualizations. It models 20 deployments, 46 pods,
service relations, Kubernetes-style lifecycle events, and deployment/pod metrics without requiring Kubernetes or an
observability stack.

The simulation is a pure function of time and scenario. Seeking to the same `t` always produces the same snapshot,
which makes visual and layout behavior reproducible.

## Run

From the repository root:

```sh
pnpm health:server
```

The server listens on <http://127.0.0.1:4100>. Set `HEALTH_HOST` or `HEALTH_PORT` to override the bind address.

With the repository Vite server running, a small five-deployment research client is available at
<http://127.0.0.1:5173/demo-health/v-ui/>. Its transport, scene-model, and visual component layers are kept separate so
it can serve as a starting point for contextual composition experiments. Each displayed deployment also has a
deterministic procedural signature: its service identity selects the motif while live replica and metric values shape
the generated detail, color, and variation.

## Visual grammar

The research client applies the hierarchy from [Designing legible data scenes](../docs/guide/visual-design.md): the
platform, wall, grid, and ordinary materials stay neutral so live topology and health remain the strongest signals.
Cyan means healthy or active, amber is reserved for degraded state, and coral is reserved for unavailable or critical
state. Request rate changes particle velocity while status changes route role and color, so the same metric is not
encoded twice without purpose.

The connector graph demonstrates the public fluent API instead of maintaining a demo-only routing layer. Healthy
gateway traffic is a keyed `bus` with shared ground-level structure. Other healthy relations are keyed `edges`, use
explicit or automatic ports, follow the `ground` profile, and may share protocol bundles. Degraded and unavailable
relations switch to the `air` profile with elevated Bézier or spline routes, making exceptional traffic visibly cross
the normal orthogonal network. Every route uses stable `underlay` and `shaft` decoration keys, semantic names and
metadata, an end marker, and an additive particle flow compiled from the resolved traversal.

Connectors are interactive. Selecting a shaft, marker, bundle, or particle opens an inspector with its semantic route
key, resolved source name, actual world-space hit point, normalized path progress, and bundle membership where
applicable. This keeps the same resolved network useful for rendering, motion, and picking. Shadows are enabled by
default in the demo; a cool directional key, warm opposing rim, restrained hemisphere fill, progressive lightmap, and
wall contact shadow provide depth without making the environment compete with the data.

## Timeline control

`PUT /state` patches the control state. Supported fields are:

| Field | Type | Meaning |
|---|---|---|
| `t` | number | Simulation time in seconds, from 0 to 86400. |
| `playing` | boolean | Whether wall-clock ticks advance simulation time. |
| `rate` | number | Simulation seconds per wall-clock second, from 0.1 to 20. |
| `scenario` | string | `normal`, `traffic-spike`, `zone-outage`, or `memory-leak`. |

Rewind and run startup from the beginning:

```sh
curl -X PUT http://127.0.0.1:4100/state \
  -H 'content-type: application/json' \
  -d '{"t":0,"playing":true,"rate":1,"scenario":"normal"}'
```

Pause at the beginning of the checkout incident:

```sh
curl -X PUT http://127.0.0.1:4100/state \
  -H 'content-type: application/json' \
  -d '{"t":120,"playing":false,"scenario":"traffic-spike"}'
```

Changing `t` or `scenario` is a discontinuity. Connected event streams receive a `reset` event containing the new
control state and a complete snapshot. Changing only `playing` or `rate` emits a `state` event.

## Data endpoints

- `GET /catalog` returns stable deployment definitions, service relations, and scenario metadata.
- `GET /snapshot` returns the complete system representation at the current time.
- `GET /events?since=-1&until=120` returns deterministic event history in `(since, until]`.
- `GET /state` returns timeline controls and available scenarios.
- `GET /healthz` is a small liveness response.

All endpoints allow cross-origin requests so the Vite demo can consume the fixture directly.

## Streams

The server uses Server-Sent Events so a browser client does not need a WebSocket library:

```js
const stream = new EventSource('http://127.0.0.1:4100/stream')

stream.addEventListener('reset', event => {
  const { state, snapshot } = JSON.parse(event.data)
  replaceSystemState(snapshot)
  setTimelineState(state)
})

stream.addEventListener('event', event => {
  applyLifecycleEvent(JSON.parse(event.data))
})

stream.addEventListener('metrics', event => {
  applyMetricSample(JSON.parse(event.data))
})
```

Three stream endpoints are available:

- `GET /stream` combines state, reset, lifecycle event, and metric messages.
- `GET /stream/events` emits state, reset, and lifecycle event messages.
- `GET /stream/metrics` emits metric samples only.

Each new combined or event connection begins with a `reset` event, so clients can initialize from one message. A metric
connection begins with the current metric sample.

## Timeline

The normal scenario creates two deployments every four seconds. Their pods move through creation, scheduling, startup,
and readiness independently. The complete 20-deployment system is ready around `t=60`.

Incident scenarios share the same startup and introduce their disturbance at `t=120`:

- `traffic-spike` stresses checkout dependencies and temporarily crashes a payments pod.
- `zone-outage` removes zone B pods and later brings them back with restart counts.
- `memory-leak` grows recommendation memory until one pod is OOM-killed and restarted.

The scenario definitions are deliberately isolated in `simulation.mjs`, leaving room for additional incident overlays,
topology mutations, and event types without changing the HTTP or stream contracts.

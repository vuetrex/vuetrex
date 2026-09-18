---
title: Composition recipes
description: Separate data selection, aggregation, arrangement, and scene output from Vue representation components.
outline: deep
---

# Composition recipes

## The problem: the template starts deciding everything

Suppose a health stream contains services, pods, metrics, and links. One view should compare deployments in a row.
Another should place them around a topology ring. During an incident, stopped services should disappear and unhealthy
ones should become more prominent.

All of that can be written with computed values and `v-if`, but eventually four different decisions become tangled:

- Which records belong in this view?
- What summary should each visible item represent?
- Where should those items go?
- What node IDs, links, and labels should Vue receive?

A **representation recipe** puts those decisions in one small data transformation. It does not render Vue components or
create Three.js objects.

![A service health scene composed from data](/composability-health-lab.png)

## Do not begin with a recipe

For a small scene, this is enough:

```vue
<vx-row>
  <ServiceNode
    v-for="service in activeServices"
    :key="service.id"
    :service="service"
  />
</vx-row>
```

Add a recipe when the selection and spatial rules need to be reused, tested, generated, or changed independently from
`ServiceNode`.

## Read the recipe as four questions

```text
stream snapshot
      |
      v
  select      What belongs in this view?
      |
  aggregate   What does each visible item mean?
      |
  arrange     Where does each item belong?
      |
  emit        What semantic scene records should Vue receive?
```

The formal interface follows that reading:

```ts
interface RepresentationRecipe<T, Selected, Aggregated, Emitted> {
  select(data: T, context: CompositionContext): Selected
  aggregate(data: Selected, context: CompositionContext): Aggregated
  arrange(data: Aggregated, context: SpatialContext): Placement[]
  emit(data: Aggregated, placements: Placement[]): SceneFragment<Emitted>
  capabilities: Capability[]
}
```

## Build one recipe

Start with a snapshot that contains services and their links:

```ts
interface Service {
  id: string
  status: 'healthy' | 'degraded' | 'stopped'
  pods: Array<{ id: string; requests: number; latencyMs: number }>
}

interface SystemSnapshot {
  services: Service[]
  links: Array<{ id: string; from: string; to: string }>
}

interface ServiceSummary extends Service {
  requestRate: number
  maxLatency: number
}

interface PreparedSnapshot {
  services: ServiceSummary[]
  links: SystemSnapshot['links']
}
```

Now answer the four questions:

```ts
import {
  aggregate,
  compose,
  connect,
  encode,
  filter,
  label,
  ring,
  type RepresentationRecipe,
} from '@exceeder/vuetrex'

export const serviceRecipe = {
  select(snapshot) {
    const services = filter(
      snapshot.services,
      service => service.status !== 'stopped',
    )
    const visibleIds = new Set(services.map(service => service.id))
    const links = snapshot.links.filter(link =>
      visibleIds.has(link.from) && visibleIds.has(link.to),
    )
    return { services, links }
  },

  aggregate(snapshot) {
    return {
      ...snapshot,
      services: snapshot.services.map(service => ({
        ...service,
        requestRate: aggregate(
          service.pods,
          (sum, pod) => sum + pod.requests,
          0,
        ),
        maxLatency: aggregate(
          service.pods,
          (maximum, pod) => Math.max(maximum, pod.latencyMs),
          0,
        ),
      })),
    }
  },

  arrange(snapshot, context) {
    return ring(snapshot.services, context, {
      radius: 3,
      startAngle: -Math.PI / 2,
      faceCenter: true,
    })
  },

  emit(snapshot, placements) {
    let fragment = encode(snapshot.services, placements, {
      id: service => service.id,
      representation: 'architecture/service',
      props: service => ({ status: service.status }),
    })
    fragment = connect(fragment, snapshot.links)
    return label(fragment, node => node.data.id)
  },

  capabilities: [
    { type: 'select', target: 'node' },
    { type: 'focus', target: 'node' },
    { type: 'restart', target: 'node' },
  ],
} satisfies RepresentationRecipe<
  SystemSnapshot,
  SystemSnapshot,
  PreparedSnapshot,
  ServiceSummary
>
```

Execute it from a computed value:

```ts
import { connectors, particles } from '@exceeder/vuetrex'

const scene = computed(() => compose(serviceRecipe, snapshot.value, {
  time: timeline.value,
  selectedId: selectedId.value,
}))

const connectorGraph = computed(() => connectors
  .edges(scene.value.fragment.connections, {
    keyBy: ({ item: connection }) => connection.id,
    from: ({ item }) => item.from,
    to: ({ item }) => item.to,
  })
  .route({ strategy: 'direct' })
  .flow(route => particles
    .path(route.points, { key: route.key, item: route.item })
    .motion({ speed: 0.6 })))
```

`compose()` returns plain data. There are no meshes or component instances in the result, so it can be unit tested or
inspected without WebGL.

## Let Vue realize the plan

```vue
<vx-group name="services" id="services">
  <vx-group
    v-for="node in scene.fragment.nodes"
    :key="node.id"
    :name="node.id" :id="node.id"
    :placement="node.placement"
  >
    <ServiceNode :service="node.data" />
  </vx-group>

  <vx-connectors :graph="connectorGraph" />
</vx-group>
```

One host reconciles the complete keyed connection collection; it does not create a layout child or semantic scene node
per relation.

This division is the important part:

| Layer | Responsibility |
|---|---|
| Recipe | Select, summarize, arrange, and describe semantic records |
| Vue component | Decide what one service looks like |
| Vuetrex | Synchronize the logical tree with Three.js |

Changing the ring to a sphere does not change `ServiceNode`. Redesigning `ServiceNode` does not change stream
aggregation.

## A placement moves a whole subtree

Every arrangement operator returns one placement per item:

```ts
interface Placement {
  position: Vector3
  orientation: Quaternion
  scale: Vector3
  visibility?: boolean
  lod?: number
}
```

Pass a placement to a `<vx-group>`. That group opts out of its parent's automatic layout and applies the transform in
the parent's local coordinate space. Its descendants can still contain normal rows, stacks, panels, and rings.

`lod` is reserved in the data contract but does not currently change rendering.

## Make arrangement respond to context

The same service component can support several questions:

```ts
import { ring, row, timeline } from '@exceeder/vuetrex'

arrange(snapshot, context) {
  switch (context.parameters?.pattern) {
    case 'comparison':
      return row(snapshot.services, context, { gap: 1.8 })
    case 'history':
      return timeline(snapshot.services, context, { gap: 1.1, rise: 0.08 })
    default:
      return ring(snapshot.services, context, { radius: 3 })
  }
}
```

Context is deliberately small: `time`, `selectedId`, an optional local `origin`, and application-defined `parameters`.
It carries view state without coupling an operator to a store or component instance.

## Reuse familiar reducers

`aggregate()` follows `Array.reduce`: it accepts items, a reducer, and an initial value. Existing domain reducers fit
naturally here.

```ts
const worstLatency = aggregate(
  pods,
  (maximum, pod) => Math.max(maximum, pod.latencyMs),
  0,
)
```

Use `groupBy()` when the visible object is a group rather than an incoming record:

```ts
const deployments = groupBy(pods, pod => pod.deploymentId)
```

The recipe can place deployments while a nested component still renders their individual pods.

## Keep connector ownership semantic

A leaf component should not normally discover global links. The recipe emits which semantic nodes connect; the parent
scene chooses whether those links use particles, lines, direct routing, or orthogonal routing.

This also prevents links from changing layout: connection records are independent from visible node records.

## Understand the operator vocabulary

| Phase | Operators | Result |
|---|---|---|
| Select and summarize | `filter`, `groupBy`, `aggregate` | Items, groups, summaries |
| Arrange | `row`, `stack`, `ring`, `sphere`, `timeline`, `radialFocus` | `Placement[]` |
| Emit | `encode`, `connect`, `bundleBy`, `label` | `SceneFragment` |

The operators are regular typed functions, not a closed language. A domain-specific arrangement can call a built-in
operator and then adjust its placements.

```ts
function incidentSphere<T>(items: readonly T[], severity: (item: T) => number) {
  return sphere(items, {}, { radius: 4 }).map((placement, index) => {
    placement.scale.multiplyScalar(1 + severity(items[index]) * 0.35)
    return placement
  })
}
```

## Capabilities describe intended actions

Capabilities use a compact vocabulary: `select`, `inspect`, `focus`, `restart`, `pause`, and `animate`. They let a
toolbar, inspector, or machine-authored composition discover intended actions without exposing every floating-point
geometry parameter.

Capabilities are metadata, not authorization. The application still decides whether a user may perform the action and
how it reaches the underlying system.

## Scale composition by level

Do not create one recipe that knows every coordinate in a large scene. Compose by semantic level:

```text
system recipe
  -> region component
       -> service layout or recipe
            -> ServiceNode
                 -> panel and metric markers
                 -> vx-instances for repeated pods
```

Each level consumes meaningful data, creates a local spatial relationship, and preserves stable IDs. The next chapter
applies that model to [large scenes and instancing](/guide/large-scenes).

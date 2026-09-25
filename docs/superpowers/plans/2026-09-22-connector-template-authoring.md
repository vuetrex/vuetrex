---
title: Connector Template Authoring and Component Ports
description: Proposal for local and central connector declarations, extensible component ports, and future interactive editing.
outline: deep
---

# Connector template authoring and component ports

**Status:** Implemented for template authoring, component ports, presentation, and the public read/identity boundary. Interactive editing and visible port handles remain future work. This document supersedes the authoring contract in the [fluent connector graph plan](2026-09-12-fluent-connector-graph.md). See the [connections guide](../../guide/connections-and-focus.md) for working examples.

**Goal:** Let scene authors describe a few relationships and their appearance where they can see them in a Vue template, while keeping an immutable `ConnectorSource` for data-driven graphs. Let component authors expose stable, useful connection points on composite models, and let scene authors extend those points without modifying the component.

There are no external consumers to preserve. Prefer one clear new contract over compatibility adapters for the current connector syntax.

## The authoring model

All three forms lower to the same keyed connector records and use the existing resolver and appearance backends:

| Form | Use it for | Owner |
| --- | --- | --- |
| `<vx-edge>` inside a spatial node | A few outgoing relationships that are part of a scene composition | The edge declaration, scoped to its source node |
| `<vx-connectors>` with `<vx-edge>` children | A small, explicit wiring diagram with shared presentation | One connector host |
| `<vx-connectors :graph="source">` | Collections, algorithms, generated edges, and reusable graph modules | One connector host |

These are alternative inputs to the same compiler. `vx-edge` is a lifecycle-only declaration, never a spatial `Node` or Three.js object. A large graph should still use one `:graph` host, with no Vue child per record.

### Local declarations

```vue
<vx-box id="source">
  <vx-edge key="source-target" from="source.right" to="target.left" />
</vx-box>
<vx-box id="target" />
```

The nearest **direct spatial parent** supplies the source node when `from` is omitted. That node must have an explicit semantic `id`; generated renderer IDs are not a stable public address. To select one of its named ports, write the full endpoint, such as `from="source.right"`. An explicit `from` on a local edge must address its parent node; a mismatch is an error. The edge's `key` is required. Its lifetime follows its declaration: removing the box removes the local edge.

`vx-edge` may be a direct child of a fixed `MeshNode`, including `vx-box`, or of a `GroupNode`. Fixed mesh nodes accept declaration children, including ports and edges, but still reject spatial/visual children. Use a `vx-group`, `vx-stack`, or another spatial container for actual geometry nesting. Neither a port nor an edge enters `elements`, changes layout, contributes to bounds, or becomes a Three.js child.

The same declaration-child rule applies to other addressable spatial hosts such as `vx-geometry`, `vx-instances`, and `vx-panel`. Their existing spatial-child policy remains separate: a host that is not a container does not become one merely because it accepts declarations. Raw `vx-*` hosts have Vue-rendered children; named `#ports` and `#connections` slots are features of a Vue component that explicitly forwards those children.

### Central declarations

```vue
<vx-connectors scope="utilities" appearance="utility-line"
               route-strategy="orthogonal" :clearance="0.25">
  <vx-edge key="cafe-water" from="cafe.waterMain" to="pump.outlet" />
  <vx-edge key="cafe-power" from="substation.feed" to="cafe.electrical" />
</vx-connectors>
```

Here `from` and `to` are required on every child edge. The host collects its direct declaration children, compiles them as one source, and reconciles by their keys. Vue `v-for` and `v-if` work on those children. The host does not depend on its location among spatial siblings.

### Data-driven declarations

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { connectors } from '@exceeder/vuetrex'

const graph = computed(() => connectors.edges(links.value, {
  keyBy: 'id',
  from: ({ item }) => ({ node: item.from, port: { name: item.fromPort } }),
  to: ({ item }) => ({ node: item.to, port: { name: item.toPort } }),
}))
</script>

<template>
  <vx-connectors scope="network" :graph="graph" appearance="network-link" />
</template>
```

A host accepts **either** `:graph` **or** `<vx-edge>` children. Supplying both is an error, preventing accidental duplication and unclear precedence. Multiple hosts and local edges may coexist in one stage. Their public edge handles are `(scope, key)` pairs; a host's explicit `scope` is stable across remounts, and a local edge uses its source node ID as scope. Duplicate keys within a scope are errors.

## Ports belong to spatial nodes

Every `vx-port` is a declaration attached to one spatial owner. A component's Vue instance is not an endpoint: its root spatial node is. The owner has an explicit semantic ID, and each port has a unique name within that owner. An endpoint is internally the unambiguous pair `{ node: 'cafe', port: { name: 'mainDoor' } }`.

In a template, a literal `from` or `to` string uses `nodeId` for the existing node-level automatic port, or `nodeId.portName` for a specific named or built-in port. For example, `to="node2.input"` addresses exactly the `input` port on `node2`; `to="node2"` does **not** select `input` merely because that is the only declared port. An unknown or disabled named port leaves the edge unresolved with a diagnostic. A string endpoint may contain at most one dot, with nonempty parts on both sides; malformed strings fail during declaration validation. IDs and port names containing a dot cannot use this shorthand. Bind the structured endpoint instead: `:to="{ node: 'district.node2', port: { name: 'input' } }"`. Dynamic IDs and port names use the same bound form. The template API does not also provide `from-port` or `to-port`: two parallel spellings would create conflicting values and unnecessary precedence rules. Both forms lower to the same structured endpoint record; `ConnectorSource` keeps structured endpoints.

Two placement modes cover common cases:

```vue
<!-- Exact position and normal in the owner's local coordinates. -->
<vx-port name="mainDoor" :position="[0, 0.15, 1.2]" :normal="[0, 0, 1]" />

<!-- Convenient point on an owner face; at is normalized within that face. -->
<vx-port name="service" face="left" :at="[0.5, 0.3]" />
```

`position` and `normal` must be supplied together. `face` and `at` are mutually exclusive with that pair. `face` computes an outward normal; it must not infer a diagonal normal from the center of a world axis-aligned bounding box. Exact local ports move and rotate with their owner's world transform; normals use the inverse-transpose normal transform and are normalized after transformation. If the model changes proportions, the component recalculates its local port positions from the same props that build its geometry. Face ports use the owner's **untransformed local bounds** before the world transform. Zero-size bounds, zero normals, missing owners, and invalid coordinate combinations produce useful development errors.

For face ports, `at` uses two coordinates in `[0, 1]`, defaulting to `[0.5, 0.5]`. They increase along local `(x, y)` on front/back, `(z, y)` on left/right, and `(x, z)` on top/bottom. Each face's normal is the corresponding positive or negative local axis. These rules are independent of camera orientation; rotated components keep the same local port definitions. Explicit local ports may be placed slightly beyond a model's surface, for example on a protruding door frame or pipe fitting, without clamping to its bounds.

The port registry is keyed by `(owner ID, port name)`. A port declaration has no independent scene ID. Its insertion, replacement, movement, disabling, and removal invalidate only dependent connector routes. Missing ports leave edges authored and report an unresolved reason; they do not silently fall back to the node center.

### A reusable cafe component

The component author chooses semantic port names and places them on the model. A single spatial root makes its identity and coordinate system explicit:

```vue
<!-- Cafe3D.vue; geometry is abbreviated -->
<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = defineProps<{ width: number; depth: number }>()
</script>

<template>
  <vx-group v-bind="$attrs">
    <vx-geometry :graph="cafeGeometry" />

    <vx-port name="mainDoor" :position="[0, 0.1, props.depth / 2]"
             :normal="[0, 0, 1]" />
    <vx-port name="backDoor" :position="[0, 0.1, -props.depth / 2]"
             :normal="[0, 0, -1]" />
    <vx-port name="sewer" :position="[-props.width / 3, -0.3, -props.depth / 2]"
             :normal="[0, 0, -1]" />
    <vx-port name="waterMain" :position="[props.width / 3, -0.25, -props.depth / 2]"
             :normal="[0, 0, -1]" />
    <vx-port name="electrical" :position="[-props.width / 2, 0.4, 0]"
             :normal="[-1, 0, 0]" />
    <vx-port name="internet" :position="[props.width / 2, 0.4, 0]"
             :normal="[1, 0, 0]" />

    <slot name="ports" />
    <slot name="connections" />
  </vx-group>
</template>
```

The scene author gives the component an ID and connects to its public ports:

```vue
<Cafe3D id="cafe" :width="3" :depth="2">
  <template #ports>
    <vx-port name="delivery" :position="[1, 0.1, 1]" :normal="[0, 0, 1]" />
  </template>
  <template #connections>
    <vx-edge key="cafe-router" from="cafe.internet" to="router" />
  </template>
</Cafe3D>

<vx-connectors scope="service-lines" appearance="buried-utility">
  <vx-edge key="water-to-cafe" from="pump" to="cafe.waterMain" />
  <vx-edge key="network-to-cafe" from="router" to="cafe.internet" />
</vx-connectors>
```

The two named Vue slots are extension points. Their content is rendered as **direct children of the root spatial host**. The component's default slot remains available for visual composition if the component author wants it; a fixed mesh component can expose only declaration slots. A scene author cannot inject a port through a component that does not forward a slot to the intended spatial owner.

Caller additions use new names by default. To deliberately change a built-in port, the caller writes `<vx-port name="mainDoor" override ... />`; without `override`, duplicate names fail. `<vx-port name="sewer" override disabled />` makes an unwanted built-in port unavailable and causes references to it to report `disabled port`. At most one override per name is allowed. The override rule is independent of Vue child order, so slot placement does not decide which declaration wins. Component authors should document which names and directions are part of their public contract; direction labels such as `in`, `out`, or `bidirectional` are optional metadata for validation and interactive tools, not routing geometry.

The disabling form is the only port declaration that needs no position or face. An override must refer to a built-in name on the same owner; it cannot silently create a new port if the component changes. Components that do not offer `#ports` can still publish fixed ports, but consumers cannot change them from outside the component through slots.

### Adapting a supplied component through a wrapper

Suppose a library supplies `GeoNode`, and a scene author creates `TransformNode` to translate, rotate, and scale it while adding two connection points. The wrapper forwards identity and the `#ports` slot to `GeoNode`'s root, and applies the transform through a parent group:

```vue
<!-- TransformNode.vue -->
<script setup lang="ts">
import type { Placement } from '@exceeder/vuetrex'
import GeoNode from './GeoNode.vue'

defineOptions({ inheritAttrs: false })
defineProps<{ placement: Placement }>()
</script>

<template>
  <vx-group :placement="placement">
    <GeoNode v-bind="$attrs">
      <template #ports><slot name="ports" /></template>
    </GeoNode>
  </vx-group>
</template>
```

```vue
<TransformNode id="transform-1" :placement="transformPlacement">
  <template #ports>
    <vx-port name="translation" :position="[0, 0, 0.5]" :normal="[0, 0, 1]" />
    <vx-port name="rotation" :position="[0.5, 0, 0]" :normal="[1, 0, 0]" />
  </template>
</TransformNode>
```

Both ports belong to `transform-1`, the ID passed through to `GeoNode`'s spatial root. The wrapper group contributes the world transform; no manually transformed port coordinates are needed. A wrapper can instead introduce its **own** ID-bearing root and ports when it intends to expose the whole assembly as a new endpoint. That is a different, explicit public identity. Nested `GeoNode` ports do not automatically merge into the wrapper's port namespace.

If `GeoNode` does not offer a forwarding `#ports` slot, the wrapper cannot insert declarations into its root by ordinary Vue slot composition. It can expose ports on its own surrounding `vx-group` and connect to that group, or the component API must be extended. This limitation should be taught plainly rather than hidden behind component-instance traversal.

### Applying this to the workshop `VNode`

The current `workshops/workshop1/things/VNode.vue` has a single `<vx-stack>` root and three visual slabs. It accepts an `id` on the Vue component, but it exposes no slot for caller declarations. Its author can make the stack the public endpoint without changing the slab layout:

```vue
<!-- Relevant changes inside VNode.vue -->
<vx-stack v-bind="$attrs" :gap="0.02">
  <!-- existing footer, body, and header boxes -->
  <vx-port name="input" face="left" :at="[0.5, 0.5]" />
  <vx-port name="output" face="right" :at="[0.5, 0.5]" />
  <slot name="ports" />
  <slot name="connections" />
</vx-stack>
```

The component should disable implicit attribute inheritance when it explicitly binds `$attrs`, so the caller's `id` reaches exactly this stack. A caller may then add a port and a local edge, while still keeping unrelated connections in a central block:

```vue
<VNode id="camera" header="Camera">
  <template #ports>
    <vx-port name="trigger" face="front" :at="[0.5, 0.8]" />
  </template>
  <template #connections>
    <vx-edge key="camera-config" from="camera.output" to="config.input" />
  </template>
</VNode>
<VNode id="config" header="Config" />
<vx-connectors scope="workshop" appearance="secondary">
  <vx-edge key="config-camera" from="config.output" to="camera.trigger" />
</vx-connectors>
```

The declared ports are on the stack's overall local bounds, not on any one slab. If a connection must meet the header slab specifically, the component should name a header port and place it from the header's geometry or expose the header box as its own documented endpoint. This avoids making callers guess which child box owns a connection.

## Presentation belongs in the template

The fluent graph remains good for semantic data and data-dependent exceptions. The host and edge declarations take route and appearance props for scene-level presentation:

```vue
<vx-connectors :graph="graph" scope="links" appearance="primary"
               route-strategy="orthogonal" :clearance="0.3"
               stroke-color="#ffffff" :stroke-width="0.025"
               marker-end="arrow" />
```

The same props are accepted by a local `<vx-edge>` and a child edge inside a central host. A host's values are defaults for its children. Presentation resolves in this order:

1. Backend defaults.
2. Named connector appearance from `VxStyleSheet`.
3. Host presentation props.
4. Individual edge props or explicit per-record fields in a `ConnectorSource`.

Only defined properties override earlier layers; removing a prop restores the earlier value. A named appearance contains strokes and marker presentation, plus optional route defaults, and follows the stylesheet's existing common/light/dark scheme. It is independent of mesh material names. Styling updates must not rebuild unchanged topology or route points. A graph can still use `.route()`, `.stroke()`, `.flow()`, and `.geometry()` for data-driven behavior or advanced effects. Template props apply as defaults, so a deliberately authored per-record field wins.

The host is not a DOM element; `class` and CSS selectors do not style its Three.js output. The named appearance is the reusable styling mechanism. Complex particle and geometry factories stay in TypeScript and can be selected by named presets in a later step.

## Lifecycle and interactive editing

The source of truth remains Vue state. A `vx-port` declaration registers an immutable position/normal description; a `vx-edge` declaration registers an immutable relationship description. Vue updates either description by prop change. The stage resolves them after host insertion and after transforms settle. On unmount, edge and port declarations unregister before their spatial owner's endpoint registration disappears. The current `Base.removeChild()` order calls the parent's `onRemoved()` before removing descendants; implementation must provide a safe declaration teardown phase or otherwise guarantee this order without patching `stage.ts`.

Future interactive connection tools should use the same public identities:

- A public `stage.connections.get({ scope, key })` and `stage.connections.list({ scope? })` return immutable authored records and optional resolved route data, with unresolved reasons kept separate. Ports are addressed by `(node ID, port name)` and discoverable through `stage.connections.portsOf(nodeId)`.
- A click reports the same edge handle and source item whether the edge came from a local tag, a central block, or a graph value. A port hit reports its owner/name pair. Connector events are distinct from spatial node bubbling.
- Creating, retargeting, or deleting through a UI emits a typed `connection-create-request`, `connection-retarget-request`, or `connection-delete-request` event from `<Vuetrex>`, containing endpoint handles and a proposed stable key. The application accepts it by updating its reactive records; the renderer does not mutate an immutable graph or a template declaration behind Vue's back. Applications that want editing should keep editable edges in reactive data rendered through `:graph` or keyed `v-for` children.
- An unfinished drag uses a temporary stage-owned preview route. Cancellation, endpoint removal, or stage unmount disposes it. A committed edge enters the ordinary compiler and keyed reconciliation path.
- An interactive tool must distinguish missing, disabled, incompatible-direction, and occupied ports. Port capacity and allowed connection kinds can be added as metadata without changing endpoint geometry.

Invisible port declarations do not become pickable by themselves. An editor may display temporary port handles derived from the port registry, and those handles report the same `(node ID, port name)` identity when hit.

The first implementation does not need an editor. Its API and tests should preserve the read and identity boundary so editing can be added without inventing a second connector model.

## Implementation sequence

1. Define public port and edge declaration records, explicit owner/scope identity, validation, and a shared lowering function into the existing `ConnectorSource`/compiler boundary.
2. Add `vx-port` as a `StageDeclaration`. Resolve direct spatial ownership, local positions, normals, face placement, overrides, and disabled ports. Reconcile dependent routes on changes and teardown.
3. Add local `vx-edge` declarations beneath fixed mesh and group hosts. Enforce declaration-only children for fixed meshes and stable keys; prove that layout and bounds are unchanged.
4. Add `<vx-edge>` children to `<vx-connectors>`, including keyed `v-for`/`v-if` movement, `scope`, and the exclusive `:graph`/children rule.
5. Add host and edge presentation props plus named connector appearances in `VxStyleSheet`; prove that style-only changes do not rebuild paths.
6. Update the cafe and `VNode` examples. Publish the component-author and scene-author guidance listed below, then update API metadata for the new tags and props.

The new contract may remove or rename legacy `vx-connector`, `vx-bus-connector`, mesh `connection`, and overlapping `route`/`stroke` shorthands. Update the original fluent plan and public docs when implementation lands; do not preserve contradictory migration promises solely for compatibility.

## Acceptance tests

- A `vx-box` with port/edge children retains its measured size, layout slot, focus bounds, and Three.js child count. Visual children are rejected with an actionable error.
- The six cafe ports follow translation, rotation, nonuniform scale, and geometry-prop changes. Normals still point outward. Scene-authored additions, overrides, and disabled ports behave deterministically.
- A Vue component's `#ports` slot attaches to its documented root. A wrapper forwards the slot and ID; omitting that forwarding does not silently attach declarations to a different spatial node.
- Local, central, and graph-authored versions of the same edge compile to equivalent topology and route records. Stable keys survive reorder and conditional rendering; duplicate `(scope, key)` pairs fail.
- `node.port` literals and bound endpoint objects resolve to the same identity; a bare node uses its automatic port. Dotted IDs require bound objects, and local edges reject an explicit source outside their owner.
- Missing and disabled ports keep edges authored but unresolved with distinct diagnostics. Late port insertion activates only dependent edges.
- A styling-only change leaves topology and route revisions intact, updates the correct appearance allocations, and restores inherited values when removed.
- Removing a local source, a central host, or the whole scene releases declarations and all derived GPU resources exactly once. No stale owner or port records remain.
- Route picking returns stable edge and port handles suitable for later read and edit requests, regardless of authoring form.

## Guidance to publish with the implementation

The later connections guide should show the three authoring forms side by side, then teach these rules:

- Give every public endpoint an explicit semantic ID; give every declarative edge a stable key. Use a graph host for collections.
- Write `node.port` for literal template endpoints and bind an endpoint object for dynamic names or names containing dots. Do not add separate port attributes to an edge.
- Give a reusable composite component one documented spatial root and semantic port names. Compute exact local ports from the same props as the model; include explicit normals.
- Expose a named `#ports` slot when consumers should add or override ports, and a `#connections` slot only when local outgoing edges are part of the component's public API. Forward these slots through wrappers deliberately.
- Put ports on the node whose identity callers should address. A wrapper's ports and an inner component's ports have different owners unless explicitly forwarded to the same root.
- Keep relationship data in code and reusable appearance in templates or the stylesheet. Use per-record fields for exceptions driven by data.
- Treat user-created connections as application data. Read immutable handles from interactions, update reactive source records, and let Vuetrex reconcile the result.

Document local coordinate and face coordinate conventions with a rotated cafe diagram, and show a `VNode` with a `#ports` slot beside its existing header/body/footer props. That example should demonstrate both a locally declared edge and a separate `<vx-connectors>` block.

---
title: Designing legible data scenes
description: Use light, colour, geometry, motion, connectors, and focus to keep data visually dominant in a 3D stage.
---

# Designing legible data scenes

A Vuetrex scene should explain the data before it explains the model. Buildings, racks, machinery, and terrain provide
location and scale; live state, relationships, and anomalies carry the story.

These are design guidelines, not renderer constraints. Break them deliberately when the domain needs a different
visual language.

![Two versions of the same service scene: when everything glows, the alert is lost; quiet context makes one coral degraded service immediately visible.](/images/visual-hierarchy.svg)

In the right-hand scene, neutral infrastructure sets the scale, blue-green services show normal operation, and a
single coral service calls for attention. The palette is small enough that color has a predictable meaning.

## Layer by luminance

Keep environmental geometry darker, softer, or less saturated than live data. Reserve the brightest values, emissive
materials, neon connector strokes, and sharpest textures for information that is active or actionable.

This creates an immediate reading order:

1. active or abnormal data;
2. normal data flow and selectable entities;
3. environmental context.

Avoid making every surface glow. If the buildings, floor, labels, connectors, and particles all use the same luminous
range, emission stops carrying meaning.

## Use a tri-colour palette

Start with three semantic colours:

- a neutral base for the physical model and inactive context;
- a secondary colour for normal data, selection affordances, and healthy flow;
- a contrasting accent for anomalies, alerts, and critical state.

Tints, shades, opacity, and emission strength can create depth without inventing more semantic categories. If another
colour is introduced, give it one stable meaning across the whole stage.

Do not use the alert accent as general decoration. Its scarcity is what makes it effective.

Here is that rule applied to a small Vue scene. Click the button to change one service's health; the floor and normal
service stay quiet.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Vuetrex } from '@exceeder/vuetrex'

const services = ref([
  { id: 'gateway', status: 'healthy' },
  { id: 'orders', status: 'healthy' },
])

function toggleOrders() {
  const orders = services.value.find(service => service.id === 'orders')!
  orders.status = orders.status === 'healthy' ? 'degraded' : 'healthy'
}
</script>

<template>
  <button @click="toggleOrders">Toggle orders health</button>
  <Vuetrex height="420px">
    <vx-floor finish="matte" :color="0x263f49" />
    <vx-row :gap="0.35">
      <vx-box
        v-for="service in services"
        :key="service.id"
        :id="service.id" :name="service.id"
        :text="service.id"
        :material="{
          color: service.status === 'degraded' ? 0xd8765d : 0x317f91,
          roughness: 0.55,
        }"
      />
    </vx-row>
  </Vuetrex>
</template>
```

Keep a text label or another shape cue for degraded state too; color alone should not carry the status.

## Establish spatial hierarchy

Anchor data tags and inspection cards to the world position of the object or connector they describe. A short vertical
leader line can lift a label above dense geometry while preserving the relationship between the overlay and its
source.

Prefer one selected or hovered card over many permanently open cards. When several labels must coexist:

- keep leaders thin and visually quieter than the data they annotate;
- give important states the higher vertical tier;
- move text into screen-space overlays while retaining a world-space anchor;
- hide or aggregate low-priority labels as the camera moves away;
- keep connector and node identity stable so a card survives reactive updates.

For connectors, anchor a card to the picked point on the route, not arbitrarily to one endpoint. A normal edge can show
live values such as queries per second, latency, or error rate. A bundled trunk should first show an aggregate and then
allow inspection of its member connections.

## Give connectors a visual grammar

Use at least two routing roles:

- **Ground routes** carry normal traffic. Keep them low, grid-aligned or orthogonal, subdued, and bundled into shared
  corridors where that improves the overview. They should read like PCB traces or roads between buildings.
- **Air routes** carry exceptions. Elevate them and use direct, Bézier, or spline paths for rare jumps, cross-links,
  alerts, or connections that would make the ground layer unreadable.

Ground and air are a useful default language, not a restriction. Builders can use other route strategies, elevations,
materials, particles, or manual waypoints when the domain calls for them.

Keep the semantic connection separate from its route style. Moving an edge from ground to air should not change its
identity, selection state, metrics, or role in graph algorithms.

## Illuminate with intent

Use directional light and shadows to give the physical model weight. Add ambient fill carefully so shadowed geometry
remains readable without flattening the scene.

Where the renderer setup supports it, ambient occlusion can strengthen contact between objects. Bright live streams
may illuminate nearby surfaces, but reserve that cost and visual emphasis for important activity. A glowing material
does not automatically cast real light; use application-supplied lights or a suitable post-processing technique when
physical spill is part of the design.

## Enforce clean geometry

Remove physical detail that does not support the data story. Prefer recognizable silhouettes, low-poly structures,
and restrained wireframes over detailed assets competing with overlays and flows.

Spend detail where it communicates state: endpoint ports, active zones, selection outlines, and meaningful boundaries.
Repeated decorative features are better represented through texture, instancing, or omission.

## Animate by velocity

Map live values to motion as well as text. Faster particle travel, stronger pulses, denser flow, or a quicker gradient
shift can make a rate change legible before the user reads a number.

Keep the mapping bounded and perceptually stable:

- normalize noisy metrics into a useful display range;
- smooth short spikes unless the spike itself is the alert;
- retain a visible minimum speed for non-zero flow;
- cap maximum speed before particles become flicker;
- use colour for state and velocity for rate instead of making both encode the same value.

## Future focus treatment: depth of field

::: info Design target, not a current public capability
Vuetrex's composer does not yet expose a supported depth-of-field focus effect. Treat this section as direction for a
future API, not something current components guarantee.
:::

When an object or connection is focused, a shallow depth of field can keep it sharp while allowing the surrounding
environment to soften. The effect should reinforce an existing selection rather than become the only indication of
focus.

A future composer integration should derive focus distance from the selected world-space anchor, transition gently,
limit blur so context remains recognizable, and provide a reduced-effect or disabled mode for accessibility and
performance.

## Review checklist

Before shipping a scene, check that:

- the brightest element is also the most important one;
- each core colour has one consistent meaning;
- labels and cards preserve a visible spatial anchor;
- normal ground traffic forms a readable outline instead of a cable cloud;
- air routes remain rare enough to signal exceptions;
- animation speed reflects a real value and stays readable at its extremes;
- selection remains clear without relying only on colour, glow, motion, or future blur effects.

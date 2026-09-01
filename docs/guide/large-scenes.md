---
title: Large scenes
description: Structure deep operational scenes and use semantic GPU instancing for repeated leaves.
---

# Large scenes

## The problem: a useful overview must survive zooming in

A scene with five services can give every pod its own Vue node and Three.js mesh. A scene with hundreds of services and
thousands of pods cannot spend the same amount of CPU, GPU, and interaction bookkeeping on every repeated glyph.

The solution is not to flatten the entire scene. Keep semantic structure at the levels users inspect, then batch large
repeated leaf sets.

## Design the hierarchy before optimizing geometry

```text
environment
  region
    namespace
      deployment
        service panel
          pod instances
```

At each level ask:

1. Does the user focus or inspect this object independently?
2. Does it establish a meaningful local layout?
3. Does it need children with different representations?

If yes, keep it as a keyed Vue/Vuetrex component. If hundreds of leaves share one geometry and material, consider
`<vx-instances>`.

## Keep repeated leaves semantic

`vx-instances` renders a keyed collection through one `THREE.InstancedMesh`. It retains the mapping from a GPU instance
back to the source item.

```vue
<script setup lang="ts">
import * as THREE from 'three'
import type { InstanceEncoding, VxMouseEvent } from '@exceeder/vuetrex'

interface Pod {
  id: string
  ready: boolean
  phase: string
}

const props = defineProps<{ pods: Pod[] }>()

const encoding: InstanceEncoding<Pod> = {
  transform(pod, index) {
    const column = index % 5
    const row = Math.floor(index / 5)
    return new THREE.Matrix4().compose(
      new THREE.Vector3((column - 2) * 0.18, 0.07, row * 0.18),
      new THREE.Quaternion(),
      new THREE.Vector3(0.14, 0.14, 0.14),
    )
  },
  color: pod => pod.ready ? 0x65bd91 : 0xd56a54,
  visible: pod => pod.phase !== 'Terminated',
}

function inspectPod(event: VxMouseEvent) {
  const hit = event.vxInstance
  if (hit) console.log(hit.id, hit.item)
}
</script>

<template>
  <vx-instances
    :items="props.pods"
    key-by="id"
    :encoding="encoding"
    :material="{ color: 0xffffff, roughness: 0.42 }"
    @click="inspectPod"
  />
</template>
```

The default geometry is a rounded unit box. The transform matrix controls each instance's position, orientation, and
dimensions. Use a white shared material when per-instance colors should remain exact, because instance colors multiply
the material color.

## Why keys still matter in one mesh

An event stream may reorder pods on every snapshot. `key-by="id"` gives each surviving pod a stable GPU slot. A raycast
hit is exposed as:

```ts
interface InstanceHit<T> {
  id: string
  item: T
  instanceIndex: number
}
```

That allows one rendered mesh to remain selectable by domain identity.

## Know the current boundary

The first instancing implementation supports:

- One shared geometry and material
- Per-instance transform, color, and visibility
- Keyed slot retention
- Instance-aware click, double-click, enter, and leave events
- Bounds reporting to parent layouts and camera framing

It does not yet provide per-instance labels, materials, hover styling, nested children, or connector endpoints. Put
those features on the enclosing deployment or service component, or use individual nodes for the smaller subset that
requires them.

## Keep camera and detail policy separate

`fitToContent()` and named focus already use measured world bounds. A large scene can therefore change structure
without application-owned camera scale tables.

`Placement.lod` is reserved but does not currently control realization. Until a renderer-level LOD policy exists, use
application state to switch whole representations at meaningful thresholds:

```vue
<DeploymentSummary v-if="detail === 'overview'" :deployment="deployment" />
<DeploymentPods v-else :deployment="deployment" />
```

Prefer a few semantic detail modes over dozens of continuous geometry controls. This keeps the scene understandable to
users and describable by tools.

## Measure before batching everything

Instancing reduces draw calls but also removes per-item component boundaries. Use it where repeated leaves dominate.
Keep services, deployments, panels, displays, and important connector endpoints as normal nodes until profiling shows
they are the bottleneck.

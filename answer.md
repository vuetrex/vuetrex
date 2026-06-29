## The Core Tension

`modelGen()` is synchronous, but GLTF loading is async. `registerAnimation` drives the render loop at 25fps. The design
must resolve this without breaking either constraint.

---

## Layer 1: `AssetRegistry` — Pre-load, then clone

GLTF assets are loaded once at startup into a registry. Each `GltfNode` clones from that registry synchronously inside
`modelGen()`. Loading is a prerequisite, not inline.

```
vuetrex-assets/
├── AssetRegistry.ts       # loads GLBs, stores scene + clips by assetId
├── GltfNode.ts            # extends MeshNode, adds animation state
├── manifest.ts            # TypeScript type for the catalog format
└── index.ts
```

`AssetRegistry` is provided as a Vue plugin at app level, async-initialized before mounting. The Vuetrex renderer picks
it up via `inject`.

```typescript
// AssetRegistry.ts
export class AssetRegistry {
    private loaded = new Map<string, { scene: THREE.Group; clips: THREE.AnimationClip[] }>();

    async load(manifest: AssetManifest): Promise<void> {
        const loader = new GLTFLoader();
        await Promise.all(
            Object.entries(manifest.assets).map(async ([id, def]) => {
                const gltf = await loader.loadAsync(def.file);
                this.loaded.set(id, {scene: gltf.scene, clips: gltf.animations});
            })
        );
    }

    clone(assetId: string): { scene: THREE.Group; clips: THREE.AnimationClip[] } {
        const entry = this.loaded.get(assetId);
        if (!entry) throw new Error(`Asset not loaded: ${assetId}`);
        return {scene: entry.scene.clone(true), clips: entry.clips};
    }
}
```

---

## Layer 2: `GltfNode` — Animation state as reactive prop

Animation state maps directly onto `state.animationState` — which means it's settable from Vue templates for free via
`patchProp`'s duck-typing. The `AnimationMixer` per-instance is registered on `stage.registerAnimation`, so it ticks
with the existing GSAP-driven render loop.

```typescript
// GltfNode.ts
export class GltfNode extends MeshNode {
    protected state = reactive({
        text: '', size: 1.0, height: 0.5, connection: null,
        assetId: '',
        animationState: 'idle',  // maps to GLTF clip name
    });

    private mixer?: THREE.AnimationMixer;
    private stopMixerTick?: () => void;

    constructor(stage: VuetrexStage, private registry: AssetRegistry) {
        super(stage);
    }

    modelGen(): (height: number, size: number) => THREE.Object3D {
        const {assetId, animationState} = this.state; // hoisted, tracked by watchEffect
        const {scene, clips} = this.registry.clone(assetId);
        return (_height, _size) => {
            const mixer = new THREE.AnimationMixer(scene);
            const clip = THREE.AnimationClip.findByName(clips, animationState) ?? clips[0];
            if (clip) mixer.clipAction(clip).play();
            this.attachMixer(mixer);
            return scene;
        };
    }

    private attachMixer(mixer: THREE.AnimationMixer) {
        this.stopMixerTick?.();
        const fn = (_t: number, dt: number) => mixer.update(dt / 1000);
        this.stage.registerAnimation(fn);
        this.mixer = mixer;
        this.stopMixerTick = () => { /* remove fn from animations array */
        };
    }
}
```

The animation state transition — changing `animationState` reactively in Vue — triggers `clearMesh()` + `modelGen()` via
`watchEffect`, which replaces the mesh with a new clone running the new clip. For smooth cross-fades, `attachMixer` can
use `crossFadeTo()` instead of hard-swapping.

---

## Layer 3: The Asset Catalog — designed for AI readability

```json
{
  "version": "1.0",
  "assets": {
    "server-rack": {
      "file": "assets/server-rack.glb",
      "description": "Low-poly server rack. Use for compute pods, VMs, bare-metal nodes.",
      "animations": {
        "idle": "Gentle LED pulse. Default state.",
        "active": "Fan spin + disk activity LEDs. Use when CPU > 60%.",
        "error": "Red LED flash. Use for CrashLoopBackOff, OOMKilled.",
        "boot": "Power-on sequence. Use on node creation."
      },
      "materialSlots": {
        "chassis": "Main body color — maps to customer brand primary",
        "accent": "LED strip color — maps to customer brand secondary",
        "screen": "Display panel — leave as-is or show status texture"
      },
      "defaultAnimation": "idle",
      "tags": [
        "compute",
        "kubernetes",
        "pod"
      ]
    }
  }
}
```

The `description`, `animations`, and `tags` fields exist specifically so Claude can reason about which asset fits which
concept in a customer's domain. The catalog is the AI's vocabulary.

---

## Layer 4: Customer Setup Package — what AI generates

The customer deliverable is a thin package:

```
acme-vuetrex/
├── catalog.json           # subset of the master catalog, possibly with overrides
├── theme.ts               # brand colors → material slot mapping
├── node-map.ts            # domain concept → asset + animation binding
└── components/
    ├── ApiGateway.vue
    ├── DatabasePod.vue
    └── KubeNode.vue
```

```typescript
// node-map.ts — AI generates and maintains this file
export const nodeMap: NodeMapping[] = [
    {
        concept: 'api-gateway',
        assetId: 'network-switch',
        stateBindings: {
            idle: 'idle',
            'high-load': 'active',
            degraded: 'error',
        }
    },
    {
        concept: 'compute-pod',
        assetId: 'server-rack',
        stateBindings: {
            Running: 'active',
            CrashLoopBackOff: 'error',
            Pending: 'boot',
            Succeeded: 'idle',
        }
    }
];
```

```vue
<!-- components/KubeNode.vue — AI generates this per node type -->
<template>
  <gltf-node
      :asset-id="resolvedAsset"
      :animation-state="resolvedAnimation"
      :size="size"
      :text="name"
  />
</template>

<script setup lang="ts">
  const props = defineProps<{ status: string; name: string; size?: number }>();
  const resolvedAsset = 'server-rack';
  const resolvedAnimation = computed(() =>
      nodeMap.find(m => m.concept === 'compute-pod')
          ?.stateBindings[props.status] ?? 'idle'
  );
</script>
```

---

## AI Workflow

1. **Claude reads** `catalog.json` (vocabulary) and `CLAUDE.md` in the customer package (domain context)
2. **Customer describes** their system: *"we have Kubernetes pods, a Redis cluster, an API gateway with circuit breaker
   states"*
3. **Claude generates** `node-map.ts` and component wrappers by matching domain concepts to catalog entries
4. **Customer iterates** — *"the circuit breaker state should use the error animation not active"* — Claude edits
   `node-map.ts`
5. **Theme**: Customer provides hex codes, Claude maps them to `theme.ts` material slot assignments

The catalog's `description` and `tags` fields are the contract that makes step 3 work well. The `stateBindings` in
`node-map.ts` are the only thing that needs human domain knowledge — the AI can't know that `CrashLoopBackOff` should be
`error`, but once told once, it maintains it.

---

## What `renderMesh` needs for GLTF

`renderMesh` currently does `model.geometry.scale(...)` on line 292, which assumes a single-mesh `Mesh`. A GLTF scene is
a `Group`. Stage needs a GLTF-aware path — either a separate `renderGltf(el, gen)` method, or `renderMesh` checks
`model instanceof THREE.Group` and skips the geometry-level scale, applying it to `model.scale` instead.

The `translateY(height/2)` centering also doesn't apply to GLTF (the artist controls pivot placement), so GLTF nodes
would set `height = 0` or bypass that path entirely.

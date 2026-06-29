# Content-Driven Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-box layout (container declares a size and subdivides it) with a content-driven measure→arrange engine where every node reports an intrinsic footprint and containers size to fit their children.

**Architecture:** Each node exposes a reactive `measuredSize` (bottom-up measure). Layouts become pure `measure/place` pairs operating on child footprints plus a `gap`. Positions are still pulled lazily through `Element3d.getPosition() → parent.layoutPositionOf(node)`, now composed with a per-node `renderOffset()` so every node is anchored at the center of its base (XZ-centered, Y at the floor). A declared `size`/`height` becomes an optional reservation that can only scale a container down.

**Tech Stack:** TypeScript, Vue 3 reactivity (`computed`, `watchEffect`), three.js, Vitest.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-06-28-content-driven-layout-design.md`.
- `three/` is not modified except `three/element3d.ts` (`getPosition`) and one additive field in `three/stage.ts`.
- Box-equivalent footprint: a `Box`, `Cylinder`, and `Wedge` of declared `size` all occupy `size × height × size`.
- Anchoring is universal: every node is anchored at the center of its base. Container local origin is its base-center, Y=0.
- Layout factories operate on `Vector3[]` footprints only — no `Node` import in `layouts.ts`.
- Existing public template authoring (`<layer>`, `<row>`, `<stack>`, `<ring>`, `<box>`, …) keeps working.
- Run tests with `npx vitest run <file>` (CI) — never the watch mode.
- Commit after every task. Branch is `group-nodes`.

---

## File Structure

| File | Responsibility after this plan |
|------|--------------------------------|
| `src/lib-components/nodes/layouts.ts` | Pure `Layout` interface + 5 `measure/place` layout objects. No node deps. |
| `src/lib-components/nodes/Node.ts` | Declares `measuredSize` computed, `intrinsicSize()`, `renderOffset()`. `allocatedSizeOf` removed. |
| `src/lib-components/nodes/MeshNode.ts` | Box-equivalent `intrinsicSize()`, base-anchor `renderOffset()`. |
| `src/lib-components/three/element3d.ts` | `getPosition()` composes parent placement + `renderOffset()`. |
| `src/lib-components/nodes/GroupNode.ts` | Holds a `Layout`; `intrinsicSize` via `measure`; `layoutPositionOf` via `place`; gap + override/shrink. Subdivision deleted. |
| `src/lib-components/nodes/Row.ts` / `Stack.ts` / `Ring.ts` / `Layer.ts` | Pass a `Layout`; drop `defaultSize`/`normalizeSizeValue` magic. |
| `src/lib-components/nodes/Root.ts` | Top-level grid via new `gridLayout.place`. `allocatedSizeOf` removed. |
| `src/lib-components/three/stage.ts` | Adds a `gap` field sourced from settings. |
| `test/unit/verify-layout.spec.ts` | New: exact-number assertions for every layout. |
| `test/unit/verify-geometry.spec.ts` | Mock stage gains `gap`; assertions confirmed under new model. |

---

## Task 1: Pure layout engine (`layouts.ts`)

**Files:**
- Modify (full rewrite): `src/lib-components/nodes/layouts.ts`
- Test: `test/unit/verify-layout.spec.ts`

**Interfaces:**
- Consumes: `three`'s `Vector3`.
- Produces:
  ```ts
  export interface Layout {
      measure(children: Vector3[], gap: number): Vector3
      place(index: number, children: Vector3[], gap: number): Vector3
  }
  export const horizontalLayout: Layout   // children spread along X
  export const depthLayout: Layout        // children spread along Z
  export const stackLayout: Layout        // children stacked along Y
  export const ringLayout: Layout         // children on an XZ circle
  export const gridLayout: Layout         // children in an XZ grid
  ```
  `place` returns a child's **base-center** position in the container's local frame (container origin = base-center). `measure` returns the total footprint `(width, height, depth)`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/verify-layout.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
    horizontalLayout, depthLayout, stackLayout, ringLayout, gridLayout,
} from '@/lib-components/nodes/layouts.js'

const unit = () => new Vector3(1, 0.5, 1)

describe('horizontalLayout', () => {
    it('measures total width = sum of widths + gaps', () => {
        const m = horizontalLayout.measure([unit(), unit(), unit()], 0.5)
        expect(m.x).toBeCloseTo(4, 6)   // 3*1 + 2*0.5
        expect(m.y).toBeCloseTo(0.5, 6)
        expect(m.z).toBeCloseTo(1, 6)
    })
    it('places children symmetric about origin on X', () => {
        const c = [unit(), unit(), unit()]
        const xs = c.map((_, i) => horizontalLayout.place(i, c, 0.5).x)
        expect(xs).toEqual([-1.5, 0, 1.5].map(v => expect.closeTo(v, 6)))
        c.forEach((_, i) => {
            expect(horizontalLayout.place(i, c, 0.5).y).toBeCloseTo(0, 6)
            expect(horizontalLayout.place(i, c, 0.5).z).toBeCloseTo(0, 6)
        })
    })
})

describe('depthLayout', () => {
    it('places children symmetric about origin on Z, X=0', () => {
        const c = [unit(), unit(), unit()]
        const zs = c.map((_, i) => depthLayout.place(i, c, 0.5).z)
        expect(zs).toEqual([-1.5, 0, 1.5].map(v => expect.closeTo(v, 6)))
        c.forEach((_, i) => expect(depthLayout.place(i, c, 0.5).x).toBeCloseTo(0, 6))
    })
})

describe('stackLayout', () => {
    it('stacks bases by cumulative height + gap', () => {
        const c = [new Vector3(1, 0.5, 1), new Vector3(1, 0.33, 1), new Vector3(1, 0.75, 1)]
        expect(stackLayout.place(0, c, 0.2).y).toBeCloseTo(0, 6)
        expect(stackLayout.place(1, c, 0.2).y).toBeCloseTo(0.7, 6)    // 0.5 + 0.2
        expect(stackLayout.place(2, c, 0.2).y).toBeCloseTo(1.23, 6)   // 0.5 + 0.33 + 0.4
        expect(stackLayout.measure(c, 0.2).y).toBeCloseTo(1.98, 6)    // 1.58 + 0.4
    })
})

describe('gridLayout', () => {
    it('centers a single child', () => {
        const c = [unit()]
        const p = gridLayout.place(0, c, 0.5)
        expect(p.x).toBeCloseTo(0, 6)
        expect(p.z).toBeCloseTo(0, 6)
    })
    it('lays four children into a 2x2 grid', () => {
        const c = [unit(), unit(), unit(), unit()]
        const xs = [...new Set(c.map((_, i) => +gridLayout.place(i, c, 0.5).x.toFixed(6)))].sort((a, b) => a - b)
        const zs = [...new Set(c.map((_, i) => +gridLayout.place(i, c, 0.5).z.toFixed(6)))].sort((a, b) => a - b)
        expect(xs).toEqual([-0.75, 0.75])
        expect(zs).toEqual([-0.75, 0.75])
    })
})

describe('ringLayout', () => {
    it('places N=4 children on a circle of equal radius and equal angular step', () => {
        const c = [unit(), unit(), unit(), unit()]
        const ps = c.map((_, i) => ringLayout.place(i, c, 0.5))
        const radii = ps.map(p => Math.hypot(p.x, p.z))
        radii.forEach(r => { expect(r).toBeCloseTo(radii[0], 6); expect(r).toBeGreaterThan(0) })
        ps.forEach(p => expect(p.y).toBeCloseTo(0, 6))
    })
})

describe('empty containers', () => {
    it('measure and place return the zero vector', () => {
        for (const L of [horizontalLayout, depthLayout, stackLayout, ringLayout, gridLayout]) {
            expect(L.measure([], 0.5)).toEqual(new Vector3(0, 0, 0))
            expect(L.place(0, [], 0.5)).toEqual(new Vector3(0, 0, 0))
        }
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/verify-layout.spec.ts`
Expected: FAIL — the named exports are still factories, `.measure`/`.place` are undefined.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib-components/nodes/layouts.ts` with:

```ts
import { Vector3 } from 'three';

export interface Layout {
    measure(children: Vector3[], gap: number): Vector3
    place(index: number, children: Vector3[], gap: number): Vector3
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const maxOr0 = (ns: number[]) => (ns.length ? Math.max(...ns) : 0);

const linearMeasure = (children: Vector3[], gap: number, axis: 'x' | 'z'): Vector3 => {
    if (!children.length) return new Vector3();
    const extent = sum(children.map(c => c[axis])) + gap * (children.length - 1);
    const w = axis === 'x' ? extent : maxOr0(children.map(c => c.x));
    const d = axis === 'z' ? extent : maxOr0(children.map(c => c.z));
    return new Vector3(w, maxOr0(children.map(c => c.y)), d);
};

const linearPlace = (index: number, children: Vector3[], gap: number, axis: 'x' | 'z'): Vector3 => {
    if (!children.length) return new Vector3();
    const extent = sum(children.map(c => c[axis])) + gap * (children.length - 1);
    const before = sum(children.slice(0, index).map(c => c[axis])) + gap * index;
    const offset = -extent / 2 + before + children[index][axis] / 2;
    return axis === 'x' ? new Vector3(offset, 0, 0) : new Vector3(0, 0, offset);
};

export const horizontalLayout: Layout = {
    measure: (children, gap) => linearMeasure(children, gap, 'x'),
    place: (index, children, gap) => linearPlace(index, children, gap, 'x'),
};

export const depthLayout: Layout = {
    measure: (children, gap) => linearMeasure(children, gap, 'z'),
    place: (index, children, gap) => linearPlace(index, children, gap, 'z'),
};

export const stackLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const height = sum(children.map(c => c.y)) + gap * (children.length - 1);
        return new Vector3(maxOr0(children.map(c => c.x)), height, maxOr0(children.map(c => c.z)));
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const y = sum(children.slice(0, index).map(c => c.y)) + gap * index;
        return new Vector3(0, y, 0);
    },
};

const ringRadius = (children: Vector3[], gap: number): number => {
    const n = children.length;
    if (n <= 1) return 0;
    const chord = maxOr0(children.map(c => Math.max(c.x, c.z))) + gap;
    return chord / (2 * Math.sin(Math.PI / n));
};

export const ringLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const r = ringRadius(children, gap);
        return new Vector3(
            2 * r + maxOr0(children.map(c => c.x)),
            maxOr0(children.map(c => c.y)),
            2 * r + maxOr0(children.map(c => c.z)),
        );
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const r = ringRadius(children, gap);
        const angle = index * Math.PI * 2 / children.length;
        return new Vector3(r * Math.sin(angle), 0, r * Math.cos(angle));
    },
};

const gridDimensions = (count: number) => {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    return { columns, rows };
};

export const gridLayout: Layout = {
    measure(children, gap) {
        if (!children.length) return new Vector3();
        const { columns, rows } = gridDimensions(children.length);
        const cellX = maxOr0(children.map(c => c.x));
        const cellZ = maxOr0(children.map(c => c.z));
        return new Vector3(
            columns * cellX + gap * (columns - 1),
            maxOr0(children.map(c => c.y)),
            rows * cellZ + gap * (rows - 1),
        );
    },
    place(index, children, gap) {
        if (!children.length) return new Vector3();
        const { columns, rows } = gridDimensions(children.length);
        const cellX = maxOr0(children.map(c => c.x));
        const cellZ = maxOr0(children.map(c => c.z));
        const width = columns * cellX + gap * (columns - 1);
        const depth = rows * cellZ + gap * (rows - 1);
        const column = index % columns;
        const row = Math.floor(index / columns);
        return new Vector3(
            -width / 2 + column * (cellX + gap) + cellX / 2,
            0,
            -depth / 2 + row * (cellZ + gap) + cellZ / 2,
        );
    },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/verify-layout.spec.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/nodes/layouts.ts test/unit/verify-layout.spec.ts
git commit -m "feat(layout): pure measure/place layout engine"
```

---

## Task 2: Add `gap` to settings and stage

**Files:**
- Modify: `src/lib-components/three/stage.ts` (settings interface ~lines 61-62; constructor ~lines 99-100)

**Interfaces:**
- Consumes: existing `BOX_DISTANCE`, `settings.distance`.
- Produces: `stage.gap: number` (public field) and `VxSettings.gap?: number`.

- [ ] **Step 1: Add the setting field**

In the `VxSettings`/settings interface in `src/lib-components/three/stage.ts`, next to `unit?: number` and `distance?: number` (around line 61), add:

```ts
    gap?: number
```

- [ ] **Step 2: Add the public stage field**

In the same file where `boxRadius`/`boxDistance` are declared (around line 91-92), add a field:

```ts
    gap: number;
```

- [ ] **Step 3: Initialize it in the constructor**

Right after the lines that set `this.boxRadius`/`this.boxDistance` (around line 99-100), add:

```ts
        this.gap = settings.gap ?? this.boxDistance
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx vitest run test/unit/verify-stage.spec.ts`
Expected: PASS (no behavior change; field is additive).

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/three/stage.ts
git commit -m "feat(stage): add gap setting (defaults to boxDistance)"
```

---

## Task 3: Node base — `measuredSize`, `intrinsicSize`, `renderOffset`; remove `allocatedSizeOf`

**Files:**
- Modify: `src/lib-components/nodes/Node.ts`

**Interfaces:**
- Consumes: Vue `computed`, `ComputedRef`; `THREE.Vector3`.
- Produces (new members on `Node`):
  ```ts
  public readonly measuredSize: ComputedRef<THREE.Vector3>  // = computed(() => this.intrinsicSize())
  protected intrinsicSize(): THREE.Vector3                  // default: zero vector
  renderOffset(): THREE.Vector3                             // default: zero vector
  ```
  Removes `allocatedSizeOf`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/verify-nodes.spec.ts` (it currently only imports `Base`/`patchProp`; add an import and a block):

```ts
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import * as THREE from 'three'

const measureStage = {
    boxRadius: 1.3, boxDistance: 1.5, gap: 1.5,
    createElementMaterial: () => new THREE.MeshStandardMaterial(),
} as any

describe('measuredSize / renderOffset', () => {
    it('a Box reports a box-equivalent footprint and a half-height base offset', () => {
        const box = new Box(measureStage)
        box.setSize(2)
        box.setHeight(0.5)
        expect(box.measuredSize.value).toEqual(new THREE.Vector3(2, 0.5, 2))
        expect(box.renderOffset().y).toBeCloseTo(0.25, 6)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/verify-nodes.spec.ts`
Expected: FAIL — `measuredSize` / `renderOffset` not defined (Task 4 supplies the `MeshNode` overrides, but the base members must exist first).

- [ ] **Step 3: Edit `Node.ts`**

Update the import on line 4 from:

```ts
import { reactive } from 'vue';
```

to:

```ts
import { reactive, computed, ComputedRef } from 'vue';
```

Add these members to the `Node` class body (place them just above the existing `layoutPositionOf`):

```ts
    public readonly measuredSize: ComputedRef<THREE.Vector3> = computed(() => this.intrinsicSize());

    protected intrinsicSize(): THREE.Vector3 {
        return new THREE.Vector3();
    }

    renderOffset(): THREE.Vector3 {
        return new THREE.Vector3();
    }
```

Delete the `allocatedSizeOf` method (currently lines 128-130):

```ts
    allocatedSizeOf(_child: Node): THREE.Vector3 {
        return new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    }
```

Leave `layoutPositionOf` and everything else unchanged.

- [ ] **Step 4: Run test (still fails until Task 4)**

Run: `npx vitest run test/unit/verify-nodes.spec.ts`
Expected: still FAIL on the footprint assertion (base `intrinsicSize` returns zero). This is expected — Task 4 makes it pass. The earlier "Base tree hierarchy" / "patchProp" tests must still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/nodes/Node.ts test/unit/verify-nodes.spec.ts
git commit -m "feat(node): measuredSize/intrinsicSize/renderOffset; drop allocatedSizeOf"
```

---

## Task 4: MeshNode — box-equivalent footprint + base anchor

**Files:**
- Modify: `src/lib-components/nodes/MeshNode.ts`

**Interfaces:**
- Consumes: `Node.intrinsicSize`/`renderOffset` (Task 3); `this.state.size`, `this.state.height`.
- Produces: overridden `intrinsicSize()` and `renderOffset()` on `MeshNode`.

- [ ] **Step 1: Reuse the failing test from Task 3**

The `measuredSize / renderOffset` test in `verify-nodes.spec.ts` is the failing test for this task.

Run: `npx vitest run test/unit/verify-nodes.spec.ts`
Expected: FAIL on the footprint assertion.

- [ ] **Step 2: Edit `MeshNode.ts`**

Add `Vector3` to the three.js import on line 5:

```ts
import { Mesh, MeshStandardMaterial, Color, Vector3 } from 'three';
```

Add these two methods to the `MeshNode` class body (place them just below the constructor, before `abstract modelGen`):

```ts
    protected override intrinsicSize(): Vector3 {
        return new Vector3(this.state.size, this.state.height, this.state.size);
    }

    override renderOffset(): Vector3 {
        return new Vector3(0, this.state.height / 2, 0);
    }
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run test/unit/verify-nodes.spec.ts`
Expected: PASS (footprint `(2,0.5,2)`, offset `0.25`), plus all prior blocks green.

- [ ] **Step 4: Commit**

```bash
git add src/lib-components/nodes/MeshNode.ts
git commit -m "feat(mesh): box-equivalent footprint and base anchoring"
```

---

## Task 5: `Element3d.getPosition` composes the render offset

**Files:**
- Modify: `src/lib-components/three/element3d.ts` (lines 37-41)

**Interfaces:**
- Consumes: `parent.layoutPositionOf(node)`, `node.renderOffset()` (Task 3/4).
- Produces: `getPosition()` returning base placement + render offset.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/verify-geometry.spec.ts` a block that exercises base anchoring through a real `Stack`:

```ts
describe('base anchoring via Element3d.getPosition', () => {
    it('a box in a stack sits on the floor: mesh Y = base + height/2', () => {
        const stack = new Stack(mockStage)
        const box = new Box(mockStage)
        box.setHeight(0.5)
        stack.appendChild(box)
        // base from layout is y=0 for the first child; renderOffset lifts by height/2
        expect(box.element.getPosition().y).toBeCloseTo(0.25, 5)
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: FAIL — `getPosition().y` is `0` (offset not yet applied).

- [ ] **Step 3: Edit `element3d.ts`**

Replace the body of `getPosition()` (lines 37-41) with:

```ts
    getPosition(): THREE.Vector3 {
        const parent = this.node.parent.value as Node | null;
        if (!parent) return new THREE.Vector3();
        return parent.layoutPositionOf(this.node).add(this.node.renderOffset());
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: PASS (the new block; the existing geometry blocks still pass — they assert relative spacing and centroids, unaffected by the Y offset).

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/three/element3d.ts test/unit/verify-geometry.spec.ts
git commit -m "feat(element3d): anchor meshes at base via renderOffset"
```

---

## Task 6: GroupNode — content-driven measure/arrange

**Files:**
- Modify (substantial rewrite): `src/lib-components/nodes/GroupNode.ts`

**Interfaces:**
- Consumes: `Layout` (Task 1), `Node.intrinsicSize`/`measuredSize` (Task 3), `stage.gap` (Task 2).
- Produces:
  ```ts
  constructor(stage, layout: Layout = gridLayout, stateDefaults?)
  protected gap(): number
  protected intrinsicSize(): Vector3          // content size, overridden by declared size/height
  layoutPositionOf(child: Node): Vector3       // layout.place + child elevation
  // allocatedSizeOf / slotSizeOf / requestedBounds removed
  ```

- [ ] **Step 1: Write the failing test**

Append to `test/unit/verify-geometry.spec.ts`:

```ts
describe('GroupNode content-driven sizing', () => {
    it('a row measures to the summed width of its children + gap', () => {
        const row = new Row(mockStage)        // mockStage.boxDistance = 1.5 → gap 1.5
        const boxes = [new Box(mockStage), new Box(mockStage)]
        boxes.forEach(b => { b.setSize(1); row.appendChild(b) })
        // 2 boxes of width 1 + one 1.5 gap = 3.5
        expect(row.measuredSize.value.x).toBeCloseTo(3.5, 5)
    })

    it('an explicit smaller size shrinks but never enlarges (override is a max)', () => {
        const row = new Row(mockStage)
        const boxes = [new Box(mockStage), new Box(mockStage)]
        boxes.forEach(b => { b.setSize(1); row.appendChild(b) })
        row.setStateValue('size', 1)          // declare 1×1 footprint, smaller than 3.5 content
        expect(row.measuredSize.value.x).toBeCloseTo(1, 5)   // reports the reservation
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: FAIL — `measuredSize.value.x` reflects the old fixed-box default, not the summed content.

- [ ] **Step 3: Rewrite `GroupNode.ts`**

Replace the entire contents of `src/lib-components/nodes/GroupNode.ts` with:

```ts
import {Node} from '@/lib-components/nodes/Node.js';
import {gridLayout, Layout} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Group, Vector3} from 'three';
import {markRaw, reactive, watchEffect, WatchStopHandle} from 'vue';

export interface GroupState {
    text: string
    size: Vector3
    height: number
    gap?: number
}

export class GroupNode extends Node {
    readonly group = new Group()
    readonly isGroupNode = true
    declare protected state: GroupState;

    private stopHandle?: WatchStopHandle
    protected readonly layout: Layout

    private sizeOverridden = false
    private heightOverridden = false

    constructor(stage: VuetrexStage, layout: Layout = gridLayout, stateDefaults: Partial<GroupState & Record<string, any>> = {}) {
        super(stage)
        this.layout = layout
        this.state = reactive({
            text: '',
            ...stateDefaults,
            size: markRaw(new Vector3()),
            height: 0,
        }) as GroupState
        this.element.mesh = this.group as any   // satisfies `Element3d.mesh` type
    }

    protected gap(): number {
        if (typeof this.state.gap === 'number') return this.state.gap
        const g = (this.stage as any).gap
        return typeof g === 'number' ? g : this.stage.boxDistance
    }

    protected childFootprints(): Vector3[] {
        return (this.elements.value as Node[]).map(c => c.measuredSize.value)
    }

    protected contentSize(): Vector3 {
        return this.layout.measure(this.childFootprints(), this.gap())
    }

    protected override intrinsicSize(): Vector3 {
        const size = this.contentSize()
        if (this.sizeOverridden) { size.x = this.state.size.x; size.z = this.state.size.z }
        if (this.heightOverridden) { size.y = this.state.height }
        return size
    }

    protected getIntrinsicScale(): number {
        return 1.0
    }

    private fitScale(): number {
        if (!this.sizeOverridden && !this.heightOverridden) return 1.0
        const content = this.contentSize()
        const declared = this.intrinsicSize()
        const ratios = [declared.x / content.x, declared.y / content.y, declared.z / content.z]
            .filter(ratio => Number.isFinite(ratio) && ratio > 0)
        return ratios.length === 0 ? 1.0 : Math.min(1.0, ...ratios)
    }

    private parseSize(value: unknown): Vector3 {
        if (value instanceof Vector3) return value.clone()
        const n = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isFinite(n)) return new Vector3(n, this.state.height, n)
        if (value && typeof value === 'object') {
            const v = value as {x?: number, y?: number, z?: number}
            const x = typeof v.x === 'number' ? v.x : 0
            return new Vector3(x, typeof v.y === 'number' ? v.y : this.state.height, typeof v.z === 'number' ? v.z : x)
        }
        return new Vector3()
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'size') {
            this.state.size = markRaw(this.parseSize(value))
            this.sizeOverridden = true
            return
        }
        if (key === 'height') {
            const height = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(height)) { this.state.height = height; this.heightOverridden = true }
            return
        }
        if (key === 'gap') {
            const gap = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(gap)) this.state.gap = gap
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree() {
        if (this.stopHandle) return

        this.stopHandle = watchEffect(() => {
            const pos = this.element.getPosition()
            const parentObj = this.nearestAncestorObject()

            if (this.group.parent !== parentObj) {
                parentObj.add(this.group)
            }

            this.group.name = `el-${this.name}`
            this.group.userData.el = this.element
            this.group.position.copy(pos)
            this.group.scale.setScalar(this.getIntrinsicScale() * this.fitScale())
            this.stage.connectors.update(this.element)
        })
    }

    layoutPositionOf(child: Node): Vector3 {
        const siblings = this.elements.value as Node[]
        const idx = siblings.indexOf(child)
        const pos = this.layout.place(idx < 0 ? 0 : idx, this.childFootprints(), this.gap())
        pos.y += child.getElevation()
        return pos
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.group.removeFromParent()
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: PASS — row measures `3.5`; the override reports `1`. Other groups still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/nodes/GroupNode.ts test/unit/verify-geometry.spec.ts
git commit -m "feat(group): content-driven measure/arrange with optional size override"
```

---

## Task 7: Container subclasses — drop the magic, pass a `Layout`

**Files:**
- Modify: `src/lib-components/nodes/Row.ts`, `src/lib-components/nodes/Stack.ts`, `src/lib-components/nodes/Ring.ts`, `src/lib-components/nodes/Layer.ts`

**Interfaces:**
- Consumes: `GroupNode(stage, layout, stateDefaults)` (Task 6); the layout objects (Task 1).
- Produces: each subclass passes its `Layout`; `Layer` keeps `scale`/`elevation` and `getIntrinsicScale`.

- [ ] **Step 1: Rewrite `Row.ts`**

```ts
import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { horizontalLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Row extends GroupNode {
    public readonly type: string = 'Row';

    constructor(stage: VuetrexStage) {
        super(stage, horizontalLayout);
    }
}
```

- [ ] **Step 2: Rewrite `Stack.ts`**

```ts
import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { stackLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Stack extends GroupNode {
    public readonly type: string = 'Stack';

    constructor(stage: VuetrexStage) {
        super(stage, stackLayout);
    }
}
```

- [ ] **Step 3: Rewrite `Ring.ts`** (drop the `size`→radius `normalizeSizeValue` override; radius is now content-driven)

```ts
import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { ringLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Ring extends GroupNode {
    public readonly type: string = 'Ring';

    constructor(stage: VuetrexStage) {
        super(stage, ringLayout);
    }
}
```

- [ ] **Step 4: Rewrite `Layer.ts`** (keep `scale`/`elevation`; drop the 10×5×10 `defaultSize`)

```ts
import {GroupNode, GroupState} from '@/lib-components/nodes/GroupNode.js';
import {depthLayout} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';

interface LayerState extends GroupState {
    scale: number
    elevation: number
}

export class Layer extends GroupNode {
    public readonly type: string = 'Layer'
    declare protected state: LayerState;

    isLayer(): boolean { return true; }

    constructor(stage: VuetrexStage) {
        super(stage, depthLayout, {
            scale: 1.0,
            elevation: 0.0,
        })
    }

    protected override getIntrinsicScale(): number {
        return this.state.scale
    }
}
```

- [ ] **Step 5: Run the geometry suite**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: PASS — `Ring`/`Stack`/`Row`/`Layer` describe blocks green under the new layouts.

- [ ] **Step 6: Commit**

```bash
git add src/lib-components/nodes/Row.ts src/lib-components/nodes/Stack.ts src/lib-components/nodes/Ring.ts src/lib-components/nodes/Layer.ts
git commit -m "feat(containers): pass Layout objects; remove fixed-box magic"
```

---

## Task 8: Root — top-level grid via the new engine

**Files:**
- Modify: `src/lib-components/nodes/Root.ts` (lines 20-27)

**Interfaces:**
- Consumes: `gridLayout.place` (Task 1), `child.getElevation()`, `stage.gap` (Task 2).
- Produces: `Root.layoutPositionOf` placing children on a content-driven grid offset to `ROOT_SPACE_CENTER`. `allocatedSizeOf` removed.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/verify-geometry.spec.ts`:

```ts
import { Root } from '@/lib-components/nodes/Root.js'

describe('Root.layoutPositionOf', () => {
    it('centers a single top-level child near the root space center', () => {
        const root = new Root(mockStage)
        const row = new Row(mockStage)
        root.appendChild(row)
        const p = root.layoutPositionOf(row)
        expect(p.x).toBeCloseTo(0, 5)
        expect(p.z).toBeCloseTo(0, 5)
        expect(p.y).toBeCloseTo(-0.1, 5)   // ROOT_SPACE_CENTER.y
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: FAIL — old `Root` calls `gridLayout(...)` as a factory, which no longer exists (TypeError / undefined).

- [ ] **Step 3: Edit `Root.ts`**

Replace the `Root` class (lines 9-28) with:

```ts
export class Root extends Node {
    constructor(stage: any) {
        super(stage);
    }

    destroy() {
        while (this.children.value.length > 0)
            this.removeChild(this.children.value[this.children.value.length-1]);
        this.stage.destroy();
    }

    private gap(): number {
        const g = (this.stage as any).gap
        return typeof g === 'number' ? g : this.stage.boxDistance
    }

    override layoutPositionOf(child: Node): Vector3 {
        const siblings = this.elements.value as Node[]
        const idx = siblings.indexOf(child)
        const footprints = siblings.map(s => s.measuredSize.value)
        const pos = gridLayout.place(idx < 0 ? 0 : idx, footprints, this.gap())
        pos.y += child.getElevation()
        return pos.add(ROOT_SPACE_CENTER)
    }
}
```

The `ROOT_SPACE_SIZE` constant (line 7) is now unused — delete that line. Keep `ROOT_SPACE_CENTER`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/verify-geometry.spec.ts`
Expected: PASS (Root centers the child at `(0, -0.1, 0)`).

- [ ] **Step 5: Commit**

```bash
git add src/lib-components/nodes/Root.ts test/unit/verify-geometry.spec.ts
git commit -m "feat(root): content-driven grid placement; drop allocatedSizeOf"
```

---

## Task 9: Full-suite regression gate + mock-stage gap

**Files:**
- Modify: `test/unit/verify-geometry.spec.ts` (mock stage object, lines 32-45)

**Interfaces:**
- Consumes: every prior task.
- Produces: a green full suite.

- [ ] **Step 1: Add `gap` to the mock stage**

In `test/unit/verify-geometry.spec.ts`, add `gap: 1.5,` to the `mockStage` literal (next to `boxDistance: 1.5,`). This makes the gap explicit rather than relying on the `boxDistance` fallback.

- [ ] **Step 2: Run the entire unit suite**

Run: `npx vitest run`
Expected: PASS for every file: `verify-layout`, `verify-geometry`, `verify-nodes`, `verify-elements`, `verify-hover`, `verify-scene`, `verify-stage`, `verify-three`.

- [ ] **Step 3: If any file fails, inspect and update assertions to the new model**

Failures should only be value-level (e.g. an absolute position changed because children now sit on the floor). For each failure: read the assertion, recompute the expected value from the new layout math (see `verify-layout` for the formulas), and update the expected number. Do **not** revert engine logic to satisfy an old hardcoded constant — the new positions are the correct ones. If a test asserts a removed API, delete that assertion.

- [ ] **Step 4: Type-check the build**

Run: `npx vue-tsc --noEmit` (or `npm run build` if `vue-tsc` is not wired as a standalone script — check `package.json` scripts first).
Expected: no type errors referencing `allocatedSizeOf`, `slotSizeOf`, `LayoutFactory`, `requestedBounds`, or `layoutSize`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: green full suite under content-driven layout"
```

---

## Task 10: Visual verification of TabB/TabC

**Files:**
- No source changes expected; this task closes the visual loop and captures evidence.

**Interfaces:**
- Consumes: the running demo dev server; the Playwright MCP browser tools.

- [ ] **Step 1: Start the demo dev server**

Run (background): check `package.json` for the dev script (likely `npm run dev` or `npm run serve`); start it and note the local URL.

- [ ] **Step 2: Screenshot TabB ("Nested") and TabC**

Drive the browser to the Nested tab and the Custom/Stacks tab. Wait for the canvas to settle (~1s after load), then take a screenshot of each. Save under `concepts/` for comparison against `concepts/screenshot1.jpg` (before) and `concepts/stacked1.png` (aspiration).

- [ ] **Step 3: Check the structural invariants against the screenshots**

Confirm, for TabB:
- Boxes are spaced by `gap`, not scattered across a 10-wide void.
- Each stack's pods sit directly above their deployment box (shared X/Z).
- Stacks rest on the floor (no floating boxes; bottom of each box at the floor plane).
- The `api-gw` ring's wedges sit centered under/around the api-gw box at the layer elevation.

Record any deviation as a written note (file, expected vs observed). Do not tune values yet — list them.

- [ ] **Step 4: If deviations exist, address them as a follow-up TDD cycle**

For each deviation, add a failing assertion to `verify-layout`/`verify-geometry` that pins the correct number, fix the engine, re-run `npx vitest run`, then re-screenshot. The only "magic number" that should ever be tuned is the global `gap` (in `VxSettings`/demo settings) — everything else is derived.

- [ ] **Step 5: Commit the captured screenshots and any notes**

```bash
git add concepts/ docs/superpowers/plans/2026-06-28-content-driven-layout.md
git commit -m "docs: capture TabB/TabC layout verification screenshots"
```

---

## Self-Review

**Spec coverage:**
- §1 contract (`measuredSize`, measure/place pair) → Tasks 1, 3, 6. ✓
- §2 anchoring (base-center) + gap → Tasks 2, 4, 5, 6. ✓
- §3 override semantics (declared size = max, shrink-only) → Task 6 (`fitScale`, `intrinsicSize`). ✓
- §4 box-equivalent footprint → Task 4. ✓
- §5 files & blast radius → Tasks 1-8 cover every listed file (`layouts`, `GroupNode`, `MeshNode`, `Node`, shapes via box-equivalent, `Row/Stack/Ring/Layer`, `VxSettings`/stage). Shapes need no edits — box-equivalent footprint comes from `MeshNode.intrinsicSize`. ✓
- §6 predictability/verification (deterministic unit assertions + visual loop) → Tasks 1, 9, 10. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the exact command and expected result. ✓

**Type consistency:** `Layout { measure, place }` used identically in Tasks 1, 6, 8. `measuredSize: ComputedRef<Vector3>` defined in Task 3, consumed in Tasks 6/8. `intrinsicSize()`/`renderOffset()` defined in Task 3, overridden in Tasks 4/6. `gap` field defined in Task 2, read in Tasks 6/8. `setSize`/`setHeight` are existing `MeshNode` methods used in tests. ✓

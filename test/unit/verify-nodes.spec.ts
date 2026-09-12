import { describe, it, expect, vi } from 'vitest'
import { Base } from '@/lib-components/nodes/Base.js'
import { patchProp } from '@/lib-components/patchProp.js'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import * as THREE from 'three'

const measureStage = {
    boxRadius: 1.3, boxDistance: 1.5, gap: 1.5,
    createElementMaterial: () => new THREE.MeshStandardMaterial(),
} as any

// Minimal concrete subclass — no Three.js dependency.
// __v_skip prevents Vue from wrapping instances in a reactive Proxy when they
// are stored inside reactive arrays (the same pattern used by Node.ts).
class TestNode extends Base {
    public state: Record<string, any> = {}
    isRenderableNode(): boolean { return true; }
}
(TestNode.prototype as any)['__v_skip'] = true

class HiddenNode extends Base {
    public state: Record<string, any> = {}
}
(HiddenNode.prototype as any)['__v_skip'] = true

// ── Tree hierarchy ────────────────────────────────────────────────────────────

describe('Base tree hierarchy', () => {

    it('appendChild sets parent and registers child in elements', () => {
        const parent = new TestNode()
        const child  = new TestNode()
        parent.appendChild(child)
        expect(child.parent.value).toBe(parent)
        expect(parent.elements.value).toContain(child)
    })

    it('myIdx reflects insertion order among sibling elements', () => {
        const parent = new TestNode()
        const c1 = new TestNode()
        const c2 = new TestNode()
        const c3 = new TestNode()
        parent.appendChild(c1)
        parent.appendChild(c2)
        parent.appendChild(c3)
        expect(c1.myIdx.value).toBe(0)
        expect(c2.myIdx.value).toBe(1)
        expect(c3.myIdx.value).toBe(2)
    })

    it('removeChild clears parent and removes child from elements', () => {
        const parent = new TestNode()
        const child  = new TestNode()
        parent.appendChild(child)
        parent.removeChild(child)
        expect(child.parent.value).toBeNull()
        expect(parent.elements.value).not.toContain(child)
    })

    it('nextSibling returns the following child, null for the last', () => {
        const parent = new TestNode()
        const c1 = new TestNode()
        const c2 = new TestNode()
        parent.appendChild(c1)
        parent.appendChild(c2)
        expect(c1.nextSibling.value).toBe(c2)
        expect(c2.nextSibling.value).toBeNull()
    })

    it('moves existing children without duplicating or unmounting them', () => {
        const parent = new TestNode()
        const c1 = new TestNode()
        const c2 = new TestNode()
        const c3 = new TestNode()
        const onRemoved = vi.spyOn(c1, 'onRemoved')
        parent.appendChild(c1)
        parent.appendChild(c2)
        parent.appendChild(c3)

        parent.insertBefore(c3, c1)
        parent.appendChild(c1)

        expect(parent.elements.value).toEqual([c3, c2, c1])
        expect(new Set(parent.elements.value)).toHaveLength(3)
        expect(c3.myIdx.value).toBe(0)
        expect(c2.myIdx.value).toBe(1)
        expect(c1.myIdx.value).toBe(2)
        expect(onRemoved).not.toHaveBeenCalled()

        parent.removeChild(c1)
        expect(parent.elements.value).toEqual([c3, c2])
        expect(c1.parent.value).toBeNull()
        expect(onRemoved).toHaveBeenCalledOnce()
    })

    it('moves a child between parents without running removal cleanup', () => {
        const firstParent = new TestNode()
        const secondParent = new TestNode()
        const child = new TestNode()
        const onRemoved = vi.spyOn(child, 'onRemoved')
        firstParent.appendChild(child)

        secondParent.appendChild(child)

        expect(firstParent.elements.value).toEqual([])
        expect(secondParent.elements.value).toEqual([child])
        expect(child.parent.value).toBe(secondParent)
        expect(onRemoved).not.toHaveBeenCalled()
    })

    it('elements omits non-renderable children', () => {
        const parent = new TestNode()
        parent.appendChild(new TestNode())
        parent.appendChild(new HiddenNode())
        expect(parent.elements.value).toHaveLength(1)
    })
})

// ── patchProp type coercion ───────────────────────────────────────────────────

describe('patchProp type coercion', () => {

    it('coerces string "true"/"false" to boolean for boolean state props', () => {
        const el = new TestNode()
        el.state.visible = false
        patchProp(el, 'visible', null, 'true')
        expect(el.state.visible).toBe(true)
        patchProp(el, 'visible', null, 'false')
        expect(el.state.visible).toBe(false)
    })

    it('coerces string to number for numeric state props', () => {
        const el = new TestNode()
        el.state.size = 1.0
        patchProp(el, 'size', null, '2.5')
        expect(el.state.size).toBe(2.5)
    })

    it('passes strings through unchanged for string state props', () => {
        const el = new TestNode()
        el.state.text = ''
        patchProp(el, 'text', null, 'hello')
        expect(el.state.text).toBe('hello')
    })

    it('falls back to direct property assignment when key is absent from state', () => {
        const el = new TestNode()
        // el.state has no 'name' key — should assign directly on the node
        patchProp(el, 'name', null, 'myBox')
        expect((el as any).name).toBe('myBox')
    })
})

describe('measuredSize / renderOffset', () => {
    it('a Box reports a box-equivalent footprint and a half-height base offset', () => {
        const box = new Box(measureStage)
        box.setSize(2)
        box.setHeight(0.5)
        expect(box.measuredSize.value).toEqual(new THREE.Vector3(2, 0.5, 2))
        expect(box.renderOffset().y).toBeCloseTo(0.25, 6)
    })
})

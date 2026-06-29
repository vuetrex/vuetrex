import { describe, it, expect } from 'vitest'
import { Base } from '@/lib-components/nodes/Base.js'
import { patchProp } from '@/lib-components/patchProp.js'

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

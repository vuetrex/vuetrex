import { afterEach, describe, it, expect, vi } from 'vitest'
import { nodeOps } from '@/lib-components/nodeOps.js'
import { registerElement, types } from '@/lib-components/nodes/types.js'
import { Comment } from '@/lib-components/nodes/Root.js'
import { Base } from '@/lib-components/nodes/Base.js'
import { patchProp } from '@/lib-components/patchProp.js'
import type { FunctionalComponent, ClassComponent } from '@/lib-components/nodes/types.js'
import { createRenderer, defineComponent, h, nextTick, reactive, ref } from 'vue'

// ── Minimal test doubles (no Three.js / stage dependency) ────────────────────

class TestNode extends Base {
    public state: Record<string, any> = {}
}
(TestNode.prototype as any)['__v_skip'] = true

// FunctionalComponent: stage is ignored, returns a caller-supplied node.
const makeFunctional = () => {
    const node = new TestNode()
    const impl: FunctionalComponent = { setup: () => node }
    return { impl, node }
}

// ClassComponent: extends Base (not Node), so no Element3d / stage needed.
class TestClassElement extends Base {
    public state: Record<string, any> = {}
    constructor(_stage: any) { super() }
}
(TestClassElement.prototype as any)['__v_skip'] = true

class CompoundElement extends Base {
    public state = reactive({
        lines: [] as string[],
        material: null as Record<string, unknown> | null,
    })

    constructor(_stage: any) { super() }
    isRenderableNode(): boolean { return true }
}
(CompoundElement.prototype as any)['__v_skip'] = true

// Stage is not touched by our test implementations.
const mockStage = null as any

// ── registerElement — global registry ────────────────────────────────────────

describe('registerElement', () => {
    const TAG = 'vx-test-custom'

    afterEach(() => {
        delete (types as any)[TAG]
    })

    it('adds the tag to the global registry', () => {
        const { impl } = makeFunctional()
        registerElement(TAG, impl)
        expect(types[TAG]).toBe(impl)
    })

    it('replaces a previous registration for the same tag', () => {
        const { impl: first } = makeFunctional()
        const { impl: second } = makeFunctional()
        registerElement(TAG, first)
        registerElement(TAG, second)
        expect(types[TAG]).toBe(second)
    })
})

// ── nodeOps general functionality
describe('nodeOps', () => {
    const { insert, remove, createComment, parentNode, nextSibling } = nodeOps(mockStage)

    it('insert without anchor appends child and sets parent', () => {
        const parent = new TestNode()
        const child  = new TestNode()
        insert(child, parent, null)
        expect(parentNode(child)).toBe(parent)
    })

    it('insert with anchor places child before anchor', () => {
        const parent = new TestNode()
        const first  = new TestNode()
        const second = new TestNode()
        insert(first,  parent, null)
        insert(second, parent, first)   // second should land before first
        expect(nextSibling(second)).toBe(first)
    })

    it('remove detaches child from parent', () => {
        const parent = new TestNode()
        const child  = new TestNode()
        insert(child, parent, null)
        remove(child)
        expect(parentNode(child)).toBeNull()
    })

    it('createComment returns a Comment with the given text', () => {
        const node = createComment('v-if')
        expect(node).toBeInstanceOf(Comment)
        expect((node as Comment).text).toBe('v-if')
    })

    it('parentNode returns null for a node with no parent', () => {
        expect(parentNode(new TestNode())).toBeNull()
    })

    it('nextSibling returns null when node has no following sibling', () => {
        const parent = new TestNode()
        const only   = new TestNode()
        insert(only, parent, null)
        expect(nextSibling(only)).toBeNull()
    })
})

// ── nodeOps.createElement — per-instance extraTypes ──────────────────────────

describe('compound components in the custom renderer', () => {
    it('keeps one logical child per keyed vnode after reordering', async () => {
        const items = ref(['a', 'b', 'c'])
        const KeyedFixture = defineComponent({
            setup() {
                return () => h('vx-row', null, items.value.map(item =>
                    h('vx-box', { key: item, lines: [item] }),
                ))
            },
        })
        const { render } = createRenderer<Base, Base>({
            patchProp,
            ...nodeOps(mockStage, {
                'vx-row': CompoundElement as unknown as ClassComponent,
                'vx-box': CompoundElement as unknown as ClassComponent,
            }),
        })
        const root = new CompoundElement(mockStage)

        render(h(KeyedFixture), root)
        await nextTick()
        const row = root.elements.value[0] as CompoundElement
        const originalByKey = new Map(row.elements.value.map(child => [
            (child as CompoundElement).state.lines[0],
            child,
        ]))

        items.value = ['c', 'a', 'b']
        await nextTick()

        expect(row.elements.value.map(child => (child as CompoundElement).state.lines[0]))
            .toEqual(['c', 'a', 'b'])
        expect(new Set(row.elements.value)).toHaveLength(3)
        expect(row.elements.value).toEqual([
            originalByKey.get('c'),
            originalByKey.get('a'),
            originalByKey.get('b'),
        ])

        items.value = ['c', 'b']
        await nextTick()
        expect(row.elements.value).toEqual([
            originalByKey.get('c'),
            originalByKey.get('b'),
        ])
    })

    it('updates nested elements with inline reactive props without rendering recursively', async () => {
        const label = ref('first')
        const visible = ref(true)
        let renderCount = 0

        const CompoundFixture = defineComponent({
            name: 'CompoundFixture',
            setup() {
                return () => {
                    renderCount++
                    return h('vx-stack', null, visible.value
                        ? [h('vx-box', {
                            lines: [label.value],
                            material: { color: 0x123456 },
                        })]
                        : [])
                }
            },
        })

        const { render } = createRenderer<Base, Base>({
            patchProp,
            ...nodeOps(mockStage, {
                'vx-stack': CompoundElement as unknown as ClassComponent,
                'vx-box': CompoundElement as unknown as ClassComponent,
            }),
        })
        const root = new CompoundElement(mockStage)

        render(h(CompoundFixture), root)
        await nextTick()

        expect(renderCount).toBe(1)

        label.value = 'second'
        await nextTick()

        expect(renderCount).toBe(2)
        const stack = root.elements.value[0] as CompoundElement
        const box = stack.elements.value[0] as CompoundElement
        expect(box.state.lines).toEqual(['second'])
        expect(box.state.material).toEqual({ color: 0x123456 })

        visible.value = false
        await nextTick()

        expect(renderCount).toBe(3)
        expect(stack.elements.value).toHaveLength(0)

        render(null, root)
        await nextTick()
    })
})

describe('nodeOps.createElement', () => {

    it('resolves a FunctionalComponent from extraTypes and calls setup()', () => {
        const { impl, node } = makeFunctional()
        const { createElement } = nodeOps(mockStage, { 'vx-sphere': impl })
        expect(createElement('vx-sphere')).toBe(node)
    })

    it('resolves a ClassComponent from extraTypes and instantiates it', () => {
        const { createElement } = nodeOps(mockStage, { 'vx-custom': TestClassElement as unknown as ClassComponent })
        expect(createElement('vx-custom')).toBeInstanceOf(TestClassElement)
    })

    it('extraTypes take priority over built-in tags for the same tag name', () => {
        const { impl, node } = makeFunctional()
        // Override the built-in 'vx-row' for this instance only — no other instance is affected.
        const { createElement } = nodeOps(mockStage, { 'vx-row': impl })
        expect(createElement('vx-row')).toBe(node)
    })

    it('falls back to the global registry when tag is absent from extraTypes', () => {
        const TAG = 'vx-fallback-test'
        const { impl, node } = makeFunctional()
        registerElement(TAG, impl)
        try {
            const { createElement } = nodeOps(mockStage, {})
            expect(createElement(TAG)).toBe(node)
        } finally {
            delete (types as any)[TAG]
        }
    })

    it('returns a Comment node and warns for an unknown tag', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { createElement } = nodeOps(mockStage)
        const result = createElement('vx-does-not-exist')
        expect(result).toBeInstanceOf(Comment)
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('vx-does-not-exist'))
        warn.mockRestore()
    })
})

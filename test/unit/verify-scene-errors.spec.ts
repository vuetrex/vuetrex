import { Fragment, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { Base } from '@/lib-components/nodes/Base.js'
import { createRendererForStage } from '@/lib-components/renderer.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type { VxSceneError } from '@/lib-components/diagnostics/sceneErrors.js'

class Host extends Base { protected state = {} }
function fixture() {
    const stage = {
        captureFloorStyle: () => ({ finish: 'matte', color: 123, reflection: 0.2, grid: false, captions: false }),
        applyFloorStyle: vi.fn(),
    } as unknown as VuetrexStage
    const errors: VxSceneError[] = []
    return { stage, errors, root: new Host(), render: createRendererForStage(stage, undefined, error => errors.push(error)) }
}
describe('scene error reporting', () => {
    it('reports bad props with context and permits a subsequent valid update', async () => {
        const { stage, errors, root, render } = fixture()
        render(h('vx-floor', { reflection: 'oops' }), root)
        await nextTick()
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({ tag: 'vx-floor', property: 'reflection', phase: 'prop' })
        expect(errors[0].cause).toBeInstanceOf(Error)
        expect(errors[0].correction).toContain('finite')
        render(h('vx-floor', { reflection: 0.3 }), root)
        await nextTick()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ reflection: 0.3 }))
        render(null, root)
    })
    it('reports async paired-property constraints and recovers when corrected', async () => {
        const { stage, errors, root, render } = fixture()
        render(h('vx-floor', { 'fade-start': 10, 'fade-end': 5 }), root)
        await nextTick()
        expect(errors[0]).toMatchObject({ tag: 'vx-floor', phase: 'effect', property: 'fade-start, fade-end' })
        expect(stage.applyFloorStyle).not.toHaveBeenCalled()
        render(h('vx-floor', { 'fade-start': 10, 'fade-end': 20 }), root)
        await nextTick()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 10, fadeEnd: 20 }))
        render(null, root)
    })
    it('reports unknown tags and constructor failures without preventing sibling mount', async () => {
        const { stage, errors, root } = fixture()
        class Broken extends Host { constructor() { super(); throw new Error('constructor failed') } }
        const render = createRendererForStage(stage, { 'vx-broken': Broken }, e => errors.push(e))
        render(h('vx-floor', {}, [h('vx-typo'), h('vx-broken', { id: 'bad' })]), root)
        await nextTick()
        expect(errors.map(e => e.tag)).toEqual(['vx-typo', 'vx-broken'])
        expect(errors[1].nodeId).toBe('bad')
        expect(stage.applyFloorStyle).toHaveBeenCalled()
        render(null, root)
    })
    it('reports duplicate declarations during queued sync and still tears down', async () => {
        const { errors, root, render } = fixture()
        render(h(Fragment, [h('vx-floor'), h('vx-floor')]), root)
        await nextTick()
        expect(errors.some(e => e.message.includes('Only one'))).toBe(true)
        render(null, root)
    })
})

it('leaves the logical tree intact when stage registration rejects an insertion', () => {
    const registerNode = vi.fn()
    class SpatialHost extends Host {
        stage = { registerNode, connectors: { remove: vi.fn() } }
        override isRenderableNode() { return true }
    }
    const original = new Host(), destination = new Host(), child = new SpatialHost()
    original.appendChild(child)
    registerNode.mockImplementation(() => { throw new Error('duplicate id') })
    expect(() => destination.appendChild(child)).toThrow('duplicate id')
    expect(child.getHostParent()).toBe(original)
    expect(original.getHostChildren()).toEqual([child])
    expect(destination.getHostChildren()).toEqual([])
    original.removeChild(child)
})

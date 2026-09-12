import { defineComponent, h, nextTick, onBeforeUnmount, onUnmounted, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Base } from '@/lib-components/nodes/Base.js'
import type { ClassComponent } from '@/lib-components/nodes/types.js'

const stageMock = vi.hoisted(() => ({
    events: [] as string[],
    instances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
}))

vi.mock('@/lib-components/three/stage.js', () => ({
    VuetrexStage: class {
        mount = vi.fn()
        start = vi.fn()
        pause = vi.fn()
        unpause = vi.fn()
        sendCameraTo = vi.fn()
        destroy = vi.fn(() => stageMock.events.push('stage-destroyed'))

        constructor() {
            stageMock.instances.push(this)
        }
    },
}))

import Vuetrex from '@/lib-components/vuetrex.js'

class TestElement extends Base {
    public state = { value: 0 }
    constructor(_stage: unknown) { super() }
}
(TestElement.prototype as any).__v_skip = true

describe('Vuetrex custom-renderer lifecycle', () => {
    beforeEach(() => {
        stageMock.events.length = 0
        stageMock.instances.length = 0
    })

    it('unmounts slot components before destroying the stage', async () => {
        const store = ref(0)
        const beforeUnmount = vi.fn(() => stageMock.events.push('slot-before-unmount'))
        const unmounted = vi.fn(() => stageMock.events.push('slot-unmounted'))
        let renderCount = 0
        const SlotComponent = defineComponent({
            setup() {
                onBeforeUnmount(beforeUnmount)
                onUnmounted(unmounted)
                return () => {
                    renderCount++
                    return h('vx-test', { value: store.value })
                }
            },
        })
        const wrapper = mount(Vuetrex, {
            props: {
                stopped: true,
                elements: { 'vx-test': TestElement as unknown as ClassComponent },
            },
            slots: { default: () => h(SlotComponent) },
        })
        await nextTick()
        await flushPromises()

        expect(renderCount).toBe(1)
        expect(stageMock.instances).toHaveLength(1)

        wrapper.unmount()
        await nextTick()

        expect(beforeUnmount).toHaveBeenCalledOnce()
        expect(unmounted).toHaveBeenCalledOnce()
        expect(stageMock.instances[0].destroy).toHaveBeenCalledOnce()
        expect(stageMock.events.indexOf('slot-before-unmount'))
            .toBeLessThan(stageMock.events.indexOf('stage-destroyed'))

        store.value++
        await nextTick()
        expect(renderCount).toBe(1)
    })
})

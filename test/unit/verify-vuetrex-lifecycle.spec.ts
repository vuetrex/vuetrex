import { defineComponent, h, nextTick, onBeforeUnmount, onUnmounted, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Base } from '@/lib-components/nodes/Base.js'
import { VxStylesheet, type VxStyleSheetDefinition } from '@/lib-components/styling/stylesheets.js'
import type { ClassComponent } from '@/lib-components/nodes/types.js'

const stageMock = vi.hoisted(() => ({
    events: [] as string[],
    instances: [] as Array<{ destroy: ReturnType<typeof vi.fn>; materialStyles?: { value: Record<string, unknown> }; connectorAppearances?: { value: Record<string, unknown> } }>,
}))

vi.mock('@/lib-components/three/stage.js', () => ({
    VuetrexStage: class {
        mount = vi.fn()
        start = vi.fn()
        pause = vi.fn()
        unpause = vi.fn()
        setCamera = vi.fn()
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
    afterEach(() => vi.unstubAllGlobals())
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

    it('resolves reactive scene props over independently inherited stylesheet values', async () => {
        let onSchemeChange: (() => void) | undefined
        const media = { matches: true, addEventListener: (_: string, listener: () => void) => { onSchemeChange = listener },
            removeEventListener: vi.fn() }
        vi.stubGlobal('matchMedia', vi.fn(() => media))
        const parentSheet: VxStyleSheetDefinition = { common: { materials: { shared: { base: { color: 'red' } } },
            connectors: { shared: { strokeColor: '#ff0000' } } },
            dark: { materials: { dark: { base: { color: 'black' } } } } }
        const localSheet: VxStyleSheetDefinition = { common: { materials: { local: { base: { color: 'blue' } } },
            connectors: { local: { strokeColor: '#0000ff' } } },
            dark: { materials: { localDark: { base: { color: 'black' } } } } }
        const sceneSheets = ref<readonly VxStyleSheetDefinition[] | undefined>([localSheet])
        const sceneScheme = ref<'light' | 'dark' | undefined>(undefined)
        const Parent = defineComponent({
            setup() { return () => h(VxStylesheet, { sheets: [parentSheet], scheme: 'dark' }, () =>
                h(Vuetrex, { stopped: true, sheets: sceneSheets.value, scheme: sceneScheme.value }, () => [])) },
        })
        const wrapper = mount(Parent)
        await nextTick()
        const stage = stageMock.instances[0]
        expect(Object.keys(stage.materialStyles!.value).sort()).toEqual(['local', 'localDark'])
        expect(Object.keys(stage.connectorAppearances!.value)).toEqual(['local'])

        sceneSheets.value = undefined
        sceneScheme.value = 'light'
        await nextTick()
        expect(Object.keys(stage.materialStyles!.value)).toEqual(['shared'])
        expect(Object.keys(stage.connectorAppearances!.value)).toEqual(['shared'])
        sceneSheets.value = [localSheet]
        sceneScheme.value = undefined
        await nextTick()
        expect(Object.keys(stage.materialStyles!.value).sort()).toEqual(['local', 'localDark'])
        sceneScheme.value = 'system'
        await nextTick()
        expect(Object.keys(stage.materialStyles!.value).sort()).toEqual(['local', 'localDark'])
        media.matches = false
        onSchemeChange?.()
        await nextTick()
        expect(Object.keys(stage.materialStyles!.value)).toEqual(['local'])
        wrapper.unmount()
        expect(media.removeEventListener).toHaveBeenCalledOnce()
    })
})

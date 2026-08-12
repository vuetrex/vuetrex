import { beforeEach, describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { defineComponent, ref, nextTick, markRaw } from 'vue'
import Simple from './Simple.vue'
import { Vuetrex } from '@/lib-components'
import type { VxStage } from '@/lib-components'

// ── WebGL stub ────────────────────────────────────────────────────────────────
// Satisfies Three.js's canvas probe without needing a real GPU context.
beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = (type: string) => ({
        getParameter(p: any) { return 'WebGL 1.0' },
        getExtension(p: any) { return 0 },
        createTexture() { return [] },
        bindTexture() { return [] },
        texParameteri() { return [] },
        texImage2D() { return [] },
        clearColor() {},
        clearRect() {},
        fillRect() {},
        clearDepth() {},
        clearStencil() {},
        depthFunc() {},
        enable() {},
        frontFace() {},
        cullFace() {},
        scissor() {},
        viewport() {},
        disable() {},
        clear() {},
    }) as any
})

// ── Reactive test fixture ─────────────────────────────────────────────────────
// An inline component whose reactive state (label, shown, items) drives a
// Vuetrex template. shallowMount stubs <vuetrex> itself, so no WebGL context
// is needed here. The custom renderer / node tree is exercised separately in
// verify-nodes.spec.ts.
const ReactiveFixture = defineComponent({
    components: { Vuetrex },
    props: {
        items: { type: Array, default: () => [] }
    },
    setup() {
        const label          = ref('initial')
        const shown          = ref(true)
        const capturedStage  = ref<VxStage | null>(null)

        function onReady(stage: VxStage) {
            capturedStage.value = stage
        }

        return { label, shown, capturedStage, onReady }
    },
    template: `
        <vuetrex @ready="onReady">
          <vx-layer :visible="shown">
            <vx-row>
              <vx-box name="b1" :text="label" />
              <vx-box v-for="(item, i) in items" :key="i"
                   :name="'item-'+i" :text="String(item)" />
            </vx-row>
          </vx-layer>
        </vuetrex>
    `
})

// ── Original test ──────────────────────────────────────────────────────────────
describe('Vuetrex Component works object', () => {
    it('should be able to mount Scene', function() {
        // @ts-ignore
        const wrapper = shallowMount(Simple, {})
        expect(wrapper).toBeDefined()
        expect(wrapper.vm.counter.valueOf()).toBe(0)
    })
})

// ── Reactivity tests ───────────────────────────────────────────────────────────
describe('ReactiveFixture: Vue reactivity with Vuetrex', () => {

    it('initialises with default state', () => {
        const wrapper = shallowMount(ReactiveFixture)
        expect(wrapper.vm.label).toBe('initial')
        expect(wrapper.vm.shown).toBe(true)
        expect(wrapper.vm.capturedStage).toBeNull()
    })

    it('label ref update is reflected after nextTick', async () => {
        const wrapper = shallowMount(ReactiveFixture)
        wrapper.vm.label = 'updated'
        await nextTick()
        expect(wrapper.vm.label).toBe('updated')
    })

    it('shown toggle changes the v-if flag', async () => {
        const wrapper = shallowMount(ReactiveFixture)
        wrapper.vm.shown = false
        await nextTick()
        expect(wrapper.vm.shown).toBe(false)
        wrapper.vm.shown = true
        await nextTick()
        expect(wrapper.vm.shown).toBe(true)
    })

    it('items prop change is reactive', async () => {
        const wrapper = shallowMount(ReactiveFixture, {
            props: { items: ['x', 'y'] }
        })
        expect(wrapper.props('items')).toHaveLength(2)
        await wrapper.setProps({ items: ['x', 'y', 'z'] })
        expect(wrapper.props('items')).toHaveLength(3)
    })

    it('@ready handler receives and stores the VxStage', async () => {
        const wrapper = shallowMount(ReactiveFixture)
        // markRaw tells Vue not to wrap the stage in a reactive proxy,
        // which preserves object identity so toBe() works correctly.
        const mockStage = markRaw({ getScene: () => ({}) } as unknown as VxStage)
        wrapper.vm.onReady(mockStage)
        await nextTick()
        expect(wrapper.vm.capturedStage).toBe(mockStage)
    })
})

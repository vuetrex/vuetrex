import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ order: [] as string[], setCamera: vi.fn(), destroy: vi.fn() }))
vi.mock('@/lib-components/three/stage.js', () => ({
    VuetrexStage: class {
        setCamera(view: unknown) { calls.order.push('camera'); calls.setCamera(view) }
        mount() { calls.order.push('mount') }
        start() { calls.order.push('start') }
        pause() {}
        unpause() {}
    },
}))
vi.mock('@/lib-components/nodes/Root.js', () => ({ Root: class { destroy() { calls.destroy() } } }))
vi.mock('@/lib-components/renderer.js', () => ({ createRendererForStage: () => () => {} }))
import Vuetrex from '@/lib-components/vuetrex.js'

describe('root camera initialization', () => {
    it('sets the explicit pose before ready and does not overwrite ready animations afterward', async () => {
        calls.order.length = 0; calls.setCamera.mockClear(); calls.destroy.mockClear()
        const camera = { orbit: { target: [0, 0, 0] as const, height: 9, radius: 24, azimuth: -30 } }
        const wrapper = mount(Vuetrex, {
            props: { camera, onReady: () => calls.order.push('ready animation') },
            slots: { default: () => h('vx-box') },
        })
        await nextTick()
        expect(calls.order).toEqual(['camera', 'mount', 'ready animation', 'start'])
        expect(calls.setCamera).toHaveBeenCalledExactlyOnceWith(camera)
        await wrapper.setProps({ camera: { orbit: { ...camera.orbit } } })
        expect(calls.setCamera).toHaveBeenCalledTimes(1)
        await wrapper.setProps({ camera: { orbit: { ...camera.orbit, height: 10 } } })
        expect(calls.setCamera).toHaveBeenCalledTimes(2)
        await wrapper.setProps({ camera: 'scene' })
        expect(calls.setCamera).toHaveBeenLastCalledWith('scene')
        wrapper.unmount()
        expect(calls.destroy).toHaveBeenCalledOnce()
    })
})

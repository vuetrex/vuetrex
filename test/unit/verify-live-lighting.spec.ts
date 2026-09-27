import * as THREE from 'three'
import { h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { LiveLighting } from '@/lib-components/three/lighting/LiveLighting.js'
import { LightingDeclaration } from '@/lib-components/scene/declarations.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import Scene from '@/lib-components/three/scene.js'
import { Base } from '@/lib-components/nodes/Base.js'
import { createRendererForStage } from '@/lib-components/renderer.js'

class HostRoot extends Base { protected state = {} }
function fixture(shadows = true, limit = 4096) {
    const scene = new THREE.Scene()
    const rig = new LiveLighting(scene, {}, shadows, limit)
    const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
    Object.assign(stage, { liveLighting: rig })
    return { rig, scene, stage }
}

describe('live lighting', () => {
    it('preserves the existing rig defaults and leaves external lights and environment alone', () => {
        const { rig, scene } = fixture()
        const external = new THREE.DirectionalLight(0xff0000, 3)
        const environment = new THREE.Texture()
        scene.add(external); scene.environment = environment
        expect(rig.capture()).toEqual({ keyIntensity: 5.5, fillIntensity: 2, shadowQuality: 'medium' })
        expect(rig.key.shadow.mapSize.x).toBe(512)
        expect(rig.key.shadow.blurSamples).toBe(16)
        rig.apply({ keyIntensity: 0, fillIntensity: 4, shadowQuality: 'high' })
        expect(rig.key.intensity).toBe(0)
        expect(rig.fill.intensity).toBe(4)
        expect(rig.key.shadow.mapSize.x).toBe(1024)
        expect(external.intensity).toBe(3)
        rig.dispose(); rig.dispose()
        expect(scene.children).toEqual([external])
        expect(scene.environment).toBe(environment)
    })

    it('disposes both shadow targets on resize, disable, and teardown, but retains them on intensity changes', () => {
        const { rig } = fixture()
        function targets() {
            rig.key.shadow.map = new THREE.WebGLRenderTarget(512, 512)
            rig.key.shadow.mapPass = new THREE.WebGLRenderTarget(512, 512)
            return [rig.key.shadow.map, rig.key.shadow.mapPass].map(t => vi.spyOn(t, 'dispose'))
        }
        const old = targets()
        rig.apply({ keyIntensity: 1 })
        old.forEach(spy => expect(spy).not.toHaveBeenCalled())
        rig.apply({ shadowQuality: 'high' })
        old.forEach(spy => expect(spy).toHaveBeenCalledOnce())
        expect(rig.key.shadow.map).toBeNull()
        expect(rig.key.shadow.mapPass).toBeNull()
        const disabled = targets()
        rig.apply({ shadowQuality: 'off' })
        disabled.forEach(spy => expect(spy).toHaveBeenCalledOnce())
        expect(rig.key.castShadow).toBe(false)
        rig.apply({ shadowQuality: 'low' })
        expect(rig.key.castShadow).toBe(true)
        expect(rig.key.shadow.mapSize.x).toBe(256)
        const final = targets()
        rig.dispose(); rig.dispose()
        final.forEach(spy => expect(spy).toHaveBeenCalledOnce())
    })

    it('retains lighting on floor replacement and releases it before stage teardown', () => {
        const { rig, stage, scene } = fixture()
        Object.assign(stage, {
            settings: { floorMirror: false }, scene, caps: {}, createFloor: vi.fn(),
            clearDiagnostics: vi.fn(), connectors: { clear: vi.fn() },
            nodesById: new Map(), nodesByName: new Map(),
        })
        stage.applyFloorStyle({ finish: 'mirror', reflection: 0.6 })
        expect(rig.key.parent).toBe(scene)
        rig.key.shadow.map = new THREE.WebGLRenderTarget(512, 512)
        const dispose = vi.spyOn(rig.key.shadow.map, 'dispose')
        const baseDestroy = vi.spyOn(Scene.prototype, 'destroy').mockImplementation(() => {
            expect(dispose).toHaveBeenCalledOnce()
            expect(rig.key.parent).toBeNull()
        })
        try {
            stage.destroy(); stage.destroy()
            expect(baseDestroy).toHaveBeenCalledOnce()
        } finally { baseDestroy.mockRestore() }
    })

    it('respects the global shadow disable and GPU texture limit', () => {
        const { rig } = fixture(false, 512)
        rig.apply({ shadowQuality: 'high' })
        expect(rig.key.castShadow).toBe(false)
        expect(rig.key.shadow.mapSize.x).toBe(512)
        rig.dispose()
    })

    it('reconciles both spellings, removed props, ownership, and restoration through Vue', async () => {
        const { stage, rig } = fixture()
        rig.apply({ keyIntensity: 7, fillIntensity: 3, shadowQuality: 'low' })
        const root = new HostRoot(), render = createRendererForStage(stage)
        render(h('vx-lighting', { 'key-intensity': '0', 'fill-intensity': '1', 'shadow-quality': 'high' }), root)
        await nextTick()
        expect(rig.capture()).toEqual({ keyIntensity: 0, fillIntensity: 1, shadowQuality: 'high' })
        const competing = new LightingDeclaration(stage)
        competing.parent.value = root
        expect(() => competing.syncWithThree()).toThrow('Only one vx-lighting')
        render(h('vx-lighting', { keyIntensity: 4, fillIntensity: 5, shadowQuality: 'off' }), root)
        await nextTick()
        expect(rig.capture()).toEqual({ keyIntensity: 4, fillIntensity: 5, shadowQuality: 'off' })
        render(h('vx-lighting'), root); await nextTick()
        expect(rig.capture()).toEqual({ keyIntensity: 5.5, fillIntensity: 2, shadowQuality: 'medium' })
        render(null, root); await nextTick()
        expect(rig.capture()).toEqual({ keyIntensity: 7, fillIntensity: 3, shadowQuality: 'low' })
        competing.syncWithThree(); await nextTick(); competing.onRemoved()
        rig.dispose()
    })

    it('rejects invalid values without changing the rig', () => {
        const { rig, stage } = fixture()
        const node = new LightingDeclaration(stage)
        for (const value of [true, [], {}, '', 'bad', Infinity, NaN]) {
            expect(() => node.setStateValue('key-intensity', value)).toThrow('finite')
        }
        for (const value of [-1, Infinity, NaN]) {
            expect(() => rig.apply({ keyIntensity: value })).toThrow('nonnegative')
            expect(() => rig.apply({ fillIntensity: value })).toThrow('nonnegative')
        }
        for (const value of ['ultra', 'toString', null, undefined]) {
            expect(() => rig.apply({ shadowQuality: value as any })).toThrow('shadowQuality')
        }
        expect(rig.capture().keyIntensity).toBe(5.5)
        expect(() => node.setStateValue('unknown', 1)).toThrow('Unknown')
        rig.dispose()
    })
})

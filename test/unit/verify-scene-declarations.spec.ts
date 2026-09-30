import * as THREE from 'three'
import { h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { EnvironmentDeclaration, CameraDeclaration, FloorDeclaration } from '@/lib-components/scene/declarations.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import { Base } from '@/lib-components/nodes/Base.js'
import { createRendererForStage } from '@/lib-components/renderer.js'
import { patchProp } from '@/lib-components/patchProp.js'

class HostRoot extends Base { protected state = {} }

function fixture() {
    const scene = new THREE.Scene()
    const stage = { getScene: () => scene, boxDistance: 1, gap: 1,
        captureCameraView: vi.fn(() => ({ direction: [0, 1, 1], padding: 0.75, duration: 0, target: 'scene' })),
        setCameraView: vi.fn(), restoreCameraView: vi.fn(),
        captureFloorStyle: vi.fn(() => ({ finish: 'matte', color: 123, reflection: 0.2, grid: true, captions: true })),
        applyFloorStyle: vi.fn(),
    } as unknown as VuetrexStage
    return { scene, stage, parent: new GroupNode(stage) }
}

describe('scene declarations', () => {
    it('reconciles both floor prop spellings and omitted bindings through the Vue renderer', async () => {
        const { stage } = fixture()
        const root = new HostRoot(), render = createRendererForStage(stage)
        try {
            render(h('vx-floor', { 'fade-start': '11', 'fade-end': '18' }), root)
            await nextTick()
            expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 11, fadeEnd: 18 }))
            render(h('vx-floor', { fadeStart: 12, fadeEnd: 20 }), root)
            await nextTick()
            expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 12, fadeEnd: 20 }))
            render(h('vx-floor'), root)
            await nextTick()
            expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: undefined, fadeEnd: undefined }))
            render(h('vx-floor', { 'fade-start': '0', 'fade-end': '10' }), root)
            await nextTick()
            expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 0, fadeEnd: 10 }))
        } finally { render(null, root); await nextTick() }
    })

    it.each(['fade-start', 'fadeStart', 'fade-end', 'fadeEnd'])('rejects invalid %s values without losing the previous value', key => {
        const { stage } = fixture()
        const node = new FloorDeclaration(stage)
        patchProp(node, key, null, 10)
        for (const value of [NaN, Infinity, -Infinity, 'bad', '', '  ', true, false, [], [1], {}]) {
            expect(() => patchProp(node, key, 10, value)).toThrow('must be finite')
        }
        expect((node as any).state[key.includes('tart') ? 'fadeStart' : 'fadeEnd']).toBe(10)
        for (const removed of [null, undefined]) {
            patchProp(node, key, 10, removed)
            expect((node as any).state[key.includes('tart') ? 'fadeStart' : 'fadeEnd']).toBeUndefined()
            patchProp(node, key, removed, '12')
        }
    })

    it.each([
        [EnvironmentDeclaration, 'intensity', 0.55],
        [CameraDeclaration, 'padding', 0.75],
        [FloorDeclaration, 'reflection', 0.6],
    ] as const)('validates and resets numeric props on %s', (Type, key, fallback) => {
        const node = new Type(fixture().stage)
        for (const value of [true, [], {}, '', 'bad', Infinity]) {
            expect(() => patchProp(node, key, null, value)).toThrow('must be finite')
        }
        patchProp(node, key, null, '0.25')
        expect((node as any).state[key]).toBe(0.25)
        for (const removed of [null, undefined]) {
            patchProp(node, key, '0.25', removed)
            expect((node as any).state[key]).toBe(fallback)
        }
        expect(() => patchProp(node, 'unknown-prop', null, 1)).toThrow('Unknown')
    })

    it.each([
        [EnvironmentDeclaration, 'enabled', true],
        [FloorDeclaration, 'grid', false],
    ] as const)('validates and resets boolean props on %s', (Type, key, fallback) => {
        const node = new Type(fixture().stage)
        for (const value of [true, '', 'true']) { patchProp(node, key, null, value); expect((node as any).state[key]).toBe(true) }
        for (const value of [false, 'false']) { patchProp(node, key, null, value); expect((node as any).state[key]).toBe(false) }
        for (const value of [0, 1, 'yes', [], {}]) expect(() => patchProp(node, key, null, value)).toThrow('boolean')
        for (const removed of [null, undefined]) { patchProp(node, key, true, removed); expect((node as any).state[key]).toBe(fallback) }
    })

    it('validates scene constraints after paired props have been updated', () => {
        const { stage } = fixture()
        const floor = new FloorDeclaration(stage)
        floor.setStateValue('fade-start', 10)
        expect(() => (floor as any).apply()).toThrow('set together')
        floor.setStateValue('fadeEnd', 5)
        expect(() => (floor as any).apply()).toThrow('fadeStart < fadeEnd')
        floor.setStateValue('fade-end', 20)
        expect(() => (floor as any).apply()).not.toThrow()
        floor.setStateValue('reflection', 2)
        expect(() => (floor as any).apply()).toThrow('between 0 and 1')
        floor.setStateValue('reflection', null)
        floor.setStateValue('finish', 'invalid')
        expect(() => (floor as any).apply()).toThrow('matte or mirror')

        const environment = new EnvironmentDeclaration(stage)
        environment.setStateValue('intensity', -1)
        expect(() => (environment as any).apply()).toThrow('negative')
        environment.setStateValue('intensity', null)
        environment.setStateValue('texture', {})
        expect(() => (environment as any).apply()).toThrow('Texture')
        environment.setStateValue('preset', 'invalid')
        expect(() => (environment as any).apply()).toThrow('studio preset')

        const camera = new CameraDeclaration(stage)
        for (const direction of [[0, 0, 0], [0, -1, 1], [0, Infinity, 1], [1, 2], [, , 1], {}]) {
            camera.setStateValue('direction', direction)
            expect(() => (camera as any).apply()).toThrow('Camera direction')
        }
        camera.setStateValue('direction', null)
        camera.setStateValue('duration', -1)
        expect(() => (camera as any).apply()).toThrow('negative')
        camera.setStateValue('duration', undefined)
        expect(() => (camera as any).apply()).not.toThrow()
    })

    it('accepts template floor fade bindings, validates them, and resets removed values', async () => {
        const { stage, parent } = fixture()
        const floor = new FloorDeclaration(stage)
        floor.setStateValue('fade-start', '11')
        floor.setStateValue('fade-end', '18')
        parent.appendChild(floor); floor.syncWithThree(); await nextTick()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 11, fadeEnd: 18 }))
        expect(() => floor.setStateValue('fade-start', 'invalid')).toThrow('must be finite')
        floor.setStateValue('fade-start', undefined)
        floor.setStateValue('fade-end', undefined)
        await nextTick()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: undefined, fadeEnd: undefined }))
        parent.removeChild(floor)
    })
    it('preserves one generated environment across updates, borrows textures, and restores baseline exactly once', async () => {
        const { scene, stage, parent } = fixture()
        const baseline = new THREE.Texture(), borrowed = new THREE.Texture()
        scene.environment = baseline; scene.environmentIntensity = 0.8
        scene.environmentRotation.y = 0.4
        const borrowedDispose = vi.spyOn(borrowed, 'dispose')
        const baselineDispose = vi.spyOn(baseline, 'dispose')
        const node = new EnvironmentDeclaration(stage)
        parent.appendChild(node); node.syncWithThree(); node.syncWithThree()
        await nextTick()
        const generated = scene.environment!
        const dispose = vi.spyOn(generated, 'dispose')
        expect(parent.elements.value).toHaveLength(0)
        node.setStateValue('intensity', 2); node.setStateValue('rotation', 1)
        await nextTick()
        expect(scene.environment).toBe(generated)
        expect(scene.environmentIntensity).toBe(2)
        node.setStateValue('enabled', false)
        await nextTick(); expect(scene.environment).toBeNull()
        node.setStateValue('enabled', undefined)
        node.setStateValue('texture', borrowed)
        await nextTick(); expect(scene.environment).toBe(borrowed)
        expect(dispose).toHaveBeenCalledOnce()
        node.setStateValue('texture', undefined)
        node.setStateValue('intensity', undefined)
        await nextTick()
        expect(scene.environment).not.toBe(generated)
        const replacementDispose = vi.spyOn(scene.environment!, 'dispose')
        expect(scene.environmentIntensity).toBe(0.55)
        parent.removeChild(node); node.onRemoved(); node.syncWithThree()
        expect(scene.environment).toBe(baseline)
        expect(scene.environmentIntensity).toBe(0.8)
        expect(scene.environmentRotation.y).toBe(0.4)
        expect(dispose).toHaveBeenCalledOnce()
        expect(replacementDispose).toHaveBeenCalledOnce()
        expect(borrowedDispose).not.toHaveBeenCalled()
        expect(baselineDispose).not.toHaveBeenCalled()
    })
    it('rejects competing scene ownership and releases it on removal', async () => {
        const { stage, parent } = fixture()
        const a = new EnvironmentDeclaration(stage), b = new EnvironmentDeclaration(stage)
        parent.appendChild(a); a.syncWithThree()
        // Set the second parent directly so a queued renderer sync does not repeat the expected error.
        b.parent.value = parent
        expect(() => b.syncWithThree()).toThrow('Only one vx-environment')
        parent.removeChild(a); b.syncWithThree()
        await nextTick(); b.onRemoved()
    })
    it('resets removed camera/floor props and restores construction state', async () => {
        const { stage, parent } = fixture()
        const camera = new CameraDeclaration(stage), floor = new FloorDeclaration(stage)
        camera.setStateValue('direction', [8, 6, 11]); camera.setStateValue('padding', 2)
        floor.setStateValue('finish', 'mirror'); floor.setStateValue('reflection', 0.8)
        floor.setStateValue('fadeStart', 20); floor.setStateValue('fadeEnd', 50)
        parent.appendChild(camera); parent.appendChild(floor)
        camera.syncWithThree(); floor.syncWithThree(); await nextTick()
        expect(stage.setCameraView).toHaveBeenLastCalledWith({ direction: [8, 6, 11], padding: 2, duration: 0.6, motion: undefined })
        floor.setStateValue('reflection', undefined); camera.setStateValue('padding', undefined)
        await nextTick()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ reflection: 0.6 }))
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith(expect.objectContaining({ fadeStart: 20, fadeEnd: 50 }))
        expect(stage.setCameraView).toHaveBeenLastCalledWith(expect.objectContaining({ padding: 0.75 }))
        parent.removeChild(camera); parent.removeChild(floor)
        camera.onRemoved(); floor.onRemoved()
        expect(stage.restoreCameraView).toHaveBeenCalledOnce()
        expect(stage.applyFloorStyle).toHaveBeenLastCalledWith({ finish: 'matte', color: 123, reflection: 0.2, grid: true, captions: true })
    })
    it('retains hidden caption records so enabling captions does not require rebuilding meshes', () => {
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        const mesh = new THREE.Mesh()
        const captions: unknown[] = []
        Object.assign(stage, { settings: { floorCaptions: false }, captions, caps: { updateFn: vi.fn() } })
        stage.addCaption({ mesh, node: { visible: true }, getWorldPosition: () => new THREE.Vector3(1, 0, 1) } as any, 1, 'caption')
        expect(captions).toHaveLength(1)
        expect(mesh.userData.caption.text).toBe('caption')
    })
    it('disposes replaced floor resources once and skips identical settings', () => {
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        const geometry = new THREE.PlaneGeometry(), material = new THREE.MeshStandardMaterial(), texture = new THREE.Texture()
        const disposals = [geometry, material, texture].map(x => vi.spyOn(x, 'dispose'))
        Object.assign(stage, { settings: { floorMirror: false }, scene: new THREE.Scene(),
            floorSurface: new THREE.Mesh(geometry, material), caps: { texture: { texture }, updateFn: () => {} },
            createFloor: vi.fn() })
        stage.applyFloorStyle({ finish: 'mirror', reflection: 0.6 })
        stage.applyFloorStyle({ finish: 'mirror', reflection: 0.6 })
        expect(stage.createFloor).toHaveBeenCalledOnce()
        disposals.forEach(dispose => expect(dispose).toHaveBeenCalledOnce())
    })
})

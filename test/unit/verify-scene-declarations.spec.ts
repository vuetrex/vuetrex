import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { EnvironmentDeclaration, CameraDeclaration, FloorDeclaration } from '@/lib-components/scene/declarations.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'

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
        expect(stage.setCameraView).toHaveBeenLastCalledWith({ direction: [8, 6, 11], padding: 2, duration: 0.6 })
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

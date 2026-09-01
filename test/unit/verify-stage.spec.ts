import Vuetrex from '@/lib-components/vuetrex.js'
import * as THREE from 'three'
import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createRendererForStage } from '@/lib-components/renderer.js';
import {
    attachFloorOverlay,
    cameraFrameForBounds,
    createBackgroundWallGeometry,
    VuetrexStage,
    worldBoundsOf,
} from '@/lib-components/three/stage.js';

describe('The Vuetrex Stage object', () => {

    it("should create a renderer for the given stage", () => {
        const mockStage = null as any
        const render = createRendererForStage(mockStage, {})
        expect(typeof render).toBe('function')
    })

    it('should be able to mount Stage', function() {
        // @ts-ignore
        const wrapper = shallowMount(Vuetrex,{
            propsData: {
                camera: "camera"
            }
        });
        expect(wrapper).toBeDefined();
        expect(wrapper.vm.camera).toBe("camera");
    })

    it('paints the floor grid with an explicit color when there are no captions', () => {
        const fillColors: string[] = []
        const texture = {
            fillStyle: '',
            context: {
                font: '',
                measureText: () => ({ width: 0 }),
            },
            clear(fillStyle?: string) {
                if (fillStyle !== undefined) this.fillStyle = fillStyle
                return this
            },
            drawText() { return this },
            setGlobalAlpha() {},
            fillRect() { fillColors.push(this.fillStyle) },
        }
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            settings: { floorColor: 0x171b1d, captionColor: 0xe8ecee, mirrorOpacity: 0.76 },
            boxRadius: 1,
            captions: [],
            caps: { size: 2048, repeats: 17, texture },
        })

        stage.repaintTitles(256)

        expect(fillColors).toHaveLength(240)
        expect(new Set(fillColors)).toEqual(new Set(['#e8ecee']))
    })

    it('keeps the floor overlay out of the reflector render pass', () => {
        const scene = new THREE.Scene()
        const reflector = new THREE.Mesh(new THREE.PlaneGeometry(100, 100))
        reflector.rotation.x = -Math.PI / 2
        reflector.position.y = -0.251
        scene.add(reflector)

        const material = new THREE.MeshBasicMaterial({ transparent: true })
        const overlay = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), material)
        attachFloorOverlay(scene, overlay, reflector)
        reflector.updateWorldMatrix(true, true)

        expect(overlay.parent).toBe(reflector)
        expect(overlay.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(-0.2495)
        expect(material.depthWrite).toBe(false)
        expect(material.polygonOffset).toBe(true)

        reflector.visible = false
        expect(overlay.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(-0.2495)
        expect(overlay.parent?.visible).toBe(false)
    })

    it('lets an unreflected floor own scene depth', () => {
        const scene = new THREE.Scene()
        const material = new THREE.MeshBasicMaterial({ transparent: true })
        const overlay = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), material)

        attachFloorOverlay(scene, overlay)

        expect(overlay.parent).toBe(scene)
        expect(overlay.position.y).toBeCloseTo(-0.2495)
        expect(overlay.rotation.x).toBeCloseTo(-Math.PI / 2)
        expect(material.depthWrite).toBe(true)
        expect(material.polygonOffset).toBe(false)
    })

    it('creates flat and curved background wall geometries', () => {
        const flat = createBackgroundWallGeometry({ shape: 'flat', width: 12, height: 5 })
        flat.computeBoundingBox()
        expect(flat.boundingBox!.getSize(new THREE.Vector3()).toArray()).toEqual([12, 5, 0])

        const curved = createBackgroundWallGeometry({ shape: 'curved', radius: 7, height: 4, arc: 100 })
        curved.computeBoundingBox()
        const curvedSize = curved.boundingBox!.getSize(new THREE.Vector3())
        expect(curved).toBeInstanceOf(THREE.CylinderGeometry)
        expect(curved.parameters.radialSegments).toBe(128)
        expect(curvedSize.y).toBeCloseTo(4)
        expect(curvedSize.x).toBeGreaterThan(10)
        expect(curvedSize.z).toBeGreaterThan(2)
    })

    it('paints a wall texture without depending on floor captions', () => {
        const fills: string[] = []
        const texts: string[] = []
        const clears: string[] = []
        const texture = {
            fillStyle: '',
            clear(fillStyle: string) { clears.push(fillStyle); this.fillStyle = fillStyle; return this },
            setGlobalAlpha() {},
            fillRect() { fills.push(this.fillStyle) },
            drawText(text: string) { texts.push(text); return this },
        }
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            settings: { floorColor: 0x101820, captionColor: 0xffffff },
        })

        stage.paintBackgroundWallTexture(texture as any, {
            color: 0x202a30,
            gridColor: 0x7cb9c9,
            title: 'LIVE TOPOLOGY',
            subtitle: 'health / flow',
        })

        expect(new Set(fills)).toEqual(new Set(['#7cb9c9']))
        expect(texts).toEqual(['LIVE TOPOLOGY', 'health / flow'])
        expect(clears).toEqual(['#202a30ff'])
    })

    it('fits all world-space bounds inside the perspective viewport', () => {
        const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100)
        const bounds = new THREE.Box3(
            new THREE.Vector3(-6, -1, -3),
            new THREE.Vector3(5, 4, 2),
        )
        const frame = cameraFrameForBounds(camera, bounds, new THREE.Vector3(0, 0.7, 1), 0.5)

        expect(frame).not.toBeNull()
        camera.position.copy(frame!.position)
        camera.lookAt(frame!.target)
        camera.updateMatrixWorld(true)
        camera.updateProjectionMatrix()

        for (const x of [bounds.min.x, bounds.max.x]) {
            for (const y of [bounds.min.y, bounds.max.y]) {
                for (const z of [bounds.min.z, bounds.max.z]) {
                    const projected = new THREE.Vector3(x, y, z).project(camera)
                    expect(Math.abs(projected.x)).toBeLessThanOrEqual(1)
                    expect(Math.abs(projected.y)).toBeLessThanOrEqual(1)
                }
            }
        }
    })

    it('moves farther away for the same wide content on a narrow viewport', () => {
        const bounds = new THREE.Box3(
            new THREE.Vector3(-6, -1, -1),
            new THREE.Vector3(6, 2, 1),
        )
        const direction = new THREE.Vector3(0, 0.7, 1)
        const wideCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100)
        const narrowCamera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 100)
        const wide = cameraFrameForBounds(wideCamera, bounds, direction)!
        const narrow = cameraFrameForBounds(narrowCamera, bounds, direction)!

        expect(narrow.position.distanceTo(narrow.target))
            .toBeGreaterThan(wide.position.distanceTo(wide.target))
    })

    it('excludes hidden placement branches from world bounds', () => {
        const root = new THREE.Group()
        root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)))
        const hidden = new THREE.Group()
        hidden.visible = false
        const distant = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
        distant.position.x = 100
        hidden.add(distant)
        root.add(hidden)

        const bounds = worldBoundsOf(root)

        expect(bounds.min.x).toBeCloseTo(-1)
        expect(bounds.max.x).toBeCloseTo(1)
    })

    it('focuses a nested node using its measured world bounds', () => {
        const scene = new THREE.Scene()
        const placementGroup = new THREE.Group()
        placementGroup.position.set(8, 1, -3)
        placementGroup.rotation.y = Math.PI / 3
        placementGroup.scale.setScalar(1.4)

        const service = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1))
        service.name = 'el-service'
        service.position.set(1.5, 0.5, -0.5)
        placementGroup.add(service)
        scene.add(placementGroup)

        const expectedCenter = worldBoundsOf(service).getCenter(new THREE.Vector3())
        const cameraMoves: Array<{ target: THREE.Vector3, position: THREE.Vector3, duration: number }> = []
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            scene,
            camera: new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 64),
            cameraTarget: new THREE.Vector3(),
            cameraMotion: new THREE.Vector3(),
            activeCameraTarget: 'scene',
            focusOptions: { padding: 0.45, duration: 0.6 },
            retargetCamera(target: THREE.Vector3, position: THREE.Vector3, duration: number) {
                cameraMoves.push({ target: target.clone(), position: position.clone(), duration })
            },
        })

        stage.sendCameraTo('service')

        expect(cameraMoves).toHaveLength(1)
        expect(cameraMoves[0].target.distanceTo(expectedCenter)).toBeLessThan(1e-6)
        expect(cameraMoves[0].target.distanceTo(service.position)).toBeGreaterThan(1)
        expect(cameraMoves[0].position.distanceTo(cameraMoves[0].target)).toBeGreaterThan(1)
        expect(cameraMoves[0].duration).toBe(0.6)
    })

    it('exposes content fitting with caller-controlled padding and duration', () => {
        const scene = new THREE.Scene()
        const authoredRoot = new THREE.Group()
        authoredRoot.userData.el = {}
        authoredRoot.add(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5)))
        scene.add(authoredRoot)

        const cameraMoves: Array<{ duration: number }> = []
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            scene,
            camera: new THREE.PerspectiveCamera(40, 1.5, 0.1, 64),
            cameraTarget: new THREE.Vector3(0, 0, 1),
            cameraBase: new THREE.Vector3(0, 12, 9),
            fitOptions: { padding: 0.75, duration: 0.6 },
            activeCameraTarget: 'service',
            retargetCamera(_target: THREE.Vector3, _position: THREE.Vector3, duration: number) {
                cameraMoves.push({ duration })
            },
        })

        expect(stage.fitToContent({ padding: 1.2, duration: 0.25 })).toBe(true)
        expect(cameraMoves).toEqual([{ duration: 0.25 }])
        expect((stage as any).activeCameraTarget).toBe('scene')
        expect((stage as any).fitOptions).toEqual({ padding: 1.2, duration: 0.25 })
    })

    it('coalesces reactive layout invalidations into one refit per frame', () => {
        const callbacks: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callbacks.push(callback)
            return callbacks.length
        })

        let fits = 0
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            activeCameraTarget: 'scene',
            destroyed: false,
            refitQueued: false,
            fitOptions: { padding: 0.75, duration: 0.6 },
            refitContent() { fits++; return true },
        })

        stage.invalidateContentBounds()
        stage.invalidateContentBounds()

        expect(callbacks).toHaveLength(1)
        callbacks[0](0)
        expect(fits).toBe(1)
        vi.unstubAllGlobals()
    })
})

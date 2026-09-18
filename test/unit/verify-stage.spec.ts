import Vuetrex from '@/lib-components/vuetrex.js'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import Scene from '@/lib-components/three/scene.js'
import { createRendererForStage } from '@/lib-components/renderer.js';
import { GroundReflectorMaterial } from '@/lib-components/three/materials/GroundReflectorMaterial.js';
import {
    attachFloorSurface,
    cameraFrameForBounds,
    createSceneFog,
    STAGE_FLOOR_Y,
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

    it('never accepts or settles on a camera position below the floor', () => {
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 64)
        camera.position.set(0, 2, 8)
        camera.lookAt(0, 0, 0)
        const scene = Object.create(Scene.prototype) as Scene
        Object.assign(scene as any, {
            camera,
            cameraBase: new THREE.Vector3(0, 2, 8),
            cameraTarget: new THREE.Vector3(),
            lifecycle: { timer: { current: 0 } },
            startCameraRotation: new THREE.Quaternion(),
            targetCameraRotation: new THREE.Quaternion(),
        })

        scene.retargetCamera(new THREE.Vector3(), new THREE.Vector3(0, -4, 6), 1)
        expect((scene as any).endCameraPos.y).toBe(0)
        scene.cameraAnimationFn()(500, 1)
        expect(camera.position.y).toBeGreaterThanOrEqual(0)

        scene.cameraBase.y = -3
        ;(scene as any).startTime = -1
        scene.cameraAnimationFn()(1000, 2)
        expect(scene.cameraBase.y).toBe(0)
        expect(camera.position.y).toBe(0)
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

    it('lets an unreflected floor own scene depth', () => {
        const scene = new THREE.Scene()
        const material = new THREE.MeshBasicMaterial({ transparent: true })
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), material)

        attachFloorSurface(scene, floor)

        expect(floor.parent).toBe(scene)
        expect(floor.name).toBe('vx-floor-surface')
        expect(floor.position.y).toBe(STAGE_FLOOR_Y)
        expect(floor.rotation.x).toBeCloseTo(-Math.PI / 2)
        expect(floor.renderOrder).toBe(-1)
        expect(material.depthWrite).toBe(true)
        expect(material.polygonOffset).toBe(false)
    })

    it('composites the lit floor texture and reflection in one opaque material', () => {
        const floorTexture = new THREE.Texture()
        const reflectionTexture = new THREE.Texture()
        const reflectionMatrix = new THREE.Matrix4()
        const material = new GroundReflectorMaterial({
            floorTexture,
            reflectionTexture,
            reflectionTextureMatrix: reflectionMatrix,
            reflectionColor: 0x20282d,
        })
        const shader = {
            uniforms: {},
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        }

        material.onBeforeCompile(shader as any, {} as THREE.WebGLRenderer)

        expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
        expect(material.map).toBe(floorTexture)
        expect(material.transparent).toBe(false)
        expect(material.depthWrite).toBe(true)
        expect(shader.uniforms).toMatchObject({
            vxReflectionMap: { value: reflectionTexture },
            vxReflectionTextureMatrix: { value: reflectionMatrix },
        })
        expect(shader.vertexShader).toContain('vxReflectionTextureMatrix * vec4(position, 1.0)')
        const alphaCapture = shader.fragmentShader.indexOf('float vxFloorOpacity = diffuseColor.a')
        const reflectionMix = shader.fragmentShader.indexOf('outgoingLight = mix(vxReflectedColor, outgoingLight, vxFloorOpacity)')
        const opaqueOutput = shader.fragmentShader.indexOf('#include <opaque_fragment>')
        const toneMapping = shader.fragmentShader.indexOf('#include <tonemapping_fragment>')
        expect(alphaCapture).toBeGreaterThan(-1)
        expect(reflectionMix).toBeGreaterThan(alphaCapture)
        expect(opaqueOutput).toBeGreaterThan(reflectionMix)
        expect(toneMapping).toBeGreaterThan(opaqueOutput)
    })

    it('uses one full-size reflected floor surface at Y=0', () => {
        const scene = new THREE.Scene()
        const floorTexture = new THREE.Texture()
        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            settings: { floorMirror: true, mirrorOpacity: 0.75, floorColor: 0x20282d },
            width: 100,
            height: 50,
            renderer: {
                getPixelRatio: () => 2,
                capabilities: { maxTextureSize: 1024 },
            },
            caps: { planeSize: 256 },
            groundMirror: undefined,
        })

        stage.createGroundMirror(scene, floorTexture)

        const reflector = scene.getObjectByName('vx-ground-reflector') as Reflector
        expect(reflector).toBeInstanceOf(Reflector)
        expect(reflector.position.y).toBe(STAGE_FLOOR_Y)
        expect(reflector.children).toHaveLength(0)
        expect(reflector.material).toBeInstanceOf(THREE.MeshStandardMaterial)
        expect((reflector.material as THREE.MeshStandardMaterial).map).toBe(floorTexture)
        expect((reflector.material as THREE.Material).depthWrite).toBe(true)
        expect((reflector.geometry as THREE.PlaneGeometry).parameters).toMatchObject({ width: 256, height: 256 })
        expect(reflector.getRenderTarget()).toMatchObject({ width: 400, height: 200 })

        reflector.geometry.dispose()
        reflector.dispose()
    })

    it('keeps reflection enabled by default and skips its render target for an opaque floor', () => {
        const makeStage = (settings: Record<string, unknown>) => {
            const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
            Object.assign(stage as any, {
                settings,
                width: 100,
                height: 50,
                renderer: {
                    getPixelRatio: () => 1,
                    capabilities: { maxTextureSize: 1024 },
                },
                caps: { planeSize: 256 },
                groundMirror: undefined,
            })
            return stage
        }
        const floorTexture = new THREE.Texture()
        const defaultScene = new THREE.Scene()
        const defaultStage = makeStage({ floorMirror: true })

        const defaultReflector = defaultStage.createGroundMirror(defaultScene, floorTexture)

        expect(defaultReflector).toBeInstanceOf(Reflector)
        defaultReflector!.geometry.dispose()
        defaultReflector!.dispose()

        const opaqueScene = new THREE.Scene()
        const opaqueStage = makeStage({ floorMirror: true, mirrorOpacity: 1 })
        expect(opaqueStage.createGroundMirror(opaqueScene, floorTexture)).toBeUndefined()
        expect(opaqueScene.children).toHaveLength(0)
    })

    it('creates optional distance fog using the background as its default colour', () => {
        expect(createSceneFog({ backgroundColor: 0x123456 })).toBeNull()

        const fog = createSceneFog({
            backgroundColor: 0x123456,
            fog: { near: 20, far: 38 },
        })
        expect(fog).toBeInstanceOf(THREE.Fog)
        expect(fog?.color.getHex()).toBe(0x123456)
        expect(fog?.near).toBe(20)
        expect(fog?.far).toBe(38)

        const boundedFog = createSceneFog({
            fog: { color: 0xaabbcc, near: -2, far: -4 },
        })
        expect(boundedFog?.color.getHex()).toBe(0xaabbcc)
        expect(boundedFog?.near).toBe(0)
        expect(boundedFog?.far).toBeCloseTo(0.001)
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
            nodesById: new Map([['service', { element: { mesh: service } }]]),
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

    it('scopes wheel input to the canvas and disposes renderer-owned resources', () => {
        const observer = {
            disconnect: vi.fn(),
            observe: vi.fn(),
        }
        vi.stubGlobal('ResizeObserver', class {
            constructor(_callback: ResizeObserverCallback) {}
            observe = observer.observe
            disconnect = observer.disconnect
        })

        try {
            const domParent = document.createElement('div')
            const canvas = document.createElement('canvas')
            domParent.appendChild(canvas)
            const previousEventCleanup = vi.fn()
            const renderPass = { dispose: vi.fn() }
            const composer = { dispose: vi.fn() }
            const renderer = {
                domElement: canvas,
                dispose: vi.fn(),
                forceContextLoss: vi.fn(),
            }
            const onMouseWheel = vi.fn()
            const scene = Object.create(Scene.prototype) as Scene
            Object.assign(scene as any, {
                domParent,
                renderer,
                renderPass,
                composer,
                scene: new THREE.Scene(),
                camera: new THREE.PerspectiveCamera(),
                mouse: { x: 0, y: 0 },
                removeEventListeners: previousEventCleanup,
                stopRenderLoop: vi.fn(),
                onWindowResize: vi.fn(),
                onMouseWheel,
                onCanvasMouseMove: vi.fn(),
                onCanvasClick: vi.fn(),
                onCanvasDblClick: vi.fn(),
            })

            scene.bindEvents(domParent)

            window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
            domParent.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
            expect(onMouseWheel).not.toHaveBeenCalled()

            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
            expect(onMouseWheel).toHaveBeenCalledOnce()

            scene.destroy()
            scene.destroy()

            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))

            expect(previousEventCleanup).toHaveBeenCalledOnce()
            expect(onMouseWheel).toHaveBeenCalledOnce()
            expect(observer.observe).toHaveBeenCalledWith(domParent)
            expect(observer.disconnect).toHaveBeenCalledOnce()
            expect(renderPass.dispose).toHaveBeenCalledOnce()
            expect(composer.dispose).toHaveBeenCalledOnce()
            expect(renderer.dispose).toHaveBeenCalledOnce()
            expect(renderer.forceContextLoss).toHaveBeenCalledOnce()
            expect(domParent.children).toHaveLength(0)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('disposes stage-owned floor and reflector resources', () => {
        const scene = new THREE.Scene()
        const floorTexture = new THREE.Texture()
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(4, 4),
            new THREE.MeshStandardMaterial({ map: floorTexture }),
        )
        const mirror = new Reflector(new THREE.PlaneGeometry(4, 4), {
            textureWidth: 4,
            textureHeight: 4,
        })
        scene.add(floor, mirror)

        const floorGeometryDisposed = vi.fn()
        const floorMaterialDisposed = vi.fn()
        const floorTextureDisposed = vi.fn()
        const mirrorGeometryDisposed = vi.fn()
        const mirrorMaterialDisposed = vi.fn()
        const mirrorTargetDisposed = vi.fn()
        floor.geometry.addEventListener('dispose', floorGeometryDisposed)
        ;(floor.material as THREE.Material).addEventListener('dispose', floorMaterialDisposed)
        floorTexture.addEventListener('dispose', floorTextureDisposed)
        mirror.geometry.addEventListener('dispose', mirrorGeometryDisposed)
        mirror.material.addEventListener('dispose', mirrorMaterialDisposed)
        mirror.getRenderTarget().addEventListener('dispose', mirrorTargetDisposed)

        const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
        Object.assign(stage as any, {
            floorSurface: floor,
            groundMirror: mirror,
            caps: { texture: { texture: floorTexture }, updateFn: vi.fn() },
        })

        ;(stage as any).disposeStageSurfaces()

        expect(floorGeometryDisposed).toHaveBeenCalledOnce()
        expect(floorMaterialDisposed).toHaveBeenCalledOnce()
        expect(floorTextureDisposed).toHaveBeenCalledOnce()
        expect(mirrorGeometryDisposed).toHaveBeenCalledOnce()
        expect(mirrorMaterialDisposed).toHaveBeenCalledOnce()
        expect(mirrorTargetDisposed).toHaveBeenCalledOnce()
        expect(floor.parent).toBeNull()
        expect(mirror.parent).toBeNull()
        expect((stage as any).caps.texture).toBeNull()
        expect((stage as any).backgroundWallTexture).toBeUndefined()
        expect((stage as any).groundMirror).toBeUndefined()
    })
})

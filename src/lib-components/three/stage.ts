import { LiveLighting, type VxLightingProps } from './lighting/LiveLighting.js'
import type { VxSettings, VxDiagnosticsSettings } from '../root-api.js';
import { VxCameraController, type VxCameraView } from './cameraController.js';
import type { VxCameraProps, VxFloorProps } from '../scene/declarations.js';
import type { ComputedRef } from 'vue';
import type { MaterialStyles } from '../styling/stylesheets.js';
import * as THREE from 'three';
import * as THREEx from '@/lib-components/three/three.imports.js';
import Scene from '@/lib-components/three/scene.js';
import {Element3d, VxEventMap} from '@/lib-components/three/element3d.js';
import {Node} from '@/lib-components/nodes/Node.js';
import type {InstanceHit} from '@/lib-components/nodes/InstanceNode.js';
import type {GeometryHit} from '@/lib-components/geometry/types.js';
import type {ParticleHit} from '@/lib-components/particles/types.js';
import type {ConnectorHit} from '@/lib-components/connectors/types.js';
import type {ConnectorRuntimeDiagnostics} from '@/lib-components/connectors/types.js';
import {Connectors} from '@/lib-components/three/connectors/connectors.js';
import {GroundReflectorMaterial, GroundSurfaceMaterial} from '@/lib-components/three/materials/GroundReflectorMaterial.js';
import gsap from 'gsap';
import {Text} from 'troika-three-text';

/**
 * Target transform values for animateTo(). Each field is optional — only
 * specified fields are animated; the rest are left unchanged.
 *
 * `scale` is a uniform shorthand; `scaleX/Y/Z` override it per-axis.
 * `quaternion` takes precedence over `rotationAxis`/`rotationAngle`.
 * `pivot` is a local-space point kept fixed while rotation and scale change.
 */
export type VxAnimVector3 =
    | readonly [number, number, number]
    | Readonly<{ x: number; y: number; z: number }>
    | THREE.Vector3

export type VxAnimQuaternion =
    | readonly [number, number, number, number]
    | Readonly<{ x: number; y: number; z: number; w: number }>
    | THREE.Quaternion

export type VxAnimAxis = 'x' | 'y' | 'z' | VxAnimVector3

export interface VxAnimProps {
    positionX?: number
    positionY?: number
    positionZ?: number
    scale?: number
    scaleX?: number
    scaleY?: number
    scaleZ?: number
    quaternion?: VxAnimQuaternion
    rotationAxis?: VxAnimAxis
    rotationAngle?: number
    pivot?: VxAnimVector3
}

/**
 * Controls the timing and easing of an animateTo() call.
 * Accepts any GSAP ease string for `ease` (e.g. 'sine.out', 'power2.inOut').
 */
export interface VxAnimOptions {
    duration?: number
    ease?: string
    delay?: number
    onComplete?: () => void
}

interface VxAnimationTransform {
    startPosition: THREE.Vector3
    targetPosition: THREE.Vector3
    startScale: THREE.Vector3
    targetScale: THREE.Vector3
    startQuaternion: THREE.Quaternion
    targetQuaternion: THREE.Quaternion
    pivot: THREE.Vector3
    startPivotOffset: THREE.Vector3
}

function animVector(value: VxAnimVector3 | undefined): THREE.Vector3 {
    if (value === undefined) return new THREE.Vector3()
    if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2])
    if ((value as THREE.Vector3).isVector3) return (value as THREE.Vector3).clone()
    const point = value as Readonly<{ x: number; y: number; z: number }>
    return new THREE.Vector3(point.x, point.y, point.z)
}

function animAxis(value: VxAnimAxis): THREE.Vector3 {
    if (value === 'x') return new THREE.Vector3(1, 0, 0)
    if (value === 'y') return new THREE.Vector3(0, 1, 0)
    if (value === 'z') return new THREE.Vector3(0, 0, 1)
    return animVector(value)
}

function animQuaternion(value: VxAnimQuaternion): THREE.Quaternion {
    if ((value as THREE.Quaternion).isQuaternion) return (value as THREE.Quaternion).clone().normalize()
    if (Array.isArray(value)) return new THREE.Quaternion(value[0], value[1], value[2], value[3]).normalize()
    const quaternion = value as Readonly<{ x: number; y: number; z: number; w: number }>
    return new THREE.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w).normalize()
}

function hasAnimatedTransform(props: VxAnimProps): boolean {
    return props.positionX !== undefined
        || props.positionY !== undefined
        || props.positionZ !== undefined
        || props.scale !== undefined
        || props.scaleX !== undefined
        || props.scaleY !== undefined
        || props.scaleZ !== undefined
        || props.quaternion !== undefined
        || (props.rotationAxis !== undefined && props.rotationAngle !== undefined)
}

function animationTransform(mesh: THREE.Object3D, props: VxAnimProps): VxAnimationTransform {
    const startPosition = mesh.position.clone()
    const targetPosition = startPosition.clone()
    if (props.positionX !== undefined) targetPosition.x = props.positionX
    if (props.positionY !== undefined) targetPosition.y = props.positionY
    if (props.positionZ !== undefined) targetPosition.z = props.positionZ

    const startScale = mesh.scale.clone()
    const targetScale = startScale.clone()
    if (props.scale !== undefined) targetScale.setScalar(props.scale)
    if (props.scaleX !== undefined) targetScale.x = props.scaleX
    if (props.scaleY !== undefined) targetScale.y = props.scaleY
    if (props.scaleZ !== undefined) targetScale.z = props.scaleZ

    const startQuaternion = mesh.quaternion.clone()
    let targetQuaternion = startQuaternion.clone()
    if (props.quaternion !== undefined) {
        targetQuaternion = animQuaternion(props.quaternion)
    } else if (props.rotationAxis !== undefined && props.rotationAngle !== undefined) {
        const axis = animAxis(props.rotationAxis)
        if (axis.lengthSq() > 0) targetQuaternion.setFromAxisAngle(axis.normalize(), props.rotationAngle)
    }

    const pivot = animVector(props.pivot)
    const startPivotOffset = pivot.clone().multiply(startScale).applyQuaternion(startQuaternion)
    return {
        startPosition,
        targetPosition,
        startScale,
        targetScale,
        startQuaternion,
        targetQuaternion,
        pivot,
        startPivotOffset,
    }
}

function applyAnimationTransform(mesh: THREE.Object3D, animation: VxAnimationTransform, progress: number): void {
    const amount = THREE.MathUtils.clamp(progress, 0, 1)
    mesh.scale.lerpVectors(animation.startScale, animation.targetScale, amount)
    mesh.quaternion.copy(animation.startQuaternion).slerp(animation.targetQuaternion, amount)
    mesh.position.lerpVectors(animation.startPosition, animation.targetPosition, amount)
    if (animation.pivot.lengthSq() > 0) {
        const pivotOffset = animation.pivot.clone().multiply(mesh.scale).applyQuaternion(mesh.quaternion)
        mesh.position.add(animation.startPivotOffset).sub(pivotOffset)
    }
}

export interface VxFitOptions {
    /** World-space margin added around the measured bounds. */
    padding?: number
    /** Camera transition duration in seconds. */
    duration?: number
}

export interface VxStage {
    readonly connections: Pick<Connectors, 'get' | 'list' | 'portsOf'>
    /** Explicit orbit and stage-owned GSAP camera timelines. */
    readonly camera: VxCameraController
    getScene(): THREE.Scene
    onEachFrame(fn: (time: number, tick:number) => void): () => void
    /**
     * Animate the named node's transform to the given target values.
     * Isolates callers from Three.js internals — use this instead of
     * accessing mesh.position / mesh.scale directly.
     */
    animateTo(id: string, props: VxAnimProps, opts?: VxAnimOptions): void
    /** Frame all authored scene geometry and keep that framing reactive. */
    fitToContent(options?: VxFitOptions): boolean
    /** Focus a named node's world bounds, or use `scene` for the fitted overview. */
    sendCameraTo(camera: string): void
    /** Enable, configure, or disable the scene diagnostics overlay. */
    setDiagnostics(diagnostics: boolean | VxDiagnosticsSettings): void
    /** Inspect authored, resolved, and realized connector state without exposing mutable paths. */
    connectorDiagnostics(): ConnectorRuntimeDiagnostics
    /** Inspect the requested and effective post-processing plan and owned target budget. */
    composerDiagnostics(): import('./postprocessing/ComposerController.js').ComposerDiagnostics
}

export interface VxMouseEvent extends MouseEvent {
    vxNode: Node;
    vxPosition: any;
    vxInstance?: InstanceHit<unknown> | GeometryHit<unknown> | ParticleHit<unknown>;
    vxConnector?: ConnectorHit;
}

let BOX_RADIUS = 1.0;
let BOX_DISTANCE = 1.0;
/** Authored scene content is base-anchored to this world-space plane. */
export const STAGE_FLOOR_Y = 0;
const GROUND_REFLECTOR_CLIP_BIAS = 0.0003;
const DEVELOPMENT_CHECKS = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? true;

/**
 * Attach the non-reflective floor as the scene's single Y=0 depth surface.
 */
export function attachFloorSurface(
    scene: THREE.Scene,
    floor: THREE.Mesh,
): void {
    const materials = Array.isArray(floor.material) ? floor.material : [floor.material]
    for (const material of materials) {
        material.depthWrite = true
        material.polygonOffset = false
    }

    floor.name = 'vx-floor-surface'
    floor.castShadow = false
    floor.receiveShadow = true
    // The floor is a transparent background surface. Render it before
    // transparent effects such as connector particles instead of allowing
    // camera-distance sorting to reverse their order while the camera orbits.
    floor.renderOrder = -1

    floor.rotation.x = -Math.PI / 2
    floor.position.y = STAGE_FLOOR_Y
    scene.add(floor)
}

function floorSurfaceOpacity(settings: VxSettings): number {
    return THREE.MathUtils.clamp(settings.mirrorOpacity ?? 0.55, 0, 1)
}

function reflectionTextureExtent(cssPixels: number, pixelRatio: number, maxTextureSize: number): number {
    return Math.min(maxTextureSize, Math.max(1, Math.round(cssPixels * pixelRatio * 2)))
}

export function createSceneFog(settings: VxSettings): THREE.Fog | null {
    if (!settings.fog) return null

    const near = Math.max(0, settings.fog.near ?? 18)
    const far = Math.max(near + 0.001, settings.fog.far ?? 42)
    return new THREE.Fog(
        settings.fog.color ?? settings.backgroundColor ?? 0x808080,
        near,
        far,
    )
}

function cssColor(color: number): string {
    return `#${new THREE.Color(color).getHexString()}`
}

function cssColorWithAlpha(color: number, opacity: number): string {
    const alpha = Math.round(THREE.MathUtils.clamp(opacity, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0')
    return `${cssColor(color)}${alpha}`
}

export interface CameraFrame {
    target: THREE.Vector3
    position: THREE.Vector3
}

/** Return visible world bounds for an authored object and all of its descendants. */
export function worldBoundsOf(object: THREE.Object3D): THREE.Box3 {
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3()
    const geometryBounds = new THREE.Box3()

    const expandVisible = (current: THREE.Object3D) => {
        if (!current.visible) return

        const mesh = current as THREE.Mesh & {
            boundingBox?: THREE.Box3 | null
            computeBoundingBox?: () => void
        }
        const geometry = mesh.geometry
        if (geometry) {
            if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                if (mesh.boundingBox === null) mesh.computeBoundingBox?.()
                if (mesh.boundingBox) {
                    geometryBounds.copy(mesh.boundingBox).applyMatrix4(current.matrixWorld)
                    bounds.union(geometryBounds)
                }
            } else {
                if (geometry.boundingBox === null) geometry.computeBoundingBox()
                if (geometry.boundingBox) {
                    geometryBounds.copy(geometry.boundingBox).applyMatrix4(current.matrixWorld)
                    bounds.union(geometryBounds)
                }
            }
        }

        current.children.forEach(expandVisible)
    }

    expandVisible(object)
    return bounds
}

/**
 * Fit a perspective camera around a world-space box while preserving a chosen
 * viewing direction. Depth is included, so near corners cannot be clipped by
 * fitting only the box width and height at its centre plane.
 */
export function cameraFrameForBounds(
    camera: THREE.PerspectiveCamera,
    bounds: THREE.Box3,
    direction: THREE.Vector3,
    padding = 0,
): CameraFrame | null {
    if (bounds.isEmpty()) return null

    const framedBounds = bounds.clone().expandByScalar(Math.max(0, padding))
    const target = framedBounds.getCenter(new THREE.Vector3())
    const viewDirection = direction.clone()
    if (viewDirection.lengthSq() < 1e-8) viewDirection.set(0, 0.65, 1)
    viewDirection.normalize()

    const orientationCamera = camera.clone()
    orientationCamera.position.copy(target).add(viewDirection)
    orientationCamera.lookAt(target)
    orientationCamera.updateMatrixWorld(true)
    const inverseOrientation = orientationCamera.quaternion.clone().invert()

    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const horizontalTangent = verticalTangent * Math.max(1e-6, camera.aspect)
    let distance = 0.1

    for (const x of [framedBounds.min.x, framedBounds.max.x]) {
        for (const y of [framedBounds.min.y, framedBounds.max.y]) {
            for (const z of [framedBounds.min.z, framedBounds.max.z]) {
                const local = new THREE.Vector3(x, y, z).sub(target).applyQuaternion(inverseOrientation)
                distance = Math.max(
                    distance,
                    local.z + Math.abs(local.x) / horizontalTangent,
                    local.z + Math.abs(local.y) / verticalTangent,
                )
            }
        }
    }

    return {
        target,
        position: target.clone().addScaledVector(viewDirection, distance),
    }
}

/**
 * Stage is a top level container of Vue-connected nodes. It literally sets the stage for everything happening in 3D.
 *
 * By using Vue's Custom Renderer interface (NodeOps) it replaces browser's drawing of DOM elements with updating
 * ThreeJS scene.
 */
export class VuetrexStage extends Scene implements VxStage {
    readonly camera = new VxCameraController({
        now: () => this.lifecycle.timer.current,
        onFrame: fn => this.registerAnimation(fn),
        prefersReducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
        read: () => ({
            target: this.cameraTarget.toArray() as [number, number, number],
            height: this.renderCamera.position.y,
            radius: Math.max(0.001, Math.hypot(this.renderCamera.position.x - this.cameraTarget.x, this.renderCamera.position.z - this.cameraTarget.z)),
            azimuth: THREE.MathUtils.radToDeg(Math.atan2(this.renderCamera.position.x - this.cameraTarget.x, this.renderCamera.position.z - this.cameraTarget.z)),
        }),
        apply: orbit => {
            const heading = THREE.MathUtils.degToRad(orbit.azimuth)
            this.retargetCamera(new THREE.Vector3(...orbit.target), new THREE.Vector3(
                orbit.target[0] + orbit.radius * Math.sin(heading), orbit.height,
                orbit.target[2] + orbit.radius * Math.cos(heading),
            ), 0)
            this.renderCamera.far = Math.max(this.renderCamera.far, orbit.radius * 4, orbit.height * 4)
            this.renderCamera.updateProjectionMatrix()
        },
    })

    setCamera(view: VxCameraView): void {
        if (typeof view === 'string') this.sendCameraTo(view)
        else this.camera.orbit(view.orbit)
    }

    protected override onCameraInteraction(): void { this.camera.interrupt() }
    private subscribers: Function[] = [];
    public connectors: Connectors;
    get connections(): Pick<Connectors, 'get' | 'list' | 'portsOf'> { return this.connectors }
    connectorAppearances?: ComputedRef<import('../connectors/declarations.js').ConnectorAppearances>
    materialStyles?: ComputedRef<MaterialStyles>
    settings: VxSettings
    private caps: { repeats: number; size: number; planeSize: number; updateFn: () => void; texture: THREEx.DynamicTexture | null } = {
        planeSize: 256,
        size: 2048,
        repeats: 17,
        texture: null,
        updateFn: () => {}
    }
    private captions: Array<{x:number, y:number, text:string, visible: boolean}> = []
    private liveLighting?: LiveLighting
    private groundMirror?: THREEx.Reflector
    private floorSurface?: THREE.Mesh
    private readonly nodesById = new Map<string, Node>()
    private readonly nodesByName = new Map<string, Node>()
    private diagnostics: boolean | VxDiagnosticsSettings = false
    private readonly diagnosticsGroup = new THREE.Group()
    boxRadius: number;
    boxDistance: number;
    gap: number;
    private activeCameraTarget = 'scene'
    private fitOptions: Required<VxFitOptions> = { padding: 0.75, duration: 0.6 }
    private focusOptions: Required<VxFitOptions> = { padding: 0.45, duration: 0.6 }
    private refitQueued = false
    private refitFrame?: number
    private destroyed = false
    private lastFraming?: { target: string, bounds: THREE.Box3, aspect: number }

    constructor(domParent: HTMLElement, settings:VxSettings) {
        super(domParent)
        this.connectors = new Connectors(this);
        this.settings = settings
        this.diagnostics = settings.diagnostics ?? false

        this.boxRadius = settings.unit || BOX_RADIUS
        this.boxDistance = settings.gap ?? BOX_DISTANCE
        this.gap = settings.gap ?? this.boxDistance
        this.colorMain = new THREE.Color(settings.color || 0x555555);
        this.colorHighlight = new THREE.Color(settings.highlightColor || 0x4c7fb2);
        this.scene.background = new THREE.Color(settings.backgroundColor ?? 0x808080);
        this.scene.fog = createSceneFog(settings)
        this.renderer.shadowMap.enabled = this.shadowsEnabled()
        this.diagnosticsGroup.name = 'vx-diagnostics'
        this.diagnosticsGroup.renderOrder = 1000
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    captureFloorStyle(): Required<Omit<VxFloorProps, 'fadeStart' | 'fadeEnd'>> & Pick<VxFloorProps, 'fadeStart' | 'fadeEnd'> {
        return { finish: this.settings.floorMirror === false ? 'matte' : 'mirror',
            color: this.settings.floorColor ?? 0x3f3f3f, reflection: 1 - floorSurfaceOpacity(this.settings),
            grid: this.settings.floorGrid !== false, captions: this.settings.floorCaptions !== false,
            fadeStart: this.settings.floorFadeStart, fadeEnd: this.settings.floorFadeEnd }
    }

    applyFloorStyle(style: VxFloorProps): void {
        if (this.destroyed) return
        const before = this.captureFloorStyle()
        const next = { ...before, ...style }
        if (Object.keys(before).every(key => before[key as keyof typeof before] === next[key as keyof typeof next])) return
        Object.assign(this.settings, { floorMirror: next.finish === 'mirror', floorColor: next.color,
            mirrorOpacity: 1 - next.reflection, floorGrid: next.grid, floorCaptions: next.captions,
            floorFadeStart: next.fadeStart, floorFadeEnd: next.fadeEnd })
        this.disposeStageSurfaces()
        this.createFloor(this.scene)
    }

    captureCameraView() {
        return { direction: this.overviewDirection().toArray() as [number, number, number],
            ...this.fitOptions, target: this.activeCameraTarget, motion: this.camera.motion }
    }

    setCameraView(view: VxCameraProps): void {
        if (this.destroyed) return
        if (view.direction) this.cameraBase.copy(this.cameraTarget).add(new THREE.Vector3(...view.direction))
        this.fitToContent({ padding: view.padding, duration: view.duration })
        this.camera.setMotion(view.motion)
    }

    restoreCameraView(view: ReturnType<VuetrexStage['captureCameraView']>): void {
        this.setCameraView(view)
        if (!this.destroyed && view.target !== 'scene') this.sendCameraTo(view.target)
    }

    onEachFrame(fn: (time: number, tick:number) => void): () => void {
        return this.registerAnimation(fn)
    }

    mount() {
        const scene = this.scene;
        scene.add(this.diagnosticsGroup)
        this.createFloor(scene);
        this.createLights(scene);

        //particle system
        this.connectors.mount();

        //TODO
        //gsap.to(this.renderCamera.position, {duration:2.1, x:0.2, y:1.75, z:2.5,  delay: 0.5});
        this.registerAnimation(this.cameraAnimationFn()); //push tween function to be called on each frame
        this.registerAnimation(this.mouseAnimationFn());
        this.refreshDiagnostics()
    }

    getById(id: string): Element3d | undefined {
        return this.nodesById.get(id)?.element
    }

    registerNode(node: Node): void {
        this.registerNodeIdentity(node, node.id, node.name)
    }

    updateNodeRegistration(node: Node, id: string, name: string): void {
        const registered = [...this.nodesById.values()].some(candidate => candidate === node)
        if (!registered) return
        this.registerNodeIdentity(node, id, name)
    }

    private registerNodeIdentity(node: Node, id: string, name: string): void {
        const duplicateId = this.nodesById.get(id)
        if (DEVELOPMENT_CHECKS && duplicateId && duplicateId !== node) {
            throw new Error(`Vuetrex node id must be unique; duplicate id: ${id}`)
        }
        const duplicateName = name ? this.nodesByName.get(name) : undefined
        if (DEVELOPMENT_CHECKS && duplicateName && duplicateName !== node) {
            throw new Error(`Vuetrex node name must be unique in development; duplicate name: ${name}`)
        }

        for (const [registeredId, registeredNode] of this.nodesById) {
            if (registeredNode === node && registeredId !== id) this.nodesById.delete(registeredId)
        }
        for (const [registeredName, registeredNode] of this.nodesByName) {
            if (registeredNode === node && registeredName !== name) this.nodesByName.delete(registeredName)
        }
        this.nodesById.set(id, node)
        if (name) this.nodesByName.set(name, node)
    }

    unregisterNode(node: Node): void {
        for (const [id, registeredNode] of this.nodesById) {
            if (registeredNode === node) this.nodesById.delete(id)
        }
        for (const [name, registeredNode] of this.nodesByName) {
            if (registeredNode === node) this.nodesByName.delete(name)
        }
    }

    shadowsEnabled(): boolean {
        return this.settings.shadows !== false
    }

    onHighlight(fn: Function) {
        this.subscribers.push(fn);
    }

    createGroundMirror(scene: THREE.Scene, floorTexture: THREE.Texture): THREEx.Reflector | undefined {
        this.groundMirror = undefined
        const floorOpacity = floorSurfaceOpacity(this.settings)
        if (this.settings.floorMirror === false || floorOpacity >= 0.999) return

        const pixelRatio = this.renderer.getPixelRatio()
        const maxTextureSize = Math.max(1, this.renderer.capabilities.maxTextureSize)
        const geometry = new THREE.PlaneGeometry(this.caps.planeSize, this.caps.planeSize)
        const groundMirror = new THREEx.Reflector(geometry, {
            // This bias belongs to the reflected camera's clipping calculation;
            // unlike a second floor plane, it does not create competing depth.
            clipBias: GROUND_REFLECTOR_CLIP_BIAS,
            textureWidth: reflectionTextureExtent(this.width, pixelRatio, maxTextureSize),
            textureHeight: reflectionTextureExtent(this.height, pixelRatio, maxTextureSize),
            color: new THREE.Color(this.settings.floorColor ?? 0x777777),
        })
        const stockMaterial = groundMirror.material as THREE.ShaderMaterial
        const reflectionTextureMatrix = stockMaterial.uniforms.textureMatrix.value as THREE.Matrix4
        groundMirror.material = new GroundReflectorMaterial({
            floorTexture,
            reflectionTexture: groundMirror.getRenderTarget().texture,
            reflectionTextureMatrix,
            reflectionColor: this.settings.floorColor ?? 0x777777,
            horizonColor: this.settings.backgroundColor ?? 0x808080,
            fadeStart: this.settings.floorFadeStart,
            fadeEnd: this.settings.floorFadeEnd,
        })
        stockMaterial.dispose()
        groundMirror.name = 'vx-ground-reflector'
        groundMirror.rotateX(-Math.PI / 2)
        groundMirror.position.y = STAGE_FLOOR_Y
        groundMirror.castShadow = false
        groundMirror.receiveShadow = this.shadowsEnabled()
        groundMirror.renderOrder = -1
        scene.add(groundMirror)
        this.groundMirror = groundMirror
        return groundMirror
    }

    createFloor(scene: THREE.Scene) {
        const caps = this.caps;
        const textureOffset = Math.floor(caps.repeats/2);
        // One canvas supplies the floor tint, grid, captions, and blend alpha.
        const texture = new THREEx.DynamicTexture(caps.size, caps.size)
        caps.texture = texture
        texture.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        texture.texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.texture.generateMipmaps = true
        texture.texture.repeat.set(caps.repeats, caps.repeats)
        texture.texture.offset.set(-textureOffset, -textureOffset)

        this.repaintTitles(caps.planeSize)
        caps.updateFn = () => this.repaintTitles(caps.planeSize)

        // Reflection and floor graphics share this one mesh/material so every
        // floor pixel has exactly one depth value.
        if (this.createGroundMirror(scene, texture.texture)) return

        const material = new GroundSurfaceMaterial({
            floorTexture: texture.texture,
            horizonColor: this.settings.backgroundColor ?? 0x808080,
            fadeStart: this.settings.floorFadeStart,
            fadeEnd: this.settings.floorFadeEnd,
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(caps.planeSize, caps.planeSize), material);
        this.floorSurface = plane
        attachFloorSurface(scene, plane)
        plane.receiveShadow = this.shadowsEnabled()
    }

    repaintTitles(mirrorSize: number) {
        const caps = this.caps;
        const textureSize = caps.size;
        const textureRepeats = caps.repeats;
        const texture = caps.texture!;
        texture.clear(undefined)
        texture.clear(cssColorWithAlpha(
            this.settings.floorColor ?? 0x3f3f3f,
            floorSurfaceOpacity(this.settings),
        ))

        texture.context.font = "bold "+Math.floor(textureSize/72)+"px Helvetica"
        const scale = textureSize / mirrorSize * textureRepeats;
        if (this.settings.floorCaptions !== false) this.captions.filter(c => c.visible).forEach(c => {
            const w = texture.context.measureText(c.text).width

            const x = c.x * scale
            const y = c.y * scale
            texture.drawText(c.text, x + textureSize / 2 - w / 2, y + textureSize / 2 + this.boxRadius/4*scale,
                '#'+(this.settings.captionColor ?? 0xffffff).toString(16))
        })

        if (this.settings.floorGrid !== false) {
            // Grid color must not depend on whether drawText() happened to run.
            // Instance batches do not create floor captions, unlike ordinary meshes.
            texture.fillStyle = '#' + (this.settings.captionColor || 0xffffff).toString(16)
            texture.setGlobalAlpha(0.02)
            for (let i=0; i<100; i++) {
                texture.fillRect(100, 100 + 20*i, 1897, 2)
            }
            for (let i=0; i<100; i++) {
                texture.fillRect(100 + 20*i, 100, 2, 1987)
            }
            texture.setGlobalAlpha(0.1)
            for (let i=0; i<20; i++) {
                texture.fillRect(100, 100 + 100*i, 1897, 2)
            }
            for (let i=0; i<20; i++) {
                texture.fillRect(100 + 100*i, 100, 2, 1897)
            }
        }
        //texture.drawText("Bonjour", 110, 1980, '#eeffff')
        texture.setGlobalAlpha(1.0)
        //texture.drawText("This could be base layer text", 100, 80, '#eeffff')

        // const size = 2048;
        // const stops = [0.75,0.6,0.4,0.25]
        // const colors = ['#1B1D1E','#3D4143','#72797D', '#b0babf'];
        //
        // const gradient = texture.createLinearGradient(0,0,0, size);
        // let i = stops.length;
        // while(i--){ gradient.addColorStop(stops[i], colors[i]); }
        // texture.fillStyle = gradient;
        // texture.fillRect(0,0,16, size);

    }

    createLights(scene: THREE.Scene) {
        this.liveLighting?.dispose()
        this.liveLighting = new LiveLighting(scene, this.settings, this.shadowsEnabled(), this.renderer.capabilities.maxTextureSize)
    }

    captureLightingStyle(): Required<VxLightingProps> {
        if (!this.liveLighting) throw new Error('Stage lighting is not mounted')
        return this.liveLighting.capture()
    }

    applyLightingStyle(style: VxLightingProps): void {
        this.liveLighting?.apply(style)
    }

    createElementMaterial() {
        let bMaterial = new THREE.MeshStandardMaterial();
        bMaterial.roughness = 0.3;
        // bMaterial.transparent = true;
        // bMaterial.opacity = 0.3;
        bMaterial.metalness = 0.1;
        bMaterial.flatShading = false;
        bMaterial.color.set(this.colorMain);
        return bMaterial;
    }

    removeObject(el: Element3d) {
        if (el.mesh) {
            el.mesh.removeFromParent();
            const c = el.mesh.userData.caption
            if (c) {
                this.captions.splice(this.captions.indexOf(c),1)
                this.caps.updateFn();
            }
            el.mesh = null;
            this.invalidateContentBounds()
        }
    }

    addCaption(el: Element3d, size: number, caption: string) {
        // Retain caption records while hidden so a floor declaration can reveal them later.
        const pos = el.getWorldPosition();
        if (el.mesh && pos.length() === 0) {
            // fallback if mesh exists but matrix not updated
            el.mesh.updateWorldMatrix(true, false);
            el.mesh.getWorldPosition(pos);
        }
        const c = {
            x: pos.x,
            y: pos.z + size / 2.0,
            text: caption,
            visible: el.node.visible,
        }
        this.captions.push(c);
        if (el.mesh)
            el.mesh.userData.caption = c;
        this.caps.updateFn();
        return c;
    }

    renderMesh(el: Element3d, height: number, size: number = this.boxRadius, gen: (height:number, size:number) => THREE.Mesh, parentObject: THREE.Object3D = this.scene) {
        if (el.mesh !== null) {
            el.mesh.position.copy(el.getPosition())
            el.node.applyObjectState(el.mesh)
            this.connectors.update(el);
            const worldPos = el.getWorldPosition();
            const caption = el.mesh.userData.caption
            if (caption) {
                caption.x = worldPos.x
                caption.y = worldPos.z + size / 2.0
                caption.text = el.getCaption()
                caption.visible = el.node.visible
            }
            this.caps.updateFn();
            this.invalidateContentBounds()
            return;
        }

        const model = gen(height, size);
        const scale = el.node.getScale();
        model.name = "el-" + el.node.id;
        model.castShadow = this.shadowsEnabled();
        model.receiveShadow = this.shadowsEnabled();
        model.position.copy(el.getPosition());
        parentObject.add(model);
        el.mesh = model as THREE.Object3D<VxEventMap>;
        const caption = this.addCaption(el, size * scale, el.getCaption())
        if (caption) model.userData.caption = caption
        model.userData.el = el;
        el.node.applyObjectState(model)
        this.connectors.update(el);
        this.invalidateContentBounds()
    }

    public reconcileConnections() {
        this.connectors.reconcileConnections();
    }

    connectorDiagnostics(): ConnectorRuntimeDiagnostics {
        return this.connectors.connectorDiagnostics()
    }

    updateNodeState(node: Node): void {
        const caption = node.element.mesh?.userData.caption
        if (caption) caption.visible = node.visible
        this.caps.updateFn()
    }

    setDiagnostics(diagnostics: boolean | VxDiagnosticsSettings): void {
        this.diagnostics = diagnostics
        this.diagnosticsGroup.name = 'vx-diagnostics'
        if (!this.diagnosticsGroup.parent) this.scene.add(this.diagnosticsGroup)
        this.refreshDiagnostics()
    }

    private diagnosticOptions(): Required<VxDiagnosticsSettings> | null {
        if (!this.diagnostics) return null
        if (this.diagnostics === true) {
            return { groupBounds: true, footprints: true, connectionPorts: true, nodeIds: true }
        }
        return {
            groupBounds: this.diagnostics.groupBounds ?? true,
            footprints: this.diagnostics.footprints ?? true,
            connectionPorts: this.diagnostics.connectionPorts ?? true,
            nodeIds: this.diagnostics.nodeIds ?? true,
        }
    }

    private clearDiagnostics(): void {
        if (!this.diagnosticsGroup) return
        const disposedGeometry = new Set<THREE.BufferGeometry>()
        const disposedMaterial = new Set<THREE.Material>()
        this.diagnosticsGroup.traverse(object => {
            const diagnostic = object as THREE.Mesh & { dispose?: () => void }
            if (diagnostic.geometry && !disposedGeometry.has(diagnostic.geometry)) {
                disposedGeometry.add(diagnostic.geometry)
                diagnostic.geometry.dispose()
            }
            const materials = diagnostic.material
                ? (Array.isArray(diagnostic.material) ? diagnostic.material : [diagnostic.material])
                : []
            materials.forEach(material => {
                if (!disposedMaterial.has(material)) {
                    disposedMaterial.add(material)
                    material.dispose()
                }
            })
            if (object !== this.diagnosticsGroup && typeof diagnostic.dispose === 'function') diagnostic.dispose()
        })
        this.diagnosticsGroup.clear()
    }

    private diagnosticLineMaterial(color: number): THREE.LineBasicMaterial {
        return new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })
    }

    private refreshDiagnostics(): void {
        if (!this.diagnosticsGroup || !this.nodesById) return
        this.clearDiagnostics()
        const options = this.diagnosticOptions()
        if (!options) return

        for (const [id, node] of this.nodesById) {
            const object = node.element.mesh
            if (!object || !node.visible || id !== node.id) continue
            object.updateWorldMatrix(true, true)
            const bounds = worldBoundsOf(object)

            if (options.groupBounds && (node as Node & { isGroupNode?: boolean }).isGroupNode && !bounds.isEmpty()) {
                const helper = new THREE.Box3Helper(bounds, 0x78d98b)
                helper.name = `vx-diagnostic-group-${id}`
                helper.userData.vxDiagnostic = 'group-bounds'
                const materials = Array.isArray(helper.material) ? helper.material : [helper.material]
                materials.forEach(material => { material.depthTest = false })
                helper.renderOrder = 1001
                this.diagnosticsGroup.add(helper)
            }

            if (options.footprints) {
                const size = node.measuredSize.value
                if (size.x > 0 || size.y > 0 || size.z > 0) {
                    const box = new THREE.BoxGeometry(
                        Math.max(size.x, 0.002),
                        Math.max(size.y, 0.002),
                        Math.max(size.z, 0.002),
                    )
                    const edges = new THREE.EdgesGeometry(box)
                    box.dispose()
                    const footprint = new THREE.LineSegments(edges, this.diagnosticLineMaterial(0x55d7ed))
                    const offset = node.renderOffset()
                    footprint.matrix.copy(object.matrixWorld).multiply(
                        new THREE.Matrix4().makeTranslation(
                            -offset.x,
                            size.y / 2 - offset.y,
                            -offset.z,
                        ),
                    )
                    footprint.matrixAutoUpdate = false
                    footprint.name = `vx-diagnostic-footprint-${id}`
                    footprint.userData.vxDiagnostic = 'footprint'
                    footprint.renderOrder = 1002
                    this.diagnosticsGroup.add(footprint)
                }
            }

            if (options.nodeIds) {
                const center = bounds.isEmpty()
                    ? node.element.getWorldPosition()
                    : bounds.getCenter(new THREE.Vector3())
                const top = bounds.isEmpty() ? center.y : bounds.max.y
                const label: any = new Text()
                label.text = id
                label.fontSize = 0.11
                label.color = 0xffffff
                label.anchorX = 'center'
                label.anchorY = 'bottom'
                label.position.set(center.x, top + 0.06, center.z)
                label.name = `vx-diagnostic-id-${id}`
                label.userData.vxDiagnostic = 'node-id'
                label.userData.vxBloomEffects = { bloom: 'exclude', bloomGain: 0 }
                label.userData.vxBloomRole = 'annotation'
                label.renderOrder = 1004
                label.material.depthTest = false
                label.sync()
                this.diagnosticsGroup.add(label)
            }
        }

        if (options.connectionPorts) {
            for (const portRecord of this.connectors.getConnectionPorts?.() ?? []) {
                const port = new THREE.Mesh(
                    new THREE.SphereGeometry(0.045, 10, 6),
                    new THREE.MeshBasicMaterial({
                        color: portRecord.role === 'from' ? 0xffb454 : 0xff7c66,
                        depthTest: false,
                    }),
                )
                port.position.copy(portRecord.point)
                port.name = `vx-diagnostic-port-${portRecord.id}-${portRecord.role}`
                port.userData.vxDiagnostic = 'connection-port'
                port.renderOrder = 1003
                this.diagnosticsGroup.add(port)
            }
        }
    }

    animateTo(id: string, props: VxAnimProps, opts: VxAnimOptions = {}) {
        const mesh = this.getById(id)?.mesh;
        if (!mesh) return;

        const { duration = 0.4, ease = 'power2.out', delay, onComplete } = opts;
        if (!hasAnimatedTransform(props)) return;

        const animation = animationTransform(mesh, props);
        const progress = { value: 0 };
        gsap.timeline({ ...(onComplete && { onComplete }) }).to(progress, {
            value: 1,
            duration,
            ease,
            ...(delay !== undefined && { delay }),
            onUpdate: () => applyAnimationTransform(mesh, animation, progress.value),
        }, 0);
    }

    destroy() {
        if (this.destroyed) return
        this.destroyed = true
        this.camera?.dispose()
        if (this.refitFrame !== undefined && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.refitFrame)
            this.refitFrame = undefined
        }
        this.clearDiagnostics()
        this.connectors.clear();
        this.liveLighting?.dispose()
        this.disposeStageSurfaces()
        this.nodesById.clear()
        this.nodesByName.clear()
        super.destroy();
    }

    private disposeStageSurfaces() {
        this.disposeOwnedMesh(this.floorSurface)
        this.floorSurface = undefined
        this.caps.texture?.texture.dispose()
        this.caps.texture = null
        this.caps.updateFn = () => {}


        if (this.groundMirror) {
            this.groundMirror.removeFromParent()
            this.groundMirror.geometry.dispose()
            this.groundMirror.dispose()
            this.groundMirror = undefined
        }
    }

    private disposeOwnedMesh(mesh?: THREE.Mesh) {
        if (!mesh) return

        mesh.removeFromParent()
        mesh.geometry.dispose()
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) material.dispose()
    }

    // --- events ---

    private mouseEventFor(mesh: THREE.Mesh, event: MouseEvent): VxMouseEvent | undefined {
        const el3d = mesh.userData.el as Element3d | undefined;
        if (!el3d || el3d.node.disabled) return undefined;

        const ev = event as VxMouseEvent;
        ev.vxNode = el3d.node;
        ev.vxPosition = el3d.mesh?.position.clone();
        const instanceNode = el3d.node as Node & {
            instanceHitAt?: (
                instanceIndex: number,
                object?: THREE.Object3D,
            ) => InstanceHit<unknown> | GeometryHit<unknown> | ParticleHit<unknown> | undefined
        };
        ev.vxInstance = this.selectedInstanceId === undefined
            ? undefined
            : instanceNode.instanceHitAt?.(this.selectedInstanceId, mesh);
        return ev;
    }

    onCanvasClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const ownerId = this.selectedObject.userData.vxConnectorOwner as string | undefined
            if (ownerId) {
                this.connectors.dispatchOwnerEvent(ownerId, 'onClick', this.selectedObject, this.selectedInstanceId, event, this.selectedIntersection)
                return
            }
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = this.mouseEventFor(this.selectedObject, event);
            if (ev) el3d.mesh?.dispatchEvent({ type: 'click', originalEvent: ev });
        }
    }

    onCanvasDblClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const ownerId = this.selectedObject.userData.vxConnectorOwner as string | undefined
            if (ownerId) {
                this.connectors.dispatchOwnerEvent(ownerId, 'onDblclick', this.selectedObject, this.selectedInstanceId, event, this.selectedIntersection)
                return
            }
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = this.mouseEventFor(this.selectedObject, event);
            if (ev) el3d.mesh?.dispatchEvent({ type: 'dblclick', originalEvent: ev });
        }
    }

    protected onMouseOver(mesh: THREE.Mesh, event: MouseEvent) {
        const ownerId = mesh.userData.vxConnectorOwner as string | undefined
        if (ownerId) {
            this.connectors.dispatchOwnerEvent(ownerId, 'onPointerenter', mesh, this.selectedInstanceId, event, this.selectedIntersection)
            return
        }
        const el3d = mesh.userData.el as Element3d | undefined;
        const ev = this.mouseEventFor(mesh, event);
        if (ev) el3d?.mesh?.dispatchEvent({ type: 'mouseOver', originalEvent: ev });
    }

    protected onMouseOut(mesh: THREE.Mesh, event: MouseEvent) {
        const ownerId = mesh.userData.vxConnectorOwner as string | undefined
        if (ownerId) {
            this.connectors.dispatchOwnerEvent(ownerId, 'onPointerleave', mesh, this.selectedInstanceId, event, this.selectedIntersection)
            return
        }
        const el3d = mesh.userData.el as Element3d | undefined;
        const ev = this.mouseEventFor(mesh, event);
        if (ev) el3d?.mesh?.dispatchEvent({ type: 'mouseOut', originalEvent: ev });
    }

    onShowAnnotation(mesh: THREE.Mesh) {
        if (!mesh) return;

        const vector = this.toScreenPosition(mesh, this.renderCamera);
        this.subscribers.forEach(fn => fn(mesh.name, vector));
    }

    fitToContent(options: VxFitOptions = {}): boolean {
        this.camera?.release()
        this.activeCameraTarget = 'scene'
        this.fitOptions = {
            padding: options.padding ?? this.fitOptions.padding,
            duration: options.duration ?? this.fitOptions.duration,
        }

        const bounds = this.contentBounds()
        if (bounds.isEmpty()) return false

        return this.frameBounds(bounds, this.fitOptions, this.overviewDirection(), true)
    }

    /** Coalesce geometry/layout invalidations into one camera update per frame. */
    invalidateContentBounds(): void {
        if (this.destroyed || this.refitQueued) return
        this.refitQueued = true

        const run = () => {
            this.refitQueued = false
            this.refitFrame = undefined
            if (this.destroyed) return
            this.refreshDiagnostics()
            if (this.camera?.isExplicit) return
            if (this.activeCameraTarget === 'scene') {
                this.refitContent()
            } else {
                this.focusObject(this.activeCameraTarget, this.focusOptions, false)
            }
        }

        if (typeof requestAnimationFrame === 'function') {
            this.refitFrame = requestAnimationFrame(run)
        } else {
            queueMicrotask(run)
        }
    }

    override onWindowResize() {
        super.onWindowResize()
        this.invalidateContentBounds()
    }

    sendCameraTo(camera: string) {
        this.camera?.release()
        this.activeCameraTarget = camera
        if (camera === 'scene') {
            this.fitToContent()
            return
        }

        this.cameraMotion.set(0.0, 0.0, 0.0)
        this.focusObject(camera, this.focusOptions, true)
    }

    private refitContent(): boolean {
        const bounds = this.contentBounds()
        if (bounds.isEmpty()) return false
        return this.frameBounds(bounds, this.fitOptions, this.overviewDirection(), false)
    }

    private focusObject(name: string, options: Required<VxFitOptions>, force: boolean): boolean {
        const object = this.getById(name)?.mesh
        if (!object) return false

        return this.frameBounds(worldBoundsOf(object), options, this.focusDirection(), force)
    }

    private frameBounds(
        bounds: THREE.Box3,
        options: Required<VxFitOptions>,
        direction: THREE.Vector3,
        force: boolean,
    ): boolean {
        if (!force && this.framingIsCurrent(bounds)) return true
        const frame = cameraFrameForBounds(this.renderCamera, bounds, direction, options.padding)
        if (!frame) return false

        const size = bounds.getSize(new THREE.Vector3())
        const distance = frame.position.distanceTo(frame.target)
        this.renderCamera.near = Math.max(0.01, distance / 1000)
        this.renderCamera.far = Math.max(64, distance + size.length() * 3)
        this.renderCamera.updateProjectionMatrix()
        this.retargetCamera(frame.target, frame.position, options.duration)
        this.lastFraming = {
            target: this.activeCameraTarget,
            bounds: bounds.clone(),
            aspect: this.renderCamera.aspect,
        }
        return true
    }

    private framingIsCurrent(bounds: THREE.Box3): boolean {
        const previous = this.lastFraming
        if (!previous || previous.target !== this.activeCameraTarget || previous.aspect !== this.renderCamera.aspect) return false
        const epsilon = 0.01
        return previous.bounds.min.distanceToSquared(bounds.min) <= epsilon * epsilon
            && previous.bounds.max.distanceToSquared(bounds.max) <= epsilon * epsilon
    }

    private contentBounds(): THREE.Box3 {
        const bounds = new THREE.Box3()
        const includeAuthoredRoots = (object: THREE.Object3D, insideAuthoredRoot: boolean) => {
            if (!object.visible) return
            const authored = Boolean(object.userData.el)
            if (authored && !insideAuthoredRoot) {
                bounds.union(worldBoundsOf(object))
                return
            }
            object.children.forEach(child => includeAuthoredRoots(child, insideAuthoredRoot || authored))
        }
        this.scene.children.forEach(child => includeAuthoredRoots(child, false))
        return bounds
    }

    private overviewDirection(): THREE.Vector3 {
        // cameraBase is the settled destination even while a previous camera
        // transition is still in flight, so reactive refits keep one heading.
        const direction = this.cameraBase.clone().sub(this.cameraTarget)
        return direction.lengthSq() > 1e-8 ? direction : new THREE.Vector3(0, 0.65, 1)
    }

    private focusDirection(): THREE.Vector3 {
        return new THREE.Vector3(0, 0.8, 1)
    }
}

import * as THREE from 'three';
import * as THREEx from '@/lib-components/three/three.imports.js';
import Scene from '@/lib-components/three/scene.js';
import {Element3d, VxEventMap} from '@/lib-components/three/element3d.js';
import {Node} from '@/lib-components/nodes/Node.js';
import type {InstanceHit} from '@/lib-components/nodes/InstanceNode.js';
import {Connectors} from '@/lib-components/three/connectors/connectors.js';
import gsap from 'gsap';
import {Text} from 'troika-three-text';

/**
 * Target transform values for animateTo(). Each field is optional — only
 * specified fields are animated; the rest are left unchanged.
 *
 * `scale` is a uniform shorthand; `scaleX/Y/Z` override it per-axis.
 */
export interface VxAnimProps {
    positionY?: number
    scale?: number
    scaleX?: number
    scaleY?: number
    scaleZ?: number
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

export interface VxFitOptions {
    /** World-space margin added around the measured bounds. */
    padding?: number
    /** Camera transition duration in seconds. */
    duration?: number
}

export interface VxStage {
    getScene(): THREE.Scene
    onEachFrame(fn: (time: number, tick:number) => void): void
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
}

export interface VxDiagnosticsSettings {
    groupBounds?: boolean
    footprints?: boolean
    connectionPorts?: boolean
    nodeIds?: boolean
}

export interface VxSettings {
    color?: number
    backgroundColor?: number
    mirrorOpacity?: number
    floorColor?: number
    highlightColor?: number
    particleColor?: number
    captionColor?: number

    lightColor1?: number
    lightColor2?: number
    lightColor3?: number

    particleSpread?: number
    particleVolume?: number
    particleBlending?: THREE.Blending

    unit?: number
    distance?: number
    gap?: number
    wall?: VxWallSettings
    diagnostics?: boolean | VxDiagnosticsSettings
    floorGrid?: boolean
    floorMirror?: boolean
    floorCaptions?: boolean
    shadows?: boolean
}

export interface VxWallSettings {
    shape?: 'flat' | 'curved'
    color?: number
    gridColor?: number
    opacity?: number
    width?: number
    height?: number
    radius?: number
    arc?: number
    y?: number
    z?: number
    title?: string
    subtitle?: string
}

export interface VxMouseEvent extends MouseEvent {
    vxNode: Node;
    vxPosition: any;
    vxInstance?: InstanceHit<unknown>;
}

let BOX_RADIUS = 1.0;
let BOX_DISTANCE = 1.0;
const FLOOR_Y = -0.2495;
const FLOOR_REFLECTOR_Y = -0.251;
const DEVELOPMENT_CHECKS = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? true;

/**
 * Keep the floor decal inside the reflector subtree. Reflector hides itself
 * while rendering its texture, which must also hide the nearly coplanar decal
 * to avoid feeding the floor back into its own reflection.
 */
export function attachFloorOverlay(
    scene: THREE.Scene,
    overlay: THREE.Mesh,
    reflector?: THREE.Object3D,
): void {
    const materials = Array.isArray(overlay.material) ? overlay.material : [overlay.material]
    for (const material of materials) {
        material.depthWrite = reflector === undefined
        material.polygonOffset = reflector !== undefined
        material.polygonOffsetFactor = -1
        material.polygonOffsetUnits = -1
    }

    overlay.name = 'vx-floor-overlay'
    overlay.castShadow = false
    overlay.receiveShadow = true

    if (reflector) {
        // Reflector's local +Z is world +Y after its -90 degree X rotation.
        overlay.position.set(0, 0, FLOOR_Y - FLOOR_REFLECTOR_Y)
        overlay.rotation.set(0, 0, 0)
        overlay.renderOrder = 1
        reflector.add(overlay)
        return
    }

    overlay.rotation.x = -Math.PI / 2
    overlay.position.y = FLOOR_Y
    scene.add(overlay)
}

export function createBackgroundWallGeometry(settings: VxWallSettings): THREE.BufferGeometry {
    const height = settings.height ?? 5
    if (settings.shape === 'curved') {
        const radius = settings.radius ?? 7
        const arc = THREE.MathUtils.degToRad(settings.arc ?? 110)
        return new THREE.CylinderGeometry(
            radius,
            radius,
            height,
            128,
            1,
            true,
            Math.PI - arc / 2,
            arc,
        )
    }
    return new THREE.PlaneGeometry(settings.width ?? 11, height, 32, 1)
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
    private subscribers: Function[] = [];
    public connectors: Connectors;
    settings: VxSettings
    private caps: { repeats: number; size: number; planeSize: number; updateFn: () => void; texture: THREEx.DynamicTexture | null } = {
        planeSize: 256,
        size: 2048,
        repeats: 17,
        texture: null,
        updateFn: () => {}
    }
    private captions: Array<{x:number, y:number, text:string, visible: boolean}> = []
    private groundMirror?: THREE.Object3D
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
        this.boxDistance = settings.distance || BOX_DISTANCE
        this.gap = settings.gap ?? this.boxDistance
        this.colorMain = new THREE.Color(settings.color || 0x555555);
        this.colorHighlight = new THREE.Color(settings.highlightColor || 0x4c7fb2);
        this.scene.background = new THREE.Color(settings.backgroundColor ?? 0x808080);
        this.renderer.shadowMap.enabled = this.shadowsEnabled()
        this.diagnosticsGroup.name = 'vx-diagnostics'
        this.diagnosticsGroup.renderOrder = 1000
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    onEachFrame(fn: (time: number, tick:number) => void): void {
        // this.onAnimate(fn);
    }

    mount() {
        const scene = this.scene;
        scene.add(this.diagnosticsGroup)
        this.createGroundMirror(scene);
        this.createFloor(scene);
        this.createBackgroundWall(scene);
        this.createLights(scene);

        //particle system
        this.connectors.mount();

        //TODO
        //gsap.to(this.camera.position, {duration:2.1, x:0.2, y:1.75, z:2.5,  delay: 0.5});
        this.registerAnimation(this.cameraAnimationFn()); //push tween function to be called on each frame
        this.registerAnimation(this.mouseAnimationFn());
        this.refreshDiagnostics()
    }

    getById(id: string): Element3d {
        const registered = this.nodesById?.get(id)?.element
        if (registered) return registered
        return (this.scene.getObjectByName('el-'+id) as THREE.Mesh)?.userData.el;
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

    createGroundMirror(scene: THREE.Scene) {
        this.groundMirror = undefined
        if (this.settings.floorMirror === false) return
        if (this.settings.mirrorOpacity === undefined) {
            this.settings.mirrorOpacity = 0.95;
        }
        if (this.settings.mirrorOpacity < 0.999) {
            const geometry = new THREE.PlaneGeometry(100, 100);
            const groundMirror = new THREEx.Reflector(geometry, {
                clipBias: 0.003,
                textureWidth: this.width * window.devicePixelRatio * 2,
                textureHeight: this.height * window.devicePixelRatio * 2,
                color: new THREE.Color(this.settings.floorColor || 0x777777)
            });
            groundMirror.name = 'vx-ground-reflector';
            groundMirror.rotateX(-Math.PI / 2);
            groundMirror.position.y = FLOOR_REFLECTOR_Y;
            groundMirror.receiveShadow = false;
            scene.add(groundMirror);
            this.groundMirror = groundMirror;
        }
    }

    createFloor(scene: THREE.Scene) {
        const caps = this.caps;
        const textureOffset = Math.floor(caps.repeats/2);
        //overlay plane
        const texture = new THREEx.DynamicTexture(caps.size, caps.size)
        caps.texture = texture
        texture.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        texture.texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.texture.generateMipmaps = true
        texture.texture.repeat.set(caps.repeats, caps.repeats)
        texture.texture.offset.set(-textureOffset, -textureOffset)

        this.repaintTitles(caps.planeSize)
        caps.updateFn = () => this.repaintTitles(caps.planeSize)

        const material = new THREE.MeshStandardMaterial({
            color: '#f0f0f0',
            roughness: 0.7,
            metalness: 0.5,
            opacity: 1.0,
            transparent: true,
            map: texture.texture
        });
        material.toneMapped = false;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(caps.planeSize, caps.planeSize), material);
        attachFloorOverlay(scene, plane, this.groundMirror)
        plane.receiveShadow = this.shadowsEnabled()
    }

    createBackgroundWall(scene: THREE.Scene) {
        const settings = this.settings.wall
        if (!settings) return
        const opacity = THREE.MathUtils.clamp(settings.opacity ?? 1, 0, 1)

        const texture = new THREEx.DynamicTexture(1024, 512)
        this.paintBackgroundWallTexture(texture, settings)
        texture.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        texture.texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.texture.generateMipmaps = true
        if (settings.shape === 'curved') {
            // The stage is viewed from the cylinder's inner face.
            texture.texture.wrapS = THREE.RepeatWrapping
            texture.texture.repeat.x = -1
            texture.texture.offset.x = 1
        }

        const material = new THREE.MeshBasicMaterial({
            map: texture.texture,
            transparent: opacity < 1,
            side: THREE.DoubleSide,
            depthWrite: opacity === 1,
        })
        const height = settings.height ?? 5
        const wall = new THREE.Mesh(createBackgroundWallGeometry(settings), material)
        wall.name = 'vx-background-wall'
        wall.position.set(
            0,
            settings.y ?? height / 2 - 0.2,
            settings.z ?? (settings.shape === 'curved' ? 1.5 : -4.5),
        )
        wall.renderOrder = -10
        scene.add(wall)
    }

    paintBackgroundWallTexture(texture: THREEx.DynamicTexture, settings: VxWallSettings) {
        const width = 1024
        const height = 512
        const color = settings.color ?? this.settings.floorColor ?? 0x20282d
        const gridColor = settings.gridColor ?? this.settings.captionColor ?? 0xffffff

        texture.clear(cssColorWithAlpha(color, settings.opacity ?? 1))
        texture.fillStyle = cssColor(gridColor)
        texture.setGlobalAlpha(0.055)
        for (let x = 0; x <= width; x += 32) texture.fillRect(x, 0, 1, height)
        for (let y = 0; y <= height; y += 32) texture.fillRect(0, y, width, 1)
        texture.setGlobalAlpha(0.16)
        for (let x = 0; x <= width; x += 128) texture.fillRect(x, 0, 2, height)
        for (let y = 0; y <= height; y += 128) texture.fillRect(0, y, width, 2)

        texture.setGlobalAlpha(1)
        if (settings.title) {
            texture.drawText(settings.title, 48, 176, cssColor(gridColor), 'bold 34px Helvetica')
        }
        if (settings.subtitle) {
            texture.drawText(settings.subtitle, 48, 210, cssColor(gridColor), '18px Helvetica')
        }
    }

    repaintTitles(mirrorSize: number) {
        const caps = this.caps;
        const textureSize = caps.size;
        const textureRepeats = caps.repeats;
        const texture = caps.texture!;
        texture.clear(undefined)
        texture.clear('#' + ( this.settings.floorColor || 0x3f3f3f).toString(16) +
            Math.floor((this.settings.mirrorOpacity || 0.90)*256).toString(16) //opacity
        );

        texture.context.font = "bold "+Math.floor(textureSize/72)+"px Helvetica"
        const scale = textureSize / mirrorSize * textureRepeats;
        if (this.settings.floorCaptions !== false) this.captions.filter(c => c.visible).forEach(c => {
            const w = texture.context.measureText(c.text).width

            const x = c.x * scale
            const y = c.y * scale
            texture.drawText(c.text, x + textureSize / 2 - w / 2, y + textureSize / 2 + this.boxRadius/4*scale,
                '#'+(this.settings.captionColor || 0xffffff).toString(16))
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
        const light = new THREE.DirectionalLight(this.settings.lightColor1 || 0xccffff, 2.0);

        light.position.set(20, 3, -25);
        light.target.position.set(-5, -0.5, 0);
        scene.add(light);

        const light2 = new THREE.DirectionalLight(this.settings.lightColor2 || 0xffffff, 5.5);
        light2.position.set(-7, 25, 13);
        light2.target.position.set( 0, 0, 0 );
        light2.castShadow = this.shadowsEnabled();
        const d = 8;
        light2.shadow.camera = new THREE.OrthographicCamera( -d, d, d, -d,  0.5, 55);
        light2.shadow.radius = 7;
        light2.shadow.bias = -0.004;
        light2.shadow.normalBias = 0;
        (light2.shadow as any).blurSamples = 16;
        light2.shadow.mapSize.width = light2.shadow.mapSize.height = 512;

        scene.add(light2);

        // let light3 = new THREE.PointLight(this.settings.lightColor1 || 0xbbbbff, 0.3);
        // light3.position.set(10, -10, 5);
        //const light3 = new THREE.HemisphereLight(0xffffff, 0x000000, 1.0);
        //light3.castShadow = true;
        //scene.add(light3);
        //
        // const light4 = new THREE.AmbientLight(this.settings.lightColor3 || 0xffffff, 0.3);
        // light4.position.y = 10;
        // scene.add(light4);
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
        if (this.settings.floorCaptions === false) return undefined
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

    connect(el1: string, el2: string, layout?: string, type?: string, registrationId?: string): string {
        return this.connectors.register(el1, el2, layout, type, registrationId);
    }

    unregisterConnection(registrationId: string) {
        this.connectors.unregister(registrationId);
    }

    public reconcileConnections() {
        this.connectors.reconcileConnections();
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

            if (options.connectionPorts) {
                const port = new THREE.Mesh(
                    new THREE.SphereGeometry(0.045, 10, 6),
                    new THREE.MeshBasicMaterial({ color: 0xffb454, depthTest: false }),
                )
                port.position.copy(node.element.getWorldPosition())
                port.name = `vx-diagnostic-port-${id}`
                port.userData.vxDiagnostic = 'connection-port'
                port.renderOrder = 1003
                this.diagnosticsGroup.add(port)
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
                label.renderOrder = 1004
                label.material.depthTest = false
                label.sync()
                this.diagnosticsGroup.add(label)
            }
        }
    }

    disconnect(el1: Element3d, el2: Element3d) {
        if (el1 && el2) this.connectors.unregisterPair(el1, el2);
    }

    animateTo(id: string, props: VxAnimProps, opts: VxAnimOptions = {}) {
        const mesh = this.getById(id)?.mesh;
        if (!mesh) return;

        const { duration = 0.4, ease = 'power2.out', delay, onComplete } = opts;
        const tweenBase: gsap.TweenVars = { duration, ease, ...(delay !== undefined && { delay }) };

        const posProps: Record<string, number> = {};
        if (props.positionY !== undefined) posProps.y = props.positionY;

        const scaleProps: Record<string, number> = {};
        if (props.scale !== undefined) { scaleProps.x = scaleProps.y = scaleProps.z = props.scale; }
        if (props.scaleX !== undefined) scaleProps.x = props.scaleX;
        if (props.scaleY !== undefined) scaleProps.y = props.scaleY;
        if (props.scaleZ !== undefined) scaleProps.z = props.scaleZ;

        if (!Object.keys(posProps).length && !Object.keys(scaleProps).length) return;

        const tl = gsap.timeline({ ...(onComplete && { onComplete }) });

        if (Object.keys(posProps).length) {
            tl.to(mesh.position, { ...posProps, ...tweenBase }, 0);
        }

        if (Object.keys(scaleProps).length) {
            tl.to(mesh.scale, { ...scaleProps, ...tweenBase }, 0);
        }
    }

    destroy() {
        this.destroyed = true
        if (this.refitFrame !== undefined && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.refitFrame)
            this.refitFrame = undefined
        }
        super.destroy();
        this.clearDiagnostics()
        this.nodesById.clear()
        this.nodesByName.clear()
        this.connectors.clear();
    }

    // --- events ---

    private mouseEventFor(mesh: THREE.Mesh, event: MouseEvent): VxMouseEvent | undefined {
        const el3d = mesh.userData.el as Element3d | undefined;
        if (!el3d || el3d.node.disabled) return undefined;

        const ev = event as VxMouseEvent;
        ev.vxNode = el3d.node;
        ev.vxPosition = el3d.mesh?.position.clone();
        const instanceNode = el3d.node as Node & {
            instanceHitAt?: (instanceIndex: number) => InstanceHit<unknown> | undefined
        };
        ev.vxInstance = this.selectedInstanceId === undefined
            ? undefined
            : instanceNode.instanceHitAt?.(this.selectedInstanceId);
        return ev;
    }

    onCanvasClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = this.mouseEventFor(this.selectedObject, event);
            if (ev) el3d.mesh?.dispatchEvent({ type: 'click', originalEvent: ev });
        }
    }

    onCanvasDblClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = this.mouseEventFor(this.selectedObject, event);
            if (ev) el3d.mesh?.dispatchEvent({ type: 'dblclick', originalEvent: ev });
        }
    }

    protected onMouseOver(mesh: THREE.Mesh, event: MouseEvent) {
        const el3d = mesh.userData.el as Element3d | undefined;
        const ev = this.mouseEventFor(mesh, event);
        if (ev) el3d?.mesh?.dispatchEvent({ type: 'mouseOver', originalEvent: ev });
    }

    protected onMouseOut(mesh: THREE.Mesh, event: MouseEvent) {
        const el3d = mesh.userData.el as Element3d | undefined;
        const ev = this.mouseEventFor(mesh, event);
        if (ev) el3d?.mesh?.dispatchEvent({ type: 'mouseOut', originalEvent: ev });
    }

    onShowAnnotation(mesh: THREE.Mesh) {
        if (!mesh) return;

        const vector = this.toScreenPosition(mesh, this.camera);
        this.subscribers.forEach(fn => fn(mesh.name, vector));
    }

    fitToContent(options: VxFitOptions = {}): boolean {
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
        const object = this.getById(name)?.mesh ?? this.scene.getObjectByName(`el-${name}`)
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
        const frame = cameraFrameForBounds(this.camera, bounds, direction, options.padding)
        if (!frame) return false

        const size = bounds.getSize(new THREE.Vector3())
        const distance = frame.position.distanceTo(frame.target)
        this.camera.near = Math.max(0.01, distance / 1000)
        this.camera.far = Math.max(64, distance + size.length() * 3)
        this.camera.updateProjectionMatrix()
        this.retargetCamera(frame.target, frame.position, options.duration)
        this.lastFraming = {
            target: this.activeCameraTarget,
            bounds: bounds.clone(),
            aspect: this.camera.aspect,
        }
        return true
    }

    private framingIsCurrent(bounds: THREE.Box3): boolean {
        const previous = this.lastFraming
        if (!previous || previous.target !== this.activeCameraTarget || previous.aspect !== this.camera.aspect) return false
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

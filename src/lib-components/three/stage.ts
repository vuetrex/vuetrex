import * as THREE from 'three';
import * as THREEx from '@/lib-components/three/three.imports.js';
import Scene from '@/lib-components/three/scene.js';
import {Element3d, VxEventMap} from '@/lib-components/three/element3d.js';
import {Node} from '@/lib-components/nodes/Node.js';
import {Connectors} from '@/lib-components/three/connectors/connectors.js';
import gsap from 'gsap';

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

export interface VxStage {
    getScene(): THREE.Scene
    onEachFrame(fn: (time: number, tick:number) => void): void
    /**
     * Animate the named node's transform to the given target values.
     * Isolates callers from Three.js internals — use this instead of
     * accessing mesh.position / mesh.scale directly.
     */
    animateTo(id: string, props: VxAnimProps, opts?: VxAnimOptions): void
}

export interface VxSettings {
    color?: number
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
}

export interface VxMouseEvent extends MouseEvent {
    vxNode: Node;
    vxPosition: any;
}

let BOX_RADIUS = 1.0;
let BOX_DISTANCE = 1.0;

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
    private captions: Array<{x:number, y:number, text:string}> = []
    boxRadius: number;
    boxDistance: number;
    gap: number;

    constructor(domParent: HTMLElement, settings:VxSettings) {
        super(domParent)
        this.connectors = new Connectors(this);
        this.settings = settings

        this.boxRadius = settings.unit || BOX_RADIUS
        this.boxDistance = settings.distance || BOX_DISTANCE
        this.gap = settings.gap ?? this.boxDistance
        this.colorMain = new THREE.Color(settings.color || 0x555555);
        this.colorHighlight = new THREE.Color(settings.highlightColor || 0x4c7fb2);
    }

    getScene(): THREE.Scene {
        return this.scene;
    }

    onEachFrame(fn: (time: number, tick:number) => void): void {
        // this.onAnimate(fn);
    }

    mount() {
        const scene = this.scene;
        this.createGroundMirror(scene);
        this.createFloor(scene);
        this.createLights(scene);

        //particle system
        this.connectors.mount();

        //TODO
        //gsap.to(this.camera.position, {duration:2.1, x:0.2, y:1.75, z:2.5,  delay: 0.5});
        this.registerAnimation(this.cameraAnimationFn()); //push tween function to be called on each frame
        this.registerAnimation(this.mouseAnimationFn());
    }

    getById(id: string): Element3d {
        return (this.scene.getObjectByName('el-'+id) as THREE.Mesh)?.userData.el;
    }

    onHighlight(fn: Function) {
        this.subscribers.push(fn);
    }

    createGroundMirror(scene: THREE.Scene) {
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
            groundMirror.rotateX(-Math.PI / 2);
            groundMirror.position.y = -0.251;
            groundMirror.receiveShadow = false;
            scene.add(groundMirror);
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

        let material = new THREE.MeshStandardMaterial({
            color: '#f0f0f0',
            roughness: 0.7,
            metalness: 0.5,
            opacity: 1.0,
            transparent: true,
            map: texture.texture
        });
        material.toneMapped = false;
        let plane = new THREE.Mesh(new THREE.PlaneGeometry(caps.planeSize, caps.planeSize), material);
        plane.rotation.x = -Math.PI / 2.0;
        plane.position.y = -0.2495;
        plane.castShadow = false;
        plane.receiveShadow = true;
        scene.add(plane);
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
        this.captions.forEach(c => {
            const w = texture.context.measureText(c.text).width

            const x = c.x * scale
            const y = c.y * scale
            texture.drawText(c.text, x + textureSize / 2 - w / 2, y + textureSize / 2 + this.boxRadius/4*scale,
                '#'+(this.settings.captionColor || 0xffffff).toString(16))
        })

        //grid lines
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
        light2.castShadow = true;
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
        }
    }

    addCaption(el: Element3d, size: number, caption: string) {
        const pos = el.getWorldPosition();
        if (el.mesh && pos.length() === 0) {
            // fallback if mesh exists but matrix not updated
            el.mesh.updateWorldMatrix(true, false);
            el.mesh.getWorldPosition(pos);
        }
        const c = {
            x: pos.x,
            y: pos.z + size / 2.0,
            text: caption
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
            this.connectors.update(el);
            const worldPos = el.getWorldPosition();
            el.mesh.userData.caption.x = worldPos.x
            el.mesh.userData.caption.y = worldPos.z + size / 2.0
            el.mesh.userData.caption.text = el.getCaption()
            this.caps.updateFn();
            return;
        }

        const model = gen(height, size);
        const scale = el.node.getScale();
        model.name = "el-" + el.node.name;
        model.castShadow = true;
        model.position.copy(el.getPosition());
        parentObject.add(model);
        el.mesh = model as THREE.Object3D<VxEventMap>;
        model.userData.caption = this.addCaption(el, size * scale, el.getCaption())
        model.userData.el = el;
        this.connectors.update(el);
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
        super.destroy();
        this.connectors.clear();
    }

    // --- events ---

    onCanvasClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = event as VxMouseEvent;
            ev.vxNode = el3d.node;
            ev.vxPosition = el3d.mesh?.position.clone();
            el3d.mesh?.dispatchEvent({ type: 'click', originalEvent: ev });
        }
    }

    onCanvasDblClick(event: MouseEvent) {
        event.preventDefault();
        if (this.selectedObject) {
            const el3d = this.selectedObject.userData.el as Element3d;
            const ev = event as VxMouseEvent;
            ev.vxNode = el3d.node;
            ev.vxPosition = el3d.mesh?.position.clone();
            el3d.mesh?.dispatchEvent({ type: 'dblclick', originalEvent: ev });
        }
    }

    protected onMouseOver(mesh: THREE.Mesh, event: MouseEvent) {
        const el3d = mesh.userData.el as Element3d;
        if (!el3d) return;
        const ev = event as VxMouseEvent;
        ev.vxNode = el3d.node;
        ev.vxPosition = el3d.mesh?.position.clone();
        el3d.mesh?.dispatchEvent({ type: 'mouseOver', originalEvent: ev });
    }

    protected onMouseOut(mesh: THREE.Mesh, event: MouseEvent) {
        const el3d = mesh.userData.el as Element3d;
        if (!el3d) return;
        const ev = event as VxMouseEvent;
        ev.vxNode = el3d.node;
        ev.vxPosition = el3d.mesh?.position.clone();
        el3d.mesh?.dispatchEvent({ type: 'mouseOut', originalEvent: ev });
    }

    onShowAnnotation(mesh: THREE.Mesh) {
        if (!mesh) return;

        const vector = this.toScreenPosition(mesh, this.camera);
        this.subscribers.forEach(fn => fn(mesh.name, vector));
    }

    sendCameraTo(camera: string) {
        switch (camera) {
            case "scene": {
                //this.cameraMotion.set(0.25, 0.0, 0.25);
                this.retargetCamera(new THREE.Vector3(0.0, 0.0, 1.5), new THREE.Vector3(0.0, 13.0, 8.0))
            } break;
            default: {
                const el: THREE.Object3D | undefined = this.scene.getObjectByName('el-'+camera);
                if (el) {
                    this.cameraMotion.set(0.0, 0.0, 0.0);
                    this.retargetCamera(el.position,
                        new THREE.Vector3(el.position.x, el.position.y + 4.0, el.position.z + 4.2))
                }
            }
        }
    }
}

import * as THREE from 'three';
import * as THREEx from '@/lib-components/three/three.imports.js';
import LifeCycle from '@/lib-components/three/lifecycle.js';
import {Color} from 'three';

interface MousePosition {
    x: number
    y: number
}

/**
 * Scene is tying together renderer, composer, camera, animation frames and events. It is meant to be an
 * abstract base for the particular 3D setup.
 */
export default class Scene extends LifeCycle {

    private domParent: HTMLElement

    public readonly width: number
    public readonly height: number
    readonly cameraTarget: THREE.Vector3 = new THREE.Vector3(0.0, 0.0, 1.0);
    readonly cameraBase: THREE.Vector3 = new THREE.Vector3(0.0, 12.0, 9.0);
    readonly cameraMotion: THREE.Vector3 = new THREE.Vector3(0.5, 0, 0.5);

    private readonly mouse: MousePosition
    protected lastMouseEvent: MouseEvent | null = null;

    readonly camera: THREE.PerspectiveCamera
    readonly scene: THREE.Scene
    renderer: THREE.WebGLRenderer
    selectedObject: (THREE.Mesh | null) = null
    protected selectedInstanceId: number | undefined

    private composer: THREEx.EffectComposer;
    private readonly renderPass: THREEx.RenderPass;

    public colorMain = new THREE.Color(0x555555);
    public colorHighlight = new THREE.Color(0x3377bb);

    private removeEventListeners: Function = () => {};


    /**
     * Constructs Canvas3D under provided DOM parent with Camera and Renderer
     * @param {Element} domParent
     */
    constructor(domParent: HTMLElement) {
        super();
        this.domParent = domParent;
        this.width = domParent.offsetWidth || 1;
        this.height = domParent.offsetHeight || 1;
        this.renderer = this.createRenderer(
            this.width,
            this.height,
            window.devicePixelRatio
        );

        this.domParent.appendChild(this.renderer.domElement);
        //camera
        this.camera = this.createCamera();
        this.camera.lookAt(this.cameraTarget);
        //scene
        this.scene = this.createScene();
        this.scene.background = new Color('#808080');

        //composer for mirror and other effects
        this.composer = new THREEx.EffectComposer(this.renderer)
        this.renderPass = new THREEx.RenderPass(this.scene, this.camera)
        this.composer.addPass(this.renderPass)

        //events
        this.mouse = { x: 0, y: 0 };
        this.bindEvents(domParent);
    }

    bindEvents(domParent: HTMLElement) {
        const resizer = () => this.onWindowResize();
        const wheeler = (e:WheelEvent) => this.onMouseWheel(e)
        const mouseListener = (e:MouseEvent) => this.onCanvasMouseMove(e)
        const clickListener = (e:MouseEvent) => this.onCanvasClick(e)
        const dblclickListener = (e:MouseEvent) => this.onCanvasDblClick(e)

        const resizeObserver = new ResizeObserver(entries => {
            resizer();
        });
        resizeObserver.observe(domParent);
        //window.addEventListener("resize", resizer, false)
        window.addEventListener('wheel', wheeler, false)
        domParent.addEventListener("mousemove", mouseListener)
        domParent.addEventListener("mousedown", clickListener)
        domParent.addEventListener("dblclick", dblclickListener)

        this.removeEventListeners = ()  => {
            window.removeEventListener("resize", resizer)
            window.removeEventListener("wheel", wheeler)
            domParent.removeEventListener("mousemove", mouseListener)
            domParent.removeEventListener("mousedown", clickListener)
            domParent.removeEventListener("dblclick", dblclickListener)
        }
    }

    start() {
        super.start();
    }

    stop() {
        this.stopRenderLoop();
    }

    destroy() {
        this.stopRenderLoop();
        this.removeEventListeners();
        this.scene.clear();
        this.camera.clear();
        while (this.domParent.lastChild) {
            this.domParent.removeChild(this.domParent.lastChild);
        }
        this.renderer.forceContextLoss();
    }

    //--- overridable ---

    createRenderer(width:number, height:number, devicePixelRatio:number) {
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            precision: "highp",
            logarithmicDepthBuffer: false
        });
        renderer.setSize(width, height);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setPixelRatio(devicePixelRatio || 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.VSMShadowMap;
        return renderer;
    }

    createCamera() {
        const camera = new THREE.PerspectiveCamera(
            40,
            this.width / this.height,
            0.1,
            64
        );
        camera.position.copy(this.cameraBase)
        return camera;
    }

    toScreenPosition(obj:THREE.Object3D, camera:THREE.Camera) {
        const vector = new THREE.Vector3();

        // TODO: need to update this when resize window
        const canvas = this.renderer.domElement;
        const widthHalf = 0.5 * canvas.offsetWidth;
        const heightHalf = 0.5 * canvas.offsetHeight;

        obj.updateMatrixWorld();
        vector.setFromMatrixPosition(obj.matrixWorld);
        vector.project(camera);

        vector.x = vector.x * widthHalf + widthHalf + canvas.offsetLeft;
        vector.y = -(vector.y * heightHalf) + heightHalf + canvas.offsetTop;

        return {
            x: vector.x,
            y: vector.y
        };
    }

    createScene() {
        return new THREE.Scene();
    }

    //--- overrides ---
    render() {
        this.composer.render();
    }

    //--- events ---
    onCanvasMouseMove(event: MouseEvent) {
        // the following line would stop any other event handler from firing
        // (such as the mouse's TrackballControls)
        // event.preventDefault();

        if (event.metaKey && event.buttons === 1) {
            this.orbitalRetarget(event);
        }
        this.lastMouseEvent = event;
        this.mouse.x = (event.offsetX / this.domParent.offsetWidth) * 2 - 1;
        this.mouse.y = -(event.offsetY / this.domParent.offsetHeight) * 2 + 1;
    }

    private orbitalRetarget(event: MouseEvent) {
        const mouseX = (event.offsetX / this.domParent.offsetWidth) * 2 - 1;
        const mouseY = -(event.offsetY / this.domParent.offsetHeight) * 2 + 1;
        const dx = mouseX - this.mouse.x;
        const dy = mouseY - this.mouse.y;

        const radius = this.cameraBase.distanceTo(this.cameraTarget);
        const theta = Math.atan2(this.cameraBase.x - this.cameraTarget.x, this.cameraBase.z - this.cameraTarget.z);
        const phi = Math.acos(THREE.MathUtils.clamp((this.cameraBase.y - this.cameraTarget.y) / radius, -1, 1));

        const newTheta = theta - dx * 2;
        const newPhi = THREE.MathUtils.clamp(phi - dy * 2, 0.1, Math.PI - 0.1);

        this.cameraBase.x = this.cameraTarget.x + radius * Math.sin(newPhi) * Math.sin(newTheta);
        this.cameraBase.y = this.cameraTarget.y + radius * Math.cos(newPhi);
        this.cameraBase.z = this.cameraTarget.z + radius * Math.sin(newPhi) * Math.cos(newTheta);
    }

    onCanvasClick(event: MouseEvent) {
        //todo
    }

    onCanvasDblClick(event: MouseEvent) {
        //todo
    }

    protected onMouseOver(mesh: THREE.Mesh, event: MouseEvent) {}

    protected onMouseOut(mesh: THREE.Mesh, event: MouseEvent) {}

    onMouseWheel(event: WheelEvent) {
        //event.preventDefault();

        const dir = this.cameraTarget.clone().sub(this.camera.position).normalize();
        //dir.divideScalar(10);
        const x = this.cameraBase.x + event.deltaY / 300 * dir.x;
        const y = this.cameraBase.y + event.deltaY / 300 * dir.y;
        const z = this.cameraBase.z + event.deltaY / 300 * dir.z;
        if (y>0.8 && z>0.8 && y<17. && z<17.) {
            this.cameraBase.x = x;
            this.cameraBase.y = y;
            this.cameraBase.z = z;
        }
    }


    //--- animations ---

    mouseAnimationFn() {
        return (timer: number, tick:number) => {
            const mouse = this.mouse;
            if (mouse.x === 0 && mouse.y === 0) return;
            let vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
            vector.unproject(this.camera);
            const ray = new THREE.Raycaster(
                this.camera.position,
                vector.sub(this.camera.position).normalize()
            );

            // create an array containing all objects in the scene with which the ray intersects
            const intersects = ray.intersectObjects(this.scene.children, true);
            let found: (undefined | THREE.Intersection);
            if (intersects.length > 0) {
                found = intersects.find(
                    x => x.object && x.object.name.startsWith("el-")
                );
                const labelObject = <THREE.Mesh> (found && found.object);
                const instanceId = found?.instanceId
                if (labelObject && (
                    labelObject !== this.selectedObject || instanceId !== this.selectedInstanceId
                )) {
                    if (this.selectedObject) {
                        if (this.lastMouseEvent) this.onMouseOut(this.selectedObject, this.lastMouseEvent);
                    }
                    this.selectedObject = labelObject;
                    this.selectedInstanceId = instanceId;
                    if (this.lastMouseEvent) this.onMouseOver(labelObject, this.lastMouseEvent);
                }
            }
            if (!found && this.selectedObject) {
                if (this.lastMouseEvent) this.onMouseOut(this.selectedObject, this.lastMouseEvent);
                this.selectedObject = null;
                this.selectedInstanceId = undefined;
            }
        };
    }

    startCameraRotation: THREE.Quaternion = new THREE.Quaternion();
    targetCameraRotation: THREE.Quaternion = new THREE.Quaternion();
    startTime: number = -1;
    startCameraPos: any = null;
    endCameraPos: any = null;

    retargetCamera(lookAt: THREE.Vector3, atPosition: THREE.Vector3) {
        this.startCameraPos = this.camera.position.clone();
        this.endCameraPos = atPosition.clone();
        this.cameraTarget.copy(lookAt);

        this.startCameraRotation.copy(this.camera.quaternion);
        //determine target camera rotation
        const pos = this.camera.position.clone();
        this.camera.position.copy(atPosition);
        this.cameraBase.copy(atPosition);
        this.camera.lookAt(lookAt);
        //restore it back
        this.targetCameraRotation.copy(this.camera.quaternion);
        this.camera.position.copy(pos);
        this.camera.quaternion.copy(this.startCameraRotation);
        this.startTime = this.lifecycle.timer.current

    }

    easeInOut(x: number): number {
        //S-curve flat at 0,0 and 1,1 and 45 deg at 0.5
        return x < 0.5 ? 2*x*x : 1 - (x*(4*x-8)+4) / 2;
    }

    cameraAnimationFn() {
        return (timer:number, tick:number) => {
            if (this.startTime > 0 && timer < this.startTime + 1000) {
                this.camera.position.lerpVectors(this.startCameraPos, this.endCameraPos, this.easeInOut((timer-this.startTime)/1000))

                this.camera.quaternion.slerpQuaternions(this.startCameraRotation, this.targetCameraRotation,
                    this.easeInOut((timer-this.startTime)/1000)
                )
            } else {
                //todo make camera move a little when idle for 5 seconds
                //const phi = Math.sin(timer / 2000);
                this.camera.position.x = this.cameraBase.x; // + this.cameraMotion.x * Math.cos(phi);
                this.camera.position.y = this.cameraBase.y;
                this.camera.position.z = this.cameraBase.z; // + this.cameraMotion.z * Math.sin(phi);
                this.camera.lookAt(this.cameraTarget);
            }
        };
    }

    onWindowResize() {
        let width = this.domParent.clientWidth || 1;
        let height = this.domParent.offsetHeight || 1;
        const camera = this.camera;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // parallax support possible here via
        // camera.position.x = -window.pageYOffset / 500;
        // camera.position.y = 11 + window.pageYOffset / 1000;

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }
}

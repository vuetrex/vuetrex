import {reactive, watchEffect, WatchStopHandle, computed, ComputedRef} from 'vue';
import { Node } from '@/lib-components/nodes/Node.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { VxMaterialProps, VxHoverProps, applyMaterialProps } from '@/lib-components/nodes/material.js';
import { Mesh, MeshStandardMaterial, Color } from 'three';
import gsap from 'gsap';

export interface MeshState {
    text: string;
    size: number;
    height: number;
    connection: string | null;
    material?: VxMaterialProps;
    hover?: VxHoverProps;
}

/**
 * Aggregates all layout-affecting reactive values from the node hierarchy.
 * Declaring these as a single computed ensures watchEffect tracks every
 * dependency — including parent sibling count — without relying on where
 * reactive reads happen to execute inside modelGen() closures.
 *
 * Subclasses that depend on additional hierarchy values (e.g. Stack needing
 * cumulative sibling heights) should override layoutContext and spread super:
 *   protected layoutContext = computed(() => ({ ...super.layoutContext.value, precedingHeight: ... }))
 */
export interface LayoutContext {
    myIdx: number;
    siblingCount: number;
}

function captureProps(mat: MeshStandardMaterial): VxMaterialProps {
    return {
        color: mat.color.getHex(),
        opacity: mat.opacity,
        transparent: mat.transparent,
        roughness: mat.roughness,
        metalness: mat.metalness,
        emissive: mat.emissive.getHex(),
        emissiveIntensity: mat.emissiveIntensity,
        wireframe: mat.wireframe,
    };
}

/**
 * Base class for all geometry nodes (Box, Cylinder, etc.).
 * Owns the js material and handles reactive material prop sync,
 * built-in hover animation, connection wiring, and cleanup.
 * Subclasses only need to implement modelGen().
 */
export abstract class MeshNode extends Node {

    protected state: MeshState;
    protected stopHandle?: WatchStopHandle;
    private materialStopHandle?: WatchStopHandle;
    private connectionStopHandle?: WatchStopHandle;
    protected readonly flushMode: 'post' | 'sync' = 'post'; // see Vue's WatchEffectOptions, Callback Flush Timing

    readonly material: MeshStandardMaterial;

    private baseProps: VxMaterialProps = {};
    private isHovered = false;
    private registeredConnection?: string;

    protected layoutContext: ComputedRef<LayoutContext> = computed(() => ({
        myIdx: this.myIdx.value,
        siblingCount: (this.parent.value?.elements.value.length || 1),
    }));

    protected constructor(stage: VuetrexStage, stateDefaults: Partial<MeshState> = {}) {
        super(stage);
        this.state = reactive({ text: '', size: 1.0, height: 0.5, connection: null, material: undefined, hover: undefined, ...stateDefaults });
        this.material = stage.createElementMaterial();
    }

    abstract modelGen(): (height: number, size: number) => Mesh;

    setSize(size: number) { this.state.size = size; }
    setHeight(height: number) { this.state.height = height; }

    /**
     * Removes the current mesh from the scene and resets the event subscription flag
     * so that the next renderMesh call starts clean and events can be re-wired to
     * the new mesh object. Called both on geometry rebuild and on node removal.
     */
    private clearMesh() {
        if (!this.element.mesh) return;
        if (this.subscribed) {
            this.element.mesh.removeEventListener(Node.CLICK, this.clickListener);
            this.element.mesh.removeEventListener(Node.DBLCLICK, this.dblclickListener);
            this.element.mesh.removeEventListener(Node.MOUSE_OVER, this.mouseOverListener);
            this.element.mesh.removeEventListener(Node.MOUSE_OUT, this.mouseOutListener);
            this.subscribed = false;
        }
        this.isHovered = false;
        this.stage.removeObject(this.element);
    }

    /**
     * syncWithThree() is called based on Vue's nodeOps and is idempotent.
     * It establishes the node’s reactive binding to Three.js.
     * It must follow these rules:
     * Each node installs at most one watcher per concern.
     * Watchers are stopped in onRemoved().
     * Effects only read reactive state and write to external Three.js state.
     * Effects do not mutate the same Vue state they depend on.
     */
    syncWithThree() {
        if (this.stopHandle) return;

        // Capture creation-time material defaults as the initial restore target.
        // By this point Box (or any subclass) has already overwritten this.material
        // in its own constructor, so we read the final material here.
        this.baseProps = captureProps(this.material as MeshStandardMaterial);

        // Geometry watchEffect — rebuilds mesh when layout or geometry params change.
        this.stopHandle = watchEffect(() => {
            const { myIdx, siblingCount } = this.layoutContext.value;
            if (myIdx >= 0) {
                void siblingCount;
                const { height, size } = this.state;
                this.clearMesh();
                const parentObj = this.nearestAncestorObject()
                this.stage.renderMesh(this.element, height, size, this.modelGen(), parentObj);
                this.subscribeEvents();
            }
        }, { flush: this.flushMode });

        // Material watchEffect — applies material prop changes without rebuilding geometry
        // and keeps baseProps in sync so restoreHover always targets the design-time state.
        this.materialStopHandle = watchEffect(() => {
            if (this.state.material) {
                applyMaterialProps(this.material, this.state.material);
                this.baseProps = { ...this.baseProps, ...this.state.material };
            }
        });

        // Connection and Text watchEffect
        this.connectionStopHandle = watchEffect(() => {
            const { connection, text, height, size } = this.state;
            void text;
            if (connection) {
                const key = `${this.name}->${connection}`;
                if (key !== this.registeredConnection) {
                    this.stage.connect(this.name, connection);
                    this.registeredConnection = key;
                }
            } else {
                this.registeredConnection = undefined;
            }

            if (this.element.mesh) {
                this.stage.renderMesh(this.element, height, size, this.modelGen(), this.nearestAncestorObject());
            }
            this.stage.reconcileConnections();
        }, { flush: 'post' });
    }

    override dispatchPointerenter(e: MouseEvent) {
        if (this.state.hover) this.applyHover(this.state.hover);
        super.dispatchPointerenter(e);
    }

    override dispatchPointerleave(e: MouseEvent) {
        if (this.state.hover && this.isHovered) this.restoreHover();
        super.dispatchPointerleave(e);
    }

    private applyHover(hover: VxHoverProps) {
        const mesh = this.element.mesh as Mesh | null;
        if (!mesh) return;

        const t = hover.transition ?? 0.18;
        const mat = this.material as MeshStandardMaterial;

        gsap.killTweensOf(mat.color);
        gsap.killTweensOf(mat);
        gsap.killTweensOf(mesh.scale);

        this.isHovered = true;

        if (hover.color !== undefined) {
            const c = new Color(hover.color);
            gsap.to(mat.color, { r: c.r, g: c.g, b: c.b, duration: t });
        }
        if (hover.opacity !== undefined) {
            if (hover.opacity < 1 || hover.transparent) mat.transparent = true;
            gsap.to(mat, { opacity: hover.opacity, duration: t });
        }
        if (hover.roughness !== undefined) gsap.to(mat, { roughness: hover.roughness, duration: t });
        if (hover.metalness !== undefined) gsap.to(mat, { metalness: hover.metalness, duration: t });
        if (hover.emissive !== undefined) {
            const c = new Color(hover.emissive);
            gsap.to(mat.emissive, { r: c.r, g: c.g, b: c.b, duration: t });
        }
        if (hover.emissiveIntensity !== undefined) gsap.to(mat, { emissiveIntensity: hover.emissiveIntensity, duration: t });
        if (hover.scale !== undefined) {
            gsap.to(mesh.scale, { x: hover.scale, y: hover.scale, z: hover.scale, duration: t, ease: 'sine.out' });
        }
    }

    private restoreHover() {
        const mesh = this.element.mesh as Mesh | null;
        if (!mesh) return;

        const t = this.state.hover!.transition ?? 0.18;
        const mat = this.material as MeshStandardMaterial;
        const hover = this.state.hover!;
        const base = this.baseProps;

        gsap.killTweensOf(mat.color);
        gsap.killTweensOf(mat);
        gsap.killTweensOf(mesh.scale);

        this.isHovered = false;

        if (hover.color !== undefined && base.color !== undefined) {
            const c = new Color(base.color);
            gsap.to(mat.color, { r: c.r, g: c.g, b: c.b, duration: t });
        }
        if (hover.opacity !== undefined && base.opacity !== undefined) {
            gsap.to(mat, { opacity: base.opacity, duration: t,
                onComplete: () => { mat.transparent = base.transparent ?? false; }
            });
        }
        if (hover.roughness !== undefined && base.roughness !== undefined) {
            gsap.to(mat, { roughness: base.roughness, duration: t });
        }
        if (hover.metalness !== undefined && base.metalness !== undefined) {
            gsap.to(mat, { metalness: base.metalness, duration: t });
        }
        if (hover.emissive !== undefined && base.emissive !== undefined) {
            const c = new Color(base.emissive);
            gsap.to(mat.emissive, { r: c.r, g: c.g, b: c.b, duration: t });
        }
        if (hover.emissiveIntensity !== undefined && base.emissiveIntensity !== undefined) {
            gsap.to(mat, { emissiveIntensity: base.emissiveIntensity, duration: t });
        }
        if (hover.scale !== undefined) {
            gsap.to(mesh.scale, { x: 1, y: 1, z: 1, duration: t, ease: 'sine.inOut' });
        }
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle();
            this.stopHandle = undefined;
        }
        if (this.materialStopHandle) {
            this.materialStopHandle();
            this.materialStopHandle = undefined;
        }
        if (this.connectionStopHandle) {
            this.connectionStopHandle();
            this.connectionStopHandle = undefined;
        }
        this.clearMesh();
        this.registeredConnection = undefined;
        this.state.connection = null;
    }
}

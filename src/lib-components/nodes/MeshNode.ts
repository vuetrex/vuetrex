import {reactive, watchEffect, WatchStopHandle, computed, ComputedRef} from 'vue';
import { Node } from '@/lib-components/nodes/Node.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { VxMaterialProps, VxHoverProps, applyMaterialProps } from '@/lib-components/nodes/material.js';
import { Mesh, MeshStandardMaterial, Color, Vector3 } from 'three';
import { Text } from 'troika-three-text';
import gsap from 'gsap';

let meshConnectionRegistrationSequence = 0

export interface MeshState {
    text: string;
    size: number;
    height: number;
    /**
     * Depth along the z axis. When 0 (default), the shape falls back to a
     * square footprint of `size` × `size` in x/z. Only shapes that support
     * a non-square footprint (e.g. Box) honor this; radial shapes ignore it.
     */
    depth: number;
    /**
     * Optional multi-line label rendered as SDF text (via troika-three-text)
     * on one of the mesh faces. An empty array disables the label. The `text`
     * prop is unrelated and still drives the shared floor caption.
     */
    lines: string[];
    /** Which face the `lines` label sits on. Defaults to the +Z (front) face. */
    labelFace: 'front' | 'top';
    /** Label color as an RGB hex integer. Defaults to white (0xffffff). */
    labelColor: number;
    /**
     * Padding fraction reserved as a margin on each side of the face when
     * fitting `lines`. A value of `0.08` means 8% margin on each side, so the
     * label occupies 84% of the face extent. Clamped to [0, 0.45].
     */
    labelPadding: number;
    /**
     * Explicit font size for the label, in world units. When `0` (default)
     * the size is auto-fit from the face extents, line count, and
     * `labelLineHeight`.
     */
    labelFontSize: number;
    /**
     * Line-height multiplier applied to the troika Text mesh AND used in the
     * auto-fit formula so the math matches the actual rendered height.
     * Defaults to `1.15` (troika's approximate 'normal').
     */
    labelLineHeight: number;
    /**
     * Horizontal alignment of the label block on the face. Controls both
     * troika's `anchorX` (where the anchor sits on the text block) and
     * `textAlign` (how multi-line content justifies within the block), and
     * shifts the label's x position by `(w/2 - w*labelPadding)` so a
     * left-aligned label hugs the padded left edge, a right-aligned one hugs
     * the padded right edge, and a centered one stays at x=0.
     */
    labelAlign: 'left' | 'center' | 'right';
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
    private labelStopHandle?: WatchStopHandle;
    // troika's `Text` extends THREE.Mesh at runtime but its .d.ts declares the
    // subset of visual props (anchorX/anchorY/fontSize/color/font/text) as
    // narrow types without the Object3D members. Treated as `any` so we can
    // still touch .position/.rotation/.parent/.add without a TS gymnastics pass.
    private labelMesh?: any;
    protected readonly flushMode: 'post' | 'sync' = 'post'; // see Vue's WatchEffectOptions, Callback Flush Timing

    readonly material: MeshStandardMaterial;

    private baseProps: VxMaterialProps = {};
    private isHovered = false;
    private registeredConnection?: string;
    private readonly connectionRegistrationId = `mesh:${++meshConnectionRegistrationSequence}`;

    protected layoutContext: ComputedRef<LayoutContext> = computed(() => ({
        myIdx: this.myIdx.value,
        siblingCount: (this.parent.value?.elements.value.length || 1),
    }));

    protected constructor(stage: VuetrexStage, stateDefaults: Partial<MeshState> = {}) {
        super(stage);
        this.state = reactive({
            text: '', size: 1.0, height: 0.5, depth: 0,
            lines: [], labelFace: 'front', labelColor: 0xffffff,
            labelPadding: 0.08, labelFontSize: 0, labelLineHeight: 1.15,
            labelAlign: 'center',
            connection: null, material: undefined, hover: undefined,
            ...stateDefaults,
        });
        this.material = stage.createElementMaterial();
    }

    protected override intrinsicSize(): Vector3 {
        const z = this.state.depth > 0 ? this.state.depth : this.state.size;
        return new Vector3(this.state.size, this.state.height, z);
    }

    override renderOffset(): Vector3 {
        return new Vector3(0, this.state.height / 2, 0);
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
        // Label mesh is parented to element.mesh; drop it here so a fresh geometry
        // rebuild does not leak the old Text instance. The label watchEffect will
        // recreate it when reactive deps re-fire.
        this.disposeLabel();
        this.stage.removeObject(this.element);
    }

    private disposeLabel() {
        if (!this.labelMesh) return;
        if (this.labelMesh.parent) this.labelMesh.parent.remove(this.labelMesh);
        this.labelMesh.dispose();
        this.labelMesh = undefined;
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
                const { height, size, depth } = this.state;
                void depth; // tracked so modelGen() rebuilds when depth changes
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
            const { connection, text, height, size, depth } = this.state;
            void text;
            void depth;
            if (connection) {
                const key = `${this.name}->${connection}`;
                if (key !== this.registeredConnection) {
                    this.stage.connect(this.name, connection, undefined, undefined, this.connectionRegistrationId);
                    this.registeredConnection = key;
                }
            } else {
                this.stage.unregisterConnection(this.connectionRegistrationId);
                this.registeredConnection = undefined;
            }

            if (this.element.mesh) {
                this.stage.renderMesh(this.element, height, size, this.modelGen(), this.nearestAncestorObject());
            }
            this.stage.reconcileConnections();
        }, { flush: 'post' });

        // Label watchEffect — lazily creates a troika-three-text Text mesh, parented
        // to element.mesh so it inherits the box transform (including hover scale).
        // Re-runs when lines, geometry, or the layout context change; the latter
        // covers the case where the geometry effect rebuilt the parent mesh.
        this.labelStopHandle = watchEffect(() => {
            // Track layout context so we re-run right after a geometry rebuild.
            void this.layoutContext.value;
            const {
                lines, size, height, depth,
                labelFace, labelColor,
                labelPadding, labelFontSize, labelLineHeight,
                labelAlign,
            } = this.state;
            const parentMesh = this.element.mesh;
            if (!parentMesh) return;
            if (!lines || lines.length === 0) {
                this.disposeLabel();
                return;
            }
            if (!this.labelMesh) {
                this.labelMesh = new Text();
                this.labelMesh.anchorY = 'middle';
                // No `font` set: troika falls back to its bundled default and
                // shares one SDF atlas across the whole scene by default.
            }
            if (this.labelMesh.parent !== parentMesh) {
                if (this.labelMesh.parent) this.labelMesh.parent.remove(this.labelMesh);
                parentMesh.add(this.labelMesh);
            }
            const w = size;
            const d = depth > 0 ? depth : size;
            // Padding is applied symmetrically as a fraction of the face extent,
            // so the label occupies (1 - 2*pad) of both axes.
            const pad = Math.max(0, Math.min(0.45, labelPadding));
            // Use the same line-height for auto-fit AND for troika, otherwise
            // the calculated size ignores actual line spacing and overruns.
            const lh = labelLineHeight > 0 ? labelLineHeight : 1.15;
            // The mesh is centered at its own origin: y ∈ [-h/2, h/2], z ∈ [-d/2, d/2].
            // Nudge the label just outside the face to avoid z-fighting.
            const eps = 0.001;
            // vExt is the vertical extent of the target face in world units.
            const vExt = labelFace === 'top' ? d : height;
            const availW = w * (1 - 2 * pad);
            const availV = vExt * (1 - 2 * pad);
            const autoSize = Math.min(
                availW / 6,
                availV / (lh * Math.max(1, lines.length)),
            );
            const fontSize = labelFontSize > 0 ? labelFontSize : autoSize;
            // Horizontal alignment: shift the anchor to the padded edge and
            // set troika's anchorX/textAlign to match, so multi-line content
            // justifies the same way it's positioned.
            const align: 'left' | 'center' | 'right' =
                labelAlign === 'left' || labelAlign === 'right' ? labelAlign : 'center';
            const xOffset = align === 'left' ? -(w / 2 - w * pad)
                          : align === 'right' ? (w / 2 - w * pad)
                          : 0;
            if (labelFace === 'top') {
                this.labelMesh.position.set(xOffset, height / 2 + eps, 0);
                this.labelMesh.rotation.set(-Math.PI / 2, 0, 0);
            } else {
                this.labelMesh.position.set(xOffset, 0, d / 2 + eps);
                this.labelMesh.rotation.set(0, 0, 0);
            }
            this.labelMesh.anchorX = align;
            this.labelMesh.textAlign = align;
            this.labelMesh.maxWidth = availW;
            this.labelMesh.fontSize = fontSize;
            this.labelMesh.lineHeight = lh;
            this.labelMesh.text = lines.join('\n');
            this.labelMesh.color = labelColor;
            this.labelMesh.sync();
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
        if (this.labelStopHandle) {
            this.labelStopHandle();
            this.labelStopHandle = undefined;
        }
        this.clearMesh();
        this.stage.unregisterConnection(this.connectionRegistrationId);
        this.registeredConnection = undefined;
        this.state.connection = null;
    }
}

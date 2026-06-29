import { Base } from '@/lib-components/nodes/Base.js';
import { Element3d, VxEventMap } from '@/lib-components/three/element3d.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { reactive } from 'vue';
import * as THREE from 'three';

declare type VxEventListener<T extends Event> = (event: T) => void;

type NodeEvents = {
    onClick?: VxEventListener<Event>;
    onDblclick?: VxEventListener<Event>;
    onPointerenter?: VxEventListener<Event>;
    onPointerleave?: VxEventListener<Event>;
}

/**
 * Named node in the ThreeJS tree hierarchy of Vuetrex renderer.
 * Supports event dispatch and provides the local layout hooks containers override.
 */
export abstract class Node extends Base {
    public element: Element3d;

    public readonly stage: VuetrexStage;
    public name: string = Math.floor(Math.random() * 100000).toString(32);
    protected subscribed: boolean = false;
    public readonly type: string = 'Node';

    public static readonly CLICK = 'click' as const;
    public static readonly DBLCLICK = 'dblclick' as const;
    public static readonly MOUSE_OVER = 'mouseOver' as const;
    public static readonly MOUSE_OUT = 'mouseOut' as const;

    protected state = reactive({
        text: ''
    });

    readonly clickListener: THREE.EventListener<VxEventMap['click'], 'click', THREE.Object3D<VxEventMap>> = (ev) => {
        this.dispatchClick(ev.originalEvent);
    };

    readonly dblclickListener: THREE.EventListener<VxEventMap['dblclick'], 'dblclick', THREE.Object3D<VxEventMap>> = (ev) => {
        this.dispatchDblclick(ev.originalEvent);
    };

    readonly mouseOverListener: THREE.EventListener<VxEventMap['mouseOver'], 'mouseOver', THREE.Object3D<VxEventMap>> = (ev) => {
        this.dispatchPointerenter(ev.originalEvent);
    };

    readonly mouseOutListener: THREE.EventListener<VxEventMap['mouseOut'], 'mouseOut', THREE.Object3D<VxEventMap>> = (ev) => {
        this.dispatchPointerleave(ev.originalEvent);
    };

    public _nodeEvents?: NodeEvents = undefined;

    protected constructor(stage: VuetrexStage) {
        super();
        this.element = new Element3d(stage, this);
        this.stage = stage;
    }

    isRenderableNode(): boolean { return true; }

    isLayer(): boolean { return false; }

    public get nodeEvents(): NodeEvents {
        if (!this._nodeEvents) {
            this._nodeEvents = {};
        }
        return this._nodeEvents;
    }

    getLayer(): Node | null {
        let result = this.parent.value as Node;
        while (result !== null && !result.isLayer()) {
            result = result.parent.value as Node;
        }
        return result;
    }

    nearestAncestorObject(): THREE.Object3D {
        let cur = this.parent.value as Node | null
        while (cur) {
            if ((cur as any).isGroupNode) return (cur as any).group
            cur = cur.parent.value as Node | null
        }
        return this.stage.getScene()
    }

    getScale(): number {
        let result = 1.0;
        let current: Base | null = this;

        while (current) {
            const scale = (current as any).state?.scale;
            if (typeof scale === 'number' && Number.isFinite(scale)) {
                result *= scale;
            }
            current = current.parent.value;
        }

        return result;
    }

    getElevation(): number {
        // let result = 0.0;
        // let current: Base | null = this;
        //
        // while (current) {
        //     const elevation = (current as any).state?.elevation;
        //     if (typeof elevation === 'number' && Number.isFinite(elevation)) {
        //         result += elevation;
        //     }
        //     current = current.parent.value;
        // }
        //
        // return result;
        return (this as any).state?.elevation ?? 0;
    }

    getCaption(): string {
        return this.state.text;
    }

    layoutPositionOf(child: Node): THREE.Vector3 {
        return new THREE.Vector3(0, child.getElevation(), 0);
    }

    allocatedSizeOf(_child: Node): THREE.Vector3 {
        return new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    }

    setName(name: string) {
        this.name = name;
    }

    set onClick(e: VxEventListener<Event> | undefined) {
        this.nodeEvents.onClick = e;
    }

    set onDblclick(e: VxEventListener<Event> | undefined) {
        this.nodeEvents.onDblclick = e;
    }

    set onPointerenter(e: VxEventListener<Event> | undefined) {
        this.nodeEvents.onPointerenter = e;
    }

    set onPointerleave(e: VxEventListener<Event> | undefined) {
        this.nodeEvents.onPointerleave = e;
    }

    dispatchClick(e: MouseEvent) {
        if (this.nodeEvents.onClick)
            this.nodeEvents.onClick(e);
        const pn = this.parent.value as Node;
        if (pn) pn.dispatchClick(e);
    }

    dispatchDblclick(e: MouseEvent) {
        if (this.nodeEvents.onDblclick)
            this.nodeEvents.onDblclick(e);
        const pn = this.parent.value as Node;
        if (pn) pn.dispatchDblclick(e);
    }

    // pointerenter/pointerleave do not bubble by design
    dispatchPointerenter(e: MouseEvent) {
        if (this.nodeEvents.onPointerenter)
            this.nodeEvents.onPointerenter(e);
    }

    dispatchPointerleave(e: MouseEvent) {
        if (this.nodeEvents.onPointerleave)
            this.nodeEvents.onPointerleave(e);
    }

    subscribeEvents() {
        if (!this.element.mesh || this.subscribed) return;

        this.element.mesh.addEventListener(Node.CLICK, this.clickListener);
        this.element.mesh.addEventListener(Node.DBLCLICK, this.dblclickListener);
        this.element.mesh.addEventListener(Node.MOUSE_OVER, this.mouseOverListener);
        this.element.mesh.addEventListener(Node.MOUSE_OUT, this.mouseOutListener);
        this.subscribed = true;
    }
}

/**
 * Do not proxify Nodes when using template refs.
 * See https://github.com/vuejs/vue-next/pull/1060
 */
(Node.prototype as any)["__v_skip"] = true;

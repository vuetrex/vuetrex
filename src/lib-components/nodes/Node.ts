import { Base } from '@/lib-components/nodes/Base.js';
import { Element3d, VxEventMap } from '@/lib-components/three/element3d.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { reactive, computed, ComputedRef } from 'vue';
import * as THREE from 'three';
import type { ConnectorPortDefinition } from '@/lib-components/connectors/types.js';

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
    private static keySequence = 0;
    private readonly generatedKey = `vx-node-${++Node.keySequence}`;
    private readonly identity = reactive({
        key: this.generatedKey,
        hasVNodeKey: false,
        explicitId: undefined as string | undefined,
        name: '',
    });
    private readonly behavior = reactive({
        visible: true,
        disabled: false,
        participatesInLayout: true,
    });
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

    /** Immutable renderer identity unless Vue supplied an explicit vnode key. */
    get key(): string { return this.identity.key; }

    /** Semantic identity used by focus, animation, diagnostics, and connections. */
    get id(): string {
        return this.identity.explicitId ?? this.generatedKey;
    }

    set id(value: string) { this.setId(value); }

    /** Human-readable name. Use `id` for machine references and `text` for captions. */
    get name(): string { return this.identity.name; }

    set name(value: string) { this.setName(value); }

    get visible(): boolean { return this.behavior.visible; }
    get disabled(): boolean { return this.behavior.disabled; }

    override participatesInLayout(): boolean {
        return this.behavior.participatesInLayout;
    }

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

    /** Override to expose semantic connector ports beyond the built-in bounds ports. */
    connectorPorts(): Readonly<Record<string, ConnectorPortDefinition>> {
        return {};
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

    public readonly measuredSize: ComputedRef<THREE.Vector3> = computed(() => this.intrinsicSize());

    protected intrinsicSize(): THREE.Vector3 {
        return new THREE.Vector3();
    }

    renderOffset(): THREE.Vector3 {
        return new THREE.Vector3();
    }

    layoutPositionOf(child: Node): THREE.Vector3 {
        return new THREE.Vector3(0, child.getElevation(), 0);
    }

    setRendererKey(key: string): void {
        const nextKey = String(key);
        if (!nextKey || (this.identity.hasVNodeKey && nextKey === this.identity.key)) return;
        this.identity.key = nextKey;
        this.identity.hasVNodeKey = true;
    }

    setId(id: unknown): void {
        const explicitId = id === undefined || id === null || id === '' ? undefined : String(id);
        const nextId = explicitId ?? this.generatedKey;
        this.stage.updateNodeRegistration?.(this, nextId, this.identity.name);
        this.identity.explicitId = explicitId;
        this.refreshObjectIdentity();
    }

    setName(name: unknown): void {
        const nextName = name === undefined || name === null ? '' : String(name);
        const nextId = this.identity.explicitId ?? this.generatedKey;
        this.stage.updateNodeRegistration?.(this, nextId, nextName);
        this.identity.name = nextName;
        this.refreshObjectIdentity();
    }

    private refreshObjectIdentity(): void {
        if (this.element.mesh) this.element.mesh.name = `el-${this.id}`;
        this.stage.reconcileConnections?.();
        this.stage.invalidateContentBounds?.();
    }

    protected effectiveVisibility(): boolean {
        return this.visible;
    }

    /** Apply common visibility and interaction state to a newly-created object. */
    applyObjectState(object: THREE.Object3D = this.element.mesh as THREE.Object3D): void {
        if (!object) return;
        object.visible = this.effectiveVisibility();
        object.userData.vxDisabled = this.disabled;
        object.traverse(child => {
            child.userData.vxDisabled = this.disabled;
        });
    }

    private setVisible(value: unknown): void {
        this.behavior.visible = value === undefined || value === null
            ? true
            : value === true || value === '' || value === 'true';
        if (this.element.mesh) this.applyObjectState(this.element.mesh);
        this.stage.updateNodeState?.(this);
        this.stage.reconcileConnections?.();
        this.stage.invalidateContentBounds?.();
    }

    private setDisabled(value: unknown): void {
        this.behavior.disabled = value === true || value === '' || value === 'true';
        if (this.element.mesh) this.applyObjectState(this.element.mesh);
    }

    private setLayoutParticipation(value: unknown): void {
        this.behavior.participatesInLayout = value === undefined || value === null
            ? true
            : value === true || value === '' || value === 'true';
        this.parent.value?.registerSync();
        this.stage.invalidateContentBounds?.();
    }

    override setStateValue(key: string, value: any): void {
        const normalized = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
            : key;
        if (normalized === 'id') { this.setId(value); return; }
        if (normalized === 'name') { this.setName(value); return; }
        if (normalized === 'visible') { this.setVisible(value); return; }
        if (normalized === 'disabled') { this.setDisabled(value); return; }
        if (normalized === 'participatesInLayout') { this.setLayoutParticipation(value); return; }
        super.setStateValue(key, value);
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
        if (!this.disabled && this.nodeEvents.onClick)
            this.nodeEvents.onClick(e);
        const pn = this.parent.value as Node;
        if (pn) pn.dispatchClick(e);
    }

    dispatchDblclick(e: MouseEvent) {
        if (!this.disabled && this.nodeEvents.onDblclick)
            this.nodeEvents.onDblclick(e);
        const pn = this.parent.value as Node;
        if (pn) pn.dispatchDblclick(e);
    }

    // pointerenter/pointerleave do not bubble by design
    dispatchPointerenter(e: MouseEvent) {
        if (!this.disabled && this.nodeEvents.onPointerenter)
            this.nodeEvents.onPointerenter(e);
    }

    dispatchPointerleave(e: MouseEvent) {
        if (!this.disabled && this.nodeEvents.onPointerleave)
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

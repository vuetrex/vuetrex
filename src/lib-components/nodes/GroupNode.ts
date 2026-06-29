import {Node} from '@/lib-components/nodes/Node.js';
import {gridLayout, LayoutFactory, LayoutFn} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Group, Vector3} from 'three';
import {markRaw, reactive, watchEffect, WatchStopHandle} from 'vue';

export interface GroupState {
    text: string
    size: Vector3
    height: number
}

export class GroupNode extends Node {
    readonly group = new Group()
    readonly isGroupNode = true
    declare protected state: GroupState;

    private stopHandle?: WatchStopHandle
    private layoutFn: LayoutFn = (child) => new Vector3(0, child.getElevation(), 0)
    protected readonly layoutFactory: LayoutFactory

    constructor(stage: VuetrexStage, layoutFactory: LayoutFactory = gridLayout, stateDefaults: Partial<GroupState & Record<string, any>> = {}) {
        super(stage)
        this.layoutFactory = layoutFactory
        const defaultSize = this.defaultSize()
        const defaultHeight = defaultSize.y
        const initialHeight = typeof stateDefaults.height === 'number' ? stateDefaults.height : defaultHeight
        this.state = reactive({
            text: '',
            ...stateDefaults,
            size: markRaw(this.normalizeSizeValue(stateDefaults.size ?? defaultSize, initialHeight)),
            height: initialHeight,
        }) as GroupState
        this.layoutFn = this.layoutFactory(new Vector3(0, 0, 0), this.layoutSize())
        this.element.mesh = this.group as any   // satisfies `Element3d.mesh` type, TODO rethink the strategy here
    }

    protected defaultSize(): Vector3 {
        return new Vector3(this.stage.boxDistance * 2, this.stage.boxRadius * 2, this.stage.boxDistance * 2)
    }

    protected normalizeSizeValue(value: unknown, height = this.state?.height ?? this.defaultSize().y): Vector3 {
        if (value instanceof Vector3) {
            return value.clone()
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return new Vector3(value, height, value)
        }

        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value)
            if (Number.isFinite(parsed)) {
                return new Vector3(parsed, height, parsed)
            }
        }

        if (value && typeof value === 'object') {
            const maybeVector = value as {x?: unknown, y?: unknown, z?: unknown}
            const x = typeof maybeVector.x === 'number' ? maybeVector.x : 0
            const y = typeof maybeVector.y === 'number' ? maybeVector.y : height
            const z = typeof maybeVector.z === 'number' ? maybeVector.z : x
            return new Vector3(x, y, z)
        }

        return this.defaultSize()
    }

    protected layoutSize(): Vector3 {
        const size = this.state.size.clone()
        size.y = this.state.height
        return size
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'size') {
            this.state.size = markRaw(this.normalizeSizeValue(value))
            return
        }

        if (key === 'height') {
            const height = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(height)) {
                this.state.height = height
            }
            return
        }

        super.setStateValue(key, value)
    }

    protected getIntrinsicScale(): number {
        return 1.0
    }

    protected requestedBounds(): Vector3 {
        const size = this.layoutSize()
        return new Vector3(size.x, this.state.height, size.z)
    }

    private fitScale(): number {
        const parent = this.parent.value as Node | null
        if (!parent) return 1.0

        const declaredScale = this.getIntrinsicScale()
        const desired = this.requestedBounds().multiplyScalar(declaredScale)
        const allocated = parent.allocatedSizeOf(this)
        const ratios = [allocated.x / desired.x, allocated.y / desired.y, allocated.z / desired.z]
            .filter(ratio => Number.isFinite(ratio) && ratio > 0)

        return ratios.length === 0 ? 1.0 : Math.min(1.0, ...ratios)
    }

    syncWithThree() {
        if (this.stopHandle) return

        this.stopHandle = watchEffect(() => {
            const size = this.layoutSize()
            const pos = this.element.getPosition()
            const parentObj = this.nearestAncestorObject()

            this.layoutFn = this.layoutFactory(new Vector3(0, 0, 0), size)
            if (this.group.parent !== parentObj) {
                parentObj.add(this.group)
            }

            this.group.name = `el-${this.name}`
            this.group.userData.el = this.element
            this.group.position.copy(pos)
            this.group.scale.setScalar(this.getIntrinsicScale() * this.fitScale())
            this.stage.connectors.update(this.element)
        })
    }

    layoutPositionOf(child: Node): Vector3 {
        const layout = this.stopHandle ? this.layoutFn : this.layoutFactory(new Vector3(0, 0, 0), this.layoutSize())
        return layout(child, this.elements.value as Node[], this.stage)
    }

    allocatedSizeOf(child: Node): Vector3 {
        return this.layoutFactory.slotSizeOf?.(this.layoutSize(), child, this.elements.value as Node[], this.stage)
            ?? this.layoutSize()
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.group.removeFromParent()
    }
}

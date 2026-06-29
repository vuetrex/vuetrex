import {Node} from '@/lib-components/nodes/Node.js';
import {gridLayout, Layout} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Group, Vector3} from 'three';
import {markRaw, reactive, watchEffect, WatchStopHandle} from 'vue';

export interface GroupState {
    text: string
    size: Vector3
    height: number
    gap?: number
}

export class GroupNode extends Node {
    readonly group = new Group()
    readonly isGroupNode = true
    declare protected state: GroupState;

    private stopHandle?: WatchStopHandle
    protected readonly layout: Layout

    private sizeOverridden = false
    private heightOverridden = false

    constructor(stage: VuetrexStage, layout: Layout = gridLayout, stateDefaults: Partial<GroupState & Record<string, any>> = {}) {
        super(stage)
        this.layout = layout
        this.state = reactive({
            text: '',
            ...stateDefaults,
            size: markRaw(new Vector3()),
            height: 0,
        }) as GroupState
        this.element.mesh = this.group as any   // satisfies `Element3d.mesh` type
    }

    protected gap(): number {
        if (typeof this.state.gap === 'number') return this.state.gap
        const g = (this.stage as any).gap
        return typeof g === 'number' ? g : this.stage.boxDistance
    }

    protected childFootprints(): Vector3[] {
        return (this.elements.value as Node[]).map(c => c.measuredSize.value)
    }

    protected contentSize(): Vector3 {
        return this.layout.measure(this.childFootprints(), this.gap())
    }

    protected override intrinsicSize(): Vector3 {
        const size = this.contentSize()
        if (this.sizeOverridden) { size.x = this.state.size.x; size.z = this.state.size.z }
        if (this.heightOverridden) { size.y = this.state.height }
        return size
    }

    protected getIntrinsicScale(): number {
        return 1.0
    }

    private fitScale(): number {
        if (!this.sizeOverridden && !this.heightOverridden) return 1.0
        const content = this.contentSize()
        const declared = this.intrinsicSize()
        const ratios = [declared.x / content.x, declared.y / content.y, declared.z / content.z]
            .filter(ratio => Number.isFinite(ratio) && ratio > 0)
        return ratios.length === 0 ? 1.0 : Math.min(1.0, ...ratios)
    }

    private parseSize(value: unknown): Vector3 {
        if (value instanceof Vector3) return value.clone()
        const n = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isFinite(n)) return new Vector3(n, this.state.height, n)
        if (value && typeof value === 'object') {
            const v = value as {x?: number, y?: number, z?: number}
            const x = typeof v.x === 'number' ? v.x : 0
            return new Vector3(x, typeof v.y === 'number' ? v.y : this.state.height, typeof v.z === 'number' ? v.z : x)
        }
        return new Vector3()
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'size') {
            this.state.size = markRaw(this.parseSize(value))
            this.sizeOverridden = true
            return
        }
        if (key === 'height') {
            const height = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(height)) { this.state.height = height; this.heightOverridden = true }
            return
        }
        if (key === 'gap') {
            const gap = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(gap)) this.state.gap = gap
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree() {
        if (this.stopHandle) return

        this.stopHandle = watchEffect(() => {
            const pos = this.element.getPosition()
            const parentObj = this.nearestAncestorObject()

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
        const siblings = this.elements.value as Node[]
        const idx = siblings.indexOf(child)
        const pos = this.layout.place(idx < 0 ? 0 : idx, this.childFootprints(), this.gap())
        pos.y += child.getElevation()
        return pos
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.group.removeFromParent()
    }
}

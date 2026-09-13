import {Node} from '@/lib-components/nodes/Node.js';
import {
    depthLayout,
    gridLayout,
    horizontalLayout,
    Layout,
    layoutWithDirection,
    ringLayout,
    stackLayout,
} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Group, Vector3} from 'three';
import {markRaw, reactive, watchEffect, WatchStopHandle} from 'vue';
import type {Placement} from '@/lib-components/composition/index.js';

export type Alignment = 'start' | 'center' | 'end'
export type LayoutName = 'grid' | 'row' | 'depth' | 'stack' | 'ring'
export type FitMode = 'shrink' | 'none'

export interface GroupState {
    text: string
    size: Vector3
    height: number
    gap?: number
    alignX: Alignment
    alignY: Alignment
    alignZ: Alignment
    layout?: LayoutName
    startAngle: number
    direction: 'normal' | 'reverse'
    fit: FitMode
    placement?: Placement
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
            alignX: 'center',
            alignY: 'center',
            alignZ: 'center',
            startAngle: 0,
            direction: 'normal',
            fit: 'shrink',
            placement: undefined,
            ...stateDefaults,
            size: markRaw(new Vector3()),
            height: 0,
        }) as GroupState
        this.element.mesh = this.group as any   // satisfies `Element3d.mesh` type
    }

    protected defaultGap(): number {
        const g = (this.stage as any).gap
        return typeof g === 'number' ? g : this.stage.boxDistance
    }

    protected gap(): number {
        return typeof this.state.gap === 'number' ? this.state.gap : this.defaultGap()
    }

    protected childFootprints(): Vector3[] {
        return (this.elements.value as Node[]).map(c => c.measuredSize.value)
    }

    protected currentLayout(): Layout {
        if (this.state.layout === 'ring') {
            return ringLayout.withOptions({
                startAngle: this.state.startAngle,
                direction: this.state.direction,
            })
        }

        let layout = this.layout
        if (this.state.layout === 'row') layout = horizontalLayout
        if (this.state.layout === 'depth') layout = depthLayout
        if (this.state.layout === 'stack') layout = stackLayout
        if (this.state.layout === 'grid') layout = gridLayout
        const supportsDirection = layout === horizontalLayout || layout === depthLayout || layout === stackLayout
        return supportsDirection ? layoutWithDirection(layout, this.state.direction) : layout
    }

    protected contentSize(): Vector3 {
        return this.currentLayout().measure(this.childFootprints(), this.gap())
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

    override participatesInLayout(): boolean {
        // A recipe placement owns this subtree's parent-space position.
        return this.state.placement ? false : super.participatesInLayout()
    }

    protected override effectiveVisibility(): boolean {
        return this.visible && this.state.placement?.visibility !== false
    }

    private fitScale(): number {
        if (this.state.fit === 'none') return 1.0
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
        if (key === 'placement') {
            this.state.placement = value && typeof value === 'object'
                ? markRaw(value as Placement)
                : undefined
            return
        }
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
        if (key === 'align') {
            if (this.isAlignment(value)) {
                this.state.alignX = value
                this.state.alignY = value
                this.state.alignZ = value
            }
            return
        }
        if (key === 'layout') {
            if (value === 'grid' || value === 'row' || value === 'depth' || value === 'stack' || value === 'ring') {
                this.state.layout = value
            }
            return
        }
        if (key === 'startAngle' || key === 'start-angle') {
            const startAngle = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(startAngle)) this.state.startAngle = startAngle
            return
        }
        if (key === 'direction') {
            if (value === 'normal' || value === 'reverse') this.state.direction = value
            return
        }
        if (key === 'fit') {
            if (value === 'shrink' || value === 'none') this.state.fit = value
            return
        }
        const alignKey = {
            'align-x': 'alignX',
            alignX: 'alignX',
            'align-y': 'alignY',
            alignY: 'alignY',
            'align-z': 'alignZ',
            alignZ: 'alignZ',
        }[key] as 'alignX' | 'alignY' | 'alignZ' | undefined
        if (alignKey) {
            if (this.isAlignment(value)) this.state[alignKey] = value
            return
        }
        super.setStateValue(key, value)
    }

    private isAlignment(value: unknown): value is Alignment {
        return value === 'start' || value === 'center' || value === 'end'
    }

    private alignmentShift(alignment: Alignment, extent: number): number {
        if (alignment === 'start') return -extent / 2
        if (alignment === 'end') return extent / 2
        return 0
    }

    syncWithThree() {
        if (this.stopHandle) return

        this.stopHandle = watchEffect(() => {
            const pos = this.element.getPosition()
            const parentObj = this.nearestAncestorObject()

            if (this.group.parent !== parentObj) {
                parentObj.add(this.group)
            }

            this.group.name = `el-${this.id}`
            this.group.userData.el = this.element
            const placement = this.state.placement
            const intrinsicScale = this.getIntrinsicScale() * this.fitScale()
            if (placement) {
                this.group.position.copy(pos).add(placement.position)
                this.group.quaternion.copy(placement.orientation)
                this.group.scale.copy(placement.scale).multiplyScalar(intrinsicScale)
                this.group.visible = this.effectiveVisibility()
            } else {
                this.group.position.copy(pos)
                this.group.quaternion.identity()
                this.group.scale.setScalar(intrinsicScale)
                this.group.visible = this.effectiveVisibility()
            }
            this.applyObjectState(this.group)
            this.stage.connectors.update(this.element)
            this.stage.invalidateContentBounds?.()
        })
    }

    layoutPositionOf(child: Node): Vector3 {
        if (!child.participatesInLayout()) return super.layoutPositionOf(child)
        const siblings = this.elements.value as Node[]
        const idx = siblings.indexOf(child)
        const footprints = this.childFootprints()
        const childIndex = idx < 0 ? 0 : idx
        const footprint = footprints[childIndex] ?? new Vector3()
        const pos = this.currentLayout().place(childIndex, footprints, this.gap())
        pos.add(new Vector3(
            this.alignmentShift(this.state.alignX, footprint.x),
            this.alignmentShift(this.state.alignY, footprint.y),
            this.alignmentShift(this.state.alignZ, footprint.z),
        ))
        pos.y += child.getElevation()
        return pos
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.group.removeFromParent()
        this.stage.invalidateContentBounds?.()
    }
}

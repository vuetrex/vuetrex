import { GroupNode, GroupState } from '@/lib-components/nodes/GroupNode.js';
import { Layout, ringLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { Node } from '@/lib-components/nodes/Node.js';
import { computed, ComputedRef } from 'vue';
import { Vector3 } from 'three';

interface RingState extends GroupState {
    startAngle: number
    direction: 'normal' | 'reverse'
    gapRatio?: number
    radius?: number
}

export class Ring extends GroupNode {
    public readonly type: string = 'Ring';
    declare protected state: RingState;
    private readonly configuredLayout: ComputedRef<Layout>

    constructor(stage: VuetrexStage) {
        super(stage, ringLayout, {
            startAngle: 0,
            direction: 'normal',
            gapRatio: undefined,
            radius: undefined,
        });
        this.configuredLayout = computed(() => ringLayout.withOptions({
            startAngle: this.state.startAngle,
            direction: this.state.direction,
        }))
    }

    protected override currentLayout(): Layout {
        return this.configuredLayout?.value ?? ringLayout
    }

    protected override gap(): number {
        // gapRatio is an angular mode: it removes part of each segment slot
        // without pushing child origins outward. The ordinary world-unit gap
        // remains available whenever gapRatio is not set.
        return typeof this.state.gapRatio === 'number' ? 0 : super.gap()
    }

    protected override contentSize(): Vector3 {
        if (typeof this.state.radius !== 'number') return super.contentSize()
        const height = Math.max(0, ...this.childFootprints().map(footprint => footprint.y))
        return new Vector3(this.state.radius * 2, height, this.state.radius * 2)
    }

    override layoutPositionOf(child: Node): Vector3 {
        const defaultPosition = super.layoutPositionOf(child)
        if (!child.participatesInLayout()) return defaultPosition
        if (typeof this.state.radius !== 'number') return defaultPosition

        const siblings = this.elements.value
        const index = Math.max(0, siblings.indexOf(child))
        const count = Math.max(1, siblings.length)
        const placementRadius = typeof (child as any).getRingPlacementRadius === 'function'
            ? (child as any).getRingPlacementRadius(this.state.radius, count, this.state.gapRatio)
            : this.state.radius
        const direction = this.state.direction === 'reverse' ? -1 : 1
        const angle = this.state.startAngle * Math.PI / 180 + direction * index * Math.PI * 2 / count
        return new Vector3(
            placementRadius * Math.sin(angle),
            defaultPosition.y,
            placementRadius * Math.cos(angle),
        )
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'startAngle' || key === 'start-angle') {
            const startAngle = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(startAngle)) this.state.startAngle = startAngle
            return
        }
        if (key === 'direction') {
            if (value === 'normal' || value === 'reverse') this.state.direction = value
            return
        }
        if (key === 'gapRatio' || key === 'gap-ratio') {
            if (value == null) {
                this.state.gapRatio = undefined
                return
            }
            const gapRatio = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(gapRatio) && gapRatio >= 0 && gapRatio < 1) {
                this.state.gapRatio = gapRatio
            }
            return
        }
        if (key === 'radius') {
            if (value == null) {
                this.state.radius = undefined
                return
            }
            const radius = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(radius) && radius > 0) this.state.radius = radius
            return
        }
        super.setStateValue(key, value)
    }
}

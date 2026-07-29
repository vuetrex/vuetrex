import { GroupNode, GroupState } from '@/lib-components/nodes/GroupNode.js';
import { Layout, ringLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import { computed, ComputedRef } from 'vue';

interface RingState extends GroupState {
    startAngle: number
    direction: 'normal' | 'reverse'
}

export class Ring extends GroupNode {
    public readonly type: string = 'Ring';
    declare protected state: RingState;
    private readonly configuredLayout: ComputedRef<Layout>

    constructor(stage: VuetrexStage) {
        super(stage, ringLayout, {
            startAngle: 0,
            direction: 'normal',
        });
        this.configuredLayout = computed(() => ringLayout.withOptions({
            startAngle: this.state.startAngle,
            direction: this.state.direction,
        }))
    }

    protected override currentLayout(): Layout {
        return this.configuredLayout?.value ?? ringLayout
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
        super.setStateValue(key, value)
    }
}

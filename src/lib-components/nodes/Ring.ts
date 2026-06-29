import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { ringLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import {Vector3} from 'three';

export class Ring extends GroupNode {

    public readonly type: string = 'Ring';

    constructor(stage: VuetrexStage) {
        super(stage, ringLayout);
    }

    protected override defaultSize(): Vector3 {
        return new Vector3(this.stage.boxDistance * 4, this.stage.boxRadius * 4, this.stage.boxDistance * 4)
    }

    protected override normalizeSizeValue(value: unknown, height = this.state?.height ?? this.defaultSize().y): Vector3 {
        if (typeof value === 'number' && Number.isFinite(value)) {
            const radius = this.stage.boxDistance * value
            return new Vector3(radius * 2, height, radius * 2)
        }

        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value)
            if (Number.isFinite(parsed)) {
                const radius = this.stage.boxDistance * parsed
                return new Vector3(radius * 2, height, radius * 2)
            }
        }

        return super.normalizeSizeValue(value, height)
    }
}

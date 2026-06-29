import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { horizontalLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import {Vector3} from 'three';

export class Row extends GroupNode {

    public readonly type: string = 'Row';

    constructor(stage: VuetrexStage) {
        super(stage, horizontalLayout);
    }

    protected override defaultSize(): Vector3 {
        return new Vector3(this.stage.boxDistance * 10, this.stage.boxRadius * 2, this.stage.boxDistance * 2)
    }
}

import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { stackLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import {Vector3} from 'three';

export class Stack extends GroupNode {

    public readonly type: string = 'Stack';

    constructor(stage: VuetrexStage) {
        super(stage, stackLayout);
    }

    protected override defaultSize(): Vector3 {
        return new Vector3(this.stage.boxDistance * 2, this.stage.boxRadius * 2, this.stage.boxDistance * 2)
    }
}

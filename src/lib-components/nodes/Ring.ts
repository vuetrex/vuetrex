import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { ringLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Ring extends GroupNode {
    public readonly type: string = 'Ring';

    constructor(stage: VuetrexStage) {
        super(stage, ringLayout);
    }
}

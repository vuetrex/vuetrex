import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { horizontalLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Row extends GroupNode {
    public readonly type: string = 'Row';

    constructor(stage: VuetrexStage) {
        super(stage, horizontalLayout);
    }
}

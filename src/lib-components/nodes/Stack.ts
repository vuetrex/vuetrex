import { GroupNode } from '@/lib-components/nodes/GroupNode.js';
import { stackLayout } from '@/lib-components/nodes/layouts.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';

export class Stack extends GroupNode {
    public readonly type: string = 'Stack';

    constructor(stage: VuetrexStage) {
        super(stage, stackLayout);
    }

    // Stacked boxes rest on one another; they must not inherit the planar
    // spacing gap used by rows/grids/rings. A thin seam keeps them distinct.
    protected override defaultGap(): number {
        return 0.05;
    }
}

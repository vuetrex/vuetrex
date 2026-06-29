import {GroupNode, GroupState} from '@/lib-components/nodes/GroupNode.js';
import {depthLayout} from '@/lib-components/nodes/layouts.js';
import {VuetrexStage} from '@/lib-components/three/stage.js';
import {Vector3} from 'three';

interface LayerState extends GroupState {
    scale: number
    elevation: number
}

/**
 * Layer class
 */
export class Layer extends GroupNode {

    public readonly type: string = 'Layer'
    declare protected state: LayerState;

    isLayer(): boolean { return true; }

    constructor(stage: VuetrexStage) {
        super(stage, depthLayout, {
            scale: 1.0,
            elevation: 0.0,
        })
    }

    protected override defaultSize(): Vector3 {
        return new Vector3(10, 5, 10)
    }

    protected override getIntrinsicScale(): number {
        return this.state.scale
    }
}

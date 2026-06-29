import * as THREE from 'three';
import { VuetrexStage } from './stage.js';
import { Node } from '@/lib-components/nodes/Node.js';

export type VxEventMap = THREE.Object3DEventMap & {
    click: { originalEvent: MouseEvent };
    dblclick: { originalEvent: MouseEvent };
    mouseOver: { originalEvent: MouseEvent };
    mouseOut: { originalEvent: MouseEvent };
};

/**
 * Represents a 3D element within a scene. This class holds references to its stage,
 * associated node, and optional 3D mesh and position. It provides methods to interact
 * with and retrieve information about the underlying node and its stage.
 */
export class Element3d {

    private readonly stage: VuetrexStage;
    public node: Node;
    public mesh: THREE.Object3D<VxEventMap> | null = null;
    public pos: THREE.Vector3 | null = null;

    constructor(stage: VuetrexStage, node: Node) {
        this.stage = stage;
        this.node = node;
    }

    getCaption(): string {
        return this.node.getCaption();
    }

    getStage(): VuetrexStage {
        return this.stage;
    }

    getPosition(): THREE.Vector3 {
        const parent = this.node.parent.value as Node | null;
        if (!parent) return new THREE.Vector3();
        return parent.layoutPositionOf(this.node).add(this.node.renderOffset());
    }

    getWorldPosition(): THREE.Vector3 {
        if (!this.mesh) return new THREE.Vector3();
        const worldPos = new THREE.Vector3();
        this.mesh.getWorldPosition(worldPos);
        return worldPos;
    }
}

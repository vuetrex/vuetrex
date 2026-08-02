import { MeshNode } from '@/lib-components/nodes/MeshNode.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import * as THREE from 'three';
import * as THREEx from '@/lib-components/three/three.imports.js';

export class Box extends MeshNode {

    readonly material: THREE.MeshStandardMaterial;

    constructor(stage: VuetrexStage) {
        super(stage);
        this.material = stage.createElementMaterial();
    }

    modelGen(): (height: number, size: number) => THREE.Mesh {
        // Depth defaults to size (square footprint). Any positive `depth` state
        // yields a non-square footprint: x = size, z = depth.
        const depthState = this.state.depth
        return (height, size) => {
            const scale = this.getScale()
            const w = size * scale
            const d = (depthState > 0 ? depthState : size) * scale
            const bGeometry = new THREEx.RoundedBoxGeometry(w, height, d, 5, 0.05);
            const mesh = new THREE.Mesh(bGeometry, this.material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };
    }
}

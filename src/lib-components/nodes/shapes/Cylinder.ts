import { MeshNode } from '@/lib-components/nodes/MeshNode.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import * as THREE from 'three';

export class Cylinder extends MeshNode {

    constructor(stage: VuetrexStage) {
        super(stage, { height: 0.33 });
    }

    private beveledCylinder(height: number, size: number): THREE.BufferGeometry {
        const width = size / 2.5 || 1.0;
        // ExtrudeGeometry adds bevelThickness beyond both ends of `depth`.
        // Keep the bevel inside the requested height so the final geometry,
        // including its bevels, has exactly the declared vertical extent.
        const safeHeight = Math.max(Number.EPSILON, height);
        const bevelThickness = Math.min(0.05, safeHeight / 4);
        const extrusionDepth = Math.max(Number.EPSILON, safeHeight - bevelThickness * 2);
        const shape = new THREE.Shape();
        shape.moveTo(width, 0);
        shape.absarc(0, 0, width, 0, Math.PI / 2, false);
        shape.absarc(0, 0, width, Math.PI / 2, Math.PI, false);
        shape.absarc(0, 0, width, Math.PI, Math.PI * 3 / 2, false);
        shape.absarc(0, 0, width, Math.PI * 3 / 2, Math.PI * 1.999, false);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, {
            steps: 1,
            depth: extrusionDepth,
            bevelEnabled: true,
            bevelThickness,
            bevelSize: 0.07,
            bevelOffset: 0,
            bevelSegments: 5
        });
    }

    modelGen(): (height: number, size: number) => THREE.Mesh {
        return (height, size) => {
            const geometry = this.beveledCylinder(height, size);
            geometry.rotateX(Math.PI / 2);
            // MeshNode positions shapes from their base using height / 2, so
            // the local geometry must be centred around the mesh origin.
            geometry.center();
            return new THREE.Mesh(geometry, this.material);
        };
    }
}

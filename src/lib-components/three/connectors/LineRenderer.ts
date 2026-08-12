import { VuetrexStage } from '@/lib-components/three/stage.js';
import { Segment } from '@/lib-components/three/connectors/path.js';
import { ConnectorRenderer } from '@/lib-components/three/connectors/types.js';
import * as THREE from 'three';

const BASE_LINE_THICKNESS = 0.012;

/**
 * World-space line renderer. Box segments keep thickness proportional to the
 * enclosing diagram group, unlike WebGL LineBasicMaterial's fixed pixel width.
 * Moving the camera closer to a downscaled scene therefore restores the same
 * apparent thickness as its larger equivalent.
 */
export class LineRenderer implements ConnectorRenderer {
    private group = new THREE.Group();
    private material = new THREE.MeshBasicMaterial({ color: 0xa0ffff });
    private signature = ''

    constructor(private stage: VuetrexStage) {
        this.stage.scene.add(this.group);
    }

    private clearGeometry(): void {
        for (const child of this.group.children) {
            const mesh = child as THREE.Mesh
            mesh.geometry?.dispose()
        }
        this.group.clear()
    }

    update(segments: Segment[], _timer: number, _tick: number): void {
        const signature = segments.map(segment => [
            segment.connectionId,
            segment.startX,
            segment.startZ,
            segment.endX,
            segment.endZ,
            segment.scale,
            segment.elevation,
        ].join(':')).join('|')
        if (signature === this.signature) return
        this.signature = signature
        this.clearGeometry()

        for (const segment of segments) {
            const dx = segment.endX - segment.startX
            const dz = segment.endZ - segment.startZ
            const length = Math.hypot(dx, dz)
            if (length === 0) continue
            const scale = segment.scale > 0 && Number.isFinite(segment.scale) ? segment.scale : 1
            const thickness = BASE_LINE_THICKNESS * scale
            const geometry = new THREE.BoxGeometry(length, thickness, thickness)
            const mesh = new THREE.Mesh(geometry, this.material)
            mesh.position.set(
                (segment.startX + segment.endX) / 2,
                segment.elevation,
                (segment.startZ + segment.endZ) / 2,
            )
            mesh.rotation.y = -Math.atan2(dz, dx)
            this.group.add(mesh)
        }
    }

    dispose(): void {
        this.clearGeometry()
        this.stage.scene.remove(this.group)
        this.material.dispose()
    }
}

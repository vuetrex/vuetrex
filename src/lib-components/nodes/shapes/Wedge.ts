import { MeshNode, MeshState } from '@/lib-components/nodes/MeshNode.js';
import { Node } from '@/lib-components/nodes/Node.js';
import { VuetrexStage } from '@/lib-components/three/stage.js';
import * as THREE from 'three';

interface WedgeState extends MeshState {
    thickness?: number;
}

interface ExplicitArcProfile {
    innerRadius: number;
    outerHalfAngle: number;
    innerHalfAngle: number;
    placementRadius: number;
    gapWidth: number;
    bevelSize: number;
}

export class Wedge extends MeshNode {

    readonly material: THREE.MeshStandardMaterial;
    declare protected state: WedgeState;

    constructor(stage: VuetrexStage) {
        super(stage, { height: 0.33, thickness: undefined } as Partial<WedgeState>);
        this.material = stage.createElementMaterial();
    }

    private cylindricalSleeveSegment(height: number, size: number, segmentCount: number,
                                     gap: number, gapRatio?: number, outerRadiusOverride?: number,
                                     thicknessOverride?: number): THREE.BufferGeometry {
        const count = Math.max(1, segmentCount);
        const slotAngle = Math.PI * 2 / count;
        const theta = gapRatio === undefined
            ? slotAngle - Math.PI / 12
            : slotAngle * (1 - gapRatio);
        const requestedThickness = thicknessOverride ?? size * 0.05;
        const explicitProfile = outerRadiusOverride === undefined
            ? undefined
            : this.getExplicitArcProfile(outerRadiusOverride, requestedThickness, count, gapRatio);

        // Without an explicit outer radius, Ring lays sibling origins on a
        // circle whose adjacent chord is `size + gap`. With an explicit radius,
        // that value directly defines the outer arc. In both modes the sibling
        // origin is the segment's bounding-box midpoint, keeping animations
        // centred while the curvature centre remains the parent ring centre.
        const ringRadius = outerRadiusOverride === undefined
            ? (count > 1 ? (size + gap) / (2 * Math.sin(Math.PI / count)) : 0)
            : explicitProfile!.placementRadius;
        const radialThickness = outerRadiusOverride === undefined
            ? (count > 1 ? Math.min(requestedThickness, ringRadius * 2) : requestedThickness)
            : outerRadiusOverride - explicitProfile!.innerRadius;
        const innerRadius = outerRadiusOverride === undefined
            ? (count > 1
                ? (2 * ringRadius - radialThickness) / (1 + Math.cos(theta / 2))
                : Math.max(0, size * 0.60 - radialThickness))
            : explicitProfile!.innerRadius;
        const outerRadius = outerRadiusOverride ?? (count > 1
            ? innerRadius + radialThickness
            : size * 0.60);
        const outerHalfAngle = explicitProfile?.outerHalfAngle ?? theta / 2;
        const innerHalfAngle = explicitProfile?.innerHalfAngle ?? theta / 2;

        const shape = new THREE.Shape();
        shape.absarc(0, 0, outerRadius, -outerHalfAngle, outerHalfAngle, false);
        shape.lineTo(innerRadius * Math.cos(innerHalfAngle), innerRadius * Math.sin(innerHalfAngle));
        shape.absarc(0, 0, innerRadius, innerHalfAngle, -innerHalfAngle, true);
        shape.closePath();
        const bevelSize = explicitProfile?.bevelSize ?? 0.05;
        const geometry =  new THREE.ExtrudeGeometry(shape, {
            steps: 1,
            depth: height,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize,
            bevelOffset: 0,
            bevelSegments: 5
        });

        geometry.translate(0, 0, -height / 2);
        geometry.rotateX(Math.PI / 2);
        geometry.rotateY(-Math.PI / 2);
        geometry.translate(0, 0, -ringRadius);
        const scale = this.getScale()
        geometry.scale(scale, scale, scale);
        return geometry;
    }

    public getRingPlacementRadius(outerRadius: number, segmentCount: number,
                                  gapRatio?: number, thickness = this.getThickness()): number {
        return this.getExplicitArcProfile(outerRadius, thickness, segmentCount, gapRatio).placementRadius
    }

    private getExplicitArcProfile(outerRadius: number, thickness: number, segmentCount: number,
                                  gapRatio?: number): ExplicitArcProfile {
        const count = Math.max(1, segmentCount)
        const slotAngle = Math.PI * 2 / count
        const innerRadius = Math.max(0, outerRadius - Math.min(thickness, outerRadius))
        if (count === 1) {
            const halfAngle = gapRatio === undefined
                ? (slotAngle - Math.PI / 12) / 2
                : slotAngle * (1 - gapRatio) / 2
            return {
                innerRadius,
                outerHalfAngle: halfAngle,
                innerHalfAngle: halfAngle,
                placementRadius: 0,
                gapWidth: 0,
                bevelSize: Math.min(0.05, thickness * 0.45),
            }
        }

        if (gapRatio === undefined || gapRatio === 0) {
            const halfAngle = (gapRatio === 0 ? slotAngle : slotAngle - Math.PI / 12) / 2
            return {
                innerRadius,
                outerHalfAngle: halfAngle,
                innerHalfAngle: halfAngle,
                placementRadius: (innerRadius * Math.cos(halfAngle) + outerRadius) / 2,
                gapWidth: 0,
                bevelSize: Math.min(0.05, thickness * 0.45),
            }
        }

        const slotHalfAngle = slotAngle / 2
        const requestedGapWidth = gapRatio * 2 * outerRadius * Math.sin(slotHalfAngle)
        const maximumGapWidth = 2 * innerRadius * Math.sin(slotHalfAngle)
        const gapWidth = Math.min(requestedGapWidth, maximumGapWidth * (1 - 1e-6))
        // ExtrudeGeometry expands each side wall outward by bevelSize. Cut the
        // unbevelled shape slightly wider so the narrowest visible separator,
        // after both bevels, still equals the requested gap. Keeping the bevel
        // to 10% of the gap avoids a visibly oversized opening on the top face.
        const bevelSize = Math.min(
            0.05,
            thickness * 0.45,
            gapWidth * 0.10,
            Math.max(0, maximumGapWidth - gapWidth) * 0.45,
        )
        const shapeGapWidth = gapWidth + bevelSize * 2
        const outerInsetAngle = Math.asin(shapeGapWidth / (2 * outerRadius))
        const innerInsetAngle = innerRadius > 0 ? Math.asin(shapeGapWidth / (2 * innerRadius)) : slotHalfAngle
        const outerHalfAngle = slotHalfAngle - outerInsetAngle
        const innerHalfAngle = slotHalfAngle - innerInsetAngle
        // Equal tangential insets at both radii make the connecting side wall
        // parallel to the radial normal through the centre of the gap.
        return {
            innerRadius,
            outerHalfAngle,
            innerHalfAngle,
            placementRadius: (innerRadius * Math.cos(innerHalfAngle) + outerRadius) / 2,
            gapWidth,
            bevelSize,
        }
    }

    private getThickness(): number {
        return this.state.thickness ?? this.state.size * 0.05
    }

    override setStateValue(key: string, value: any): void {
        if (key === 'thickness') {
            if (value == null) {
                this.state.thickness = undefined
                return
            }
            const thickness = typeof value === 'number' ? value : Number.parseFloat(value)
            if (Number.isFinite(thickness) && thickness > 0) this.state.thickness = thickness
            return
        }
        super.setStateValue(key, value)
    }

    modelGen(): (height: number, size: number) => THREE.Mesh {
        const { myIdx: i, siblingCount: N } = this.layoutContext.value;
        // Orient the wedge so its concave side faces the parent ring's centre.
        // We derive the angle directly from the parent's ring options
        // (`startAngle`, `direction`) rather than reading the parent's laid-out
        // position — the latter would pull every sibling's `measuredSize` into
        // this geometry watchEffect, which then also rebuilds the mesh, causing
        // Vue's "Maximum recursive updates" loop. Falls back to the naive
        // `i * 2π/N` when the wedge is not inside a ring-shaped parent.
        const parent = this.parent.value as Node | null;
        const ringState = (parent as any)?.state as {
            startAngle?: number,
            direction?: 'normal' | 'reverse',
            gap?: number,
            gapRatio?: number,
            radius?: number,
        } | undefined;
        const startAngle = typeof ringState?.startAngle === 'number' ? ringState.startAngle : 0;
        const direction = ringState?.direction === 'reverse' ? -1 : 1;
        const defaultGap = typeof (this.stage as any).gap === 'number'
            ? (this.stage as any).gap
            : this.stage.boxDistance;
        const gapRatio = typeof ringState?.gapRatio === 'number' ? ringState.gapRatio : undefined;
        const gap = gapRatio === undefined
            ? (typeof ringState?.gap === 'number' ? ringState.gap : defaultGap)
            : 0;
        const outerRadius = typeof ringState?.radius === 'number' ? ringState.radius : undefined;
        const thickness = this.state.thickness;
        const angle = (startAngle * Math.PI) / 180 + direction * i * (Math.PI * 2) / N;
        return (height, size) => {
            const geometry = this.cylindricalSleeveSegment(
                height, size, N, gap, gapRatio, outerRadius, thickness,
            );
            const mesh = new THREE.Mesh(geometry, this.material);
            geometry.rotateY(angle);
            return mesh;
        };
    }
}

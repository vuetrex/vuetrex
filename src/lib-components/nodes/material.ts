import {MeshStandardMaterial, type Texture} from 'three';

export interface VxMaterialProps {
    color?: number
    opacity?: number
    transparent?: boolean
    roughness?: number
    metalness?: number
    emissive?: number
    emissiveIntensity?: number
    wireframe?: boolean
    map?: Texture | null
}

/**
 * Hover overrides applied when the pointer enters a node.
 * Any VxMaterialProps field overrides the base material for the duration of hover.
 * `scale` applies a uniform scale multiplier. `transition` controls the tween duration in seconds.
 */
export interface VxHoverProps extends VxMaterialProps {
    scale?: number
    transition?: number
}

export function applyMaterialProps(mat: MeshStandardMaterial, props: VxMaterialProps): void {
    if (props.color !== undefined) mat.color.setHex(props.color);
    if (props.opacity !== undefined) mat.opacity = props.opacity;
    if (props.transparent !== undefined) mat.transparent = props.transparent;
    if (props.roughness !== undefined) mat.roughness = props.roughness;
    if (props.metalness !== undefined) mat.metalness = props.metalness;
    if (props.emissive !== undefined) mat.emissive.setHex(props.emissive);
    if (props.emissiveIntensity !== undefined) mat.emissiveIntensity = props.emissiveIntensity;
    if (props.wireframe !== undefined) mat.wireframe = props.wireframe;
    if (props.map !== undefined && mat.map !== props.map) {
        mat.map = props.map;
        mat.needsUpdate = true;
    }
}

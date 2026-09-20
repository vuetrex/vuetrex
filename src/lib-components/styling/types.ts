import type { ColorRepresentation, Side, Texture } from 'three'

/** Inline standard-material values. Textures are borrowed, never owned by Vuetrex. */
export interface VxMaterialProps {
    color?: ColorRepresentation
    opacity?: number
    alphaMode?: 'opaque' | 'blend' | 'mask'
    alphaTest?: number
    roughness?: number
    metalness?: number
    emissive?: ColorRepresentation
    emissiveIntensity?: number
    wireframe?: boolean
    side?: Side
    depthWrite?: boolean
    depthTest?: boolean
    flatShading?: boolean
    toneMapped?: boolean
    map?: Texture | null
    normalMap?: Texture | null
    /** Linear height texture; ignored while normalMap is present. */
    bumpMap?: Texture | null
    /** Height strength; defaults to 1. Zero flattens, negative values invert relief. */
    bumpScale?: number
    roughnessMap?: Texture | null
    metalnessMap?: Texture | null
    emissiveMap?: Texture | null
    alphaMap?: Texture | null
    envMapIntensity?: number
}

/** Material overrides plus a uniform scale multiplier and duration in seconds. */
export interface VxHoverProps extends VxMaterialProps {
    scale?: number
    transition?: number
}

/** Complete value descriptor. Colors are immutable linear RGB tuples; textures retain caller identity. */
export interface VxResolvedMaterial extends Readonly<Required<Omit<VxMaterialProps, 'color' | 'emissive'>>> {
    readonly color: readonly [number, number, number]
    readonly emissive: readonly [number, number, number]
}

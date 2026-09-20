import { DoubleSide } from 'three'
import type { VxMaterialProps } from './types.js'

const finish = (defaults: VxMaterialProps) => (overrides: VxMaterialProps = {}): VxMaterialProps => ({ ...defaults, ...overrides })
/** Plain descriptor factories. They allocate no materials, textures, or shared mutable state. */
export const finishes = Object.freeze({
    satinMetal: finish({ color: '#969fa3', metalness: 0.92, roughness: 0.28 }),
    polishedMetal: finish({ color: '#b1b8ba', metalness: 1, roughness: 0.22 }),
    matteCeramic: finish({ color: '#d9d5c9', metalness: 0, roughness: 0.76 }),
    glazedCeramic: finish({ color: '#4f7180', metalness: 0, roughness: 0.18 }),
    tintedGlass: finish({ color: '#a7bfc3', metalness: 0, roughness: 0.12,
        alphaMode: 'blend', opacity: 0.18, side: DoubleSide, depthWrite: false }),
})

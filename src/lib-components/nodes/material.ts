import type { MeshStandardMaterial } from 'three'
import { toRaw } from 'vue'
import type { VxMaterialProps, VxResolvedMaterial } from '../styling/types.js'

export const materialTextureFields = ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'] as const
export const materialNumberFields = ['opacity', 'roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'bumpScale'] as const
const flags = ['wireframe', 'side', 'depthWrite', 'depthTest', 'flatShading', 'toneMapped'] as const

/** Snapshot construction defaults, copying colors but retaining borrowed texture references. */
export function readMaterial(material: MeshStandardMaterial): VxMaterialProps {
    const props: VxMaterialProps = {
        color: material.color.clone(), emissive: material.emissive.clone(),
        alphaMode: material.transparent ? 'blend' : material.alphaTest > 0 ? 'mask' : 'opaque',
        alphaTest: material.alphaTest,
    }
    for (const key of [...materialTextureFields, ...materialNumberFields, ...flags]) {
        Object.assign(props, { [key]: material[key] })
    }
    return props
}

/** Apply every supported field. Increment the program version only for program-affecting changes. */
export function applyResolvedMaterial(material: MeshStandardMaterial, next: VxResolvedMaterial): void {
    const transparent = next.alphaMode === 'blend'
    let programChanged = material.transparent !== transparent
        || (material.alphaTest > 0) !== (next.alphaTest > 0)
        || material.side !== next.side
        || material.flatShading !== next.flatShading
        || material.toneMapped !== next.toneMapped
        || material.wireframe !== next.wireframe
    material.color.setRGB(...next.color)
    material.emissive.setRGB(...next.emissive)
    material.transparent = transparent
    material.alphaTest = next.alphaTest
    for (const key of materialTextureFields) {
        const texture = toRaw(next[key])
        programChanged ||= material[key] !== texture
        material[key] = texture
    }
    for (const key of materialNumberFields) material[key] = next[key]
    for (const key of flags) Object.assign(material, { [key]: next[key] })
    if (programChanged) material.needsUpdate = true
}

import { Color, FrontSide } from 'three'
import type { VxMaterialProps, VxResolvedMaterial } from './types.js'

function color(value: VxMaterialProps['color']): readonly [number, number, number] {
    const c = new Color(value)
    return Object.freeze([c.r, c.g, c.b])
}

/**
 * Resolve low-to-high priority layers without mutating inputs or allocating GPU resources.
 * Undefined falls through, null clears textures. Future providers can supply additional layers.
 * Alpha defaults to mask for a positive alphaTest, otherwise blend for opacity < 1, otherwise opaque.
 * An explicit alphaMode wins. Only mask uses alphaTest (default 0.5). Blending retains depthWrite.
 */
export function resolveMaterial(...layers: readonly (VxMaterialProps | undefined)[]): VxResolvedMaterial {
    const props: VxMaterialProps = {}
    for (const layer of layers) {
        if (!layer) continue
        for (const key of Object.keys(layer) as (keyof VxMaterialProps)[]) {
            if (layer[key] !== undefined) Object.assign(props, { [key]: layer[key] })
        }
    }
    const opacity = props.opacity ?? 1
    const alphaMode = props.alphaMode ?? ((props.alphaTest ?? 0) > 0 ? 'mask' : opacity < 1 ? 'blend' : 'opaque')
    return Object.freeze({
        color: color(props.color ?? 0xffffff),
        opacity,
        alphaMode,
        alphaTest: alphaMode === 'mask' ? props.alphaTest ?? 0.5 : 0,
        roughness: props.roughness ?? 1,
        metalness: props.metalness ?? 0,
        emissive: color(props.emissive ?? 0x000000),
        emissiveIntensity: props.emissiveIntensity ?? 1,
        wireframe: props.wireframe ?? false,
        side: props.side ?? FrontSide,
        depthWrite: props.depthWrite ?? true,
        depthTest: props.depthTest ?? true,
        flatShading: props.flatShading ?? false,
        toneMapped: props.toneMapped ?? true,
        map: props.map ?? null,
        normalMap: props.normalMap ?? null,
        bumpMap: props.bumpMap ?? null,
        bumpScale: props.bumpScale ?? 1,
        roughnessMap: props.roughnessMap ?? null,
        metalnessMap: props.metalnessMap ?? null,
        emissiveMap: props.emissiveMap ?? null,
        alphaMap: props.alphaMap ?? null,
        envMapIntensity: props.envMapIntensity ?? 1,
    })
}

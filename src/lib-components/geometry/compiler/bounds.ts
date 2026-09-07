import * as THREE from 'three'
import type { GeometrySet } from '@/lib-components/geometry/types.js'

export function geometrySetBounds(set: GeometrySet, target = new THREE.Box3()): THREE.Box3 {
    target.makeEmpty()
    const transformed = new THREE.Box3()
    for (const record of set.records) {
        if (!record.visible) continue
        const geometry = record.prototype.geometry
        if (!geometry.boundingBox) geometry.computeBoundingBox()
        if (!geometry.boundingBox) continue
        transformed.copy(geometry.boundingBox).applyMatrix4(record.matrix)
        target.union(transformed)
    }
    return target
}


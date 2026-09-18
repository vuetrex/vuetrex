import * as THREE from 'three'
import type { Element3d } from '@/lib-components/three/element3d.js'

/** World scale of the closest object enclosing all connected endpoint elements. */
export function enclosingElementsScale(elements: readonly (Element3d | undefined)[]): number {
    const present = elements.filter((element): element is Element3d => Boolean(element?.mesh))
    if (present.length < 2) return present[0]?.node.getScale?.() ?? 1
    const common = commonAncestor(present.map(element => element.mesh!))
    if (!common) return 1
    common.updateWorldMatrix(true, false)
    const worldScale = common.getWorldScale(new THREE.Vector3())
    const volumeScale = Math.abs(worldScale.x * worldScale.y * worldScale.z)
    return Number.isFinite(volumeScale) && volumeScale > 0 ? Math.cbrt(volumeScale) : 1
}

function commonAncestor(objects: readonly THREE.Object3D[]): THREE.Object3D | undefined {
    const firstAncestors: THREE.Object3D[] = []
    let current: THREE.Object3D | null = objects[0]?.parent ?? null
    while (current) {
        firstAncestors.push(current)
        current = current.parent
    }
    return firstAncestors.find(candidate => objects.slice(1).every(object => isDescendantOf(object, candidate)))
}

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object.parent
    while (current) {
        if (current === ancestor) return true
        current = current.parent
    }
    return false
}

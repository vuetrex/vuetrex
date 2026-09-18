import { Element3d } from '@/lib-components/three/element3d.js'
import type {
    ConnectorPortCoordinates,
    ConnectorPortName,
} from '@/lib-components/connectors/types.js'
import * as THREE from 'three'

const EPSILON = 1e-7

export interface ResolvedPort {
    point: THREE.Vector3
    normal: THREE.Vector3
    bounds: THREE.Box3
}

function clamp01(value: number | undefined): number {
    return Math.max(0, Math.min(1, value ?? 0.5))
}

function endpointBounds(element: Element3d): THREE.Box3 {
    const object = element.mesh
    if (!object) {
        const center = element.getWorldPosition()
        return new THREE.Box3(center.clone(), center.clone())
    }
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    if (!bounds.isEmpty()) return bounds
    const center = element.getWorldPosition()
    return new THREE.Box3(center.clone(), center.clone())
}

function automaticPort(bounds: THREE.Box3, toward: THREE.Vector3): ConnectorPortName {
    const center = bounds.getCenter(new THREE.Vector3())
    const delta = toward.clone().sub(center)
    if (Math.abs(delta.x) >= Math.abs(delta.z)) return delta.x >= 0 ? 'right' : 'left'
    return delta.z >= 0 ? 'front' : 'back'
}

/** Resolve a named or normalized port against current world-space bounds. */
export function resolvePort(
    element: Element3d,
    port: ConnectorPortName | ConnectorPortCoordinates | undefined,
    toward: THREE.Vector3,
): ResolvedPort {
    const bounds = endpointBounds(element)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())

    if (port && typeof port === 'object') {
        const normalized = new THREE.Vector3(clamp01(port.x), clamp01(port.y), clamp01(port.z))
        const point = bounds.min.clone().add(size.multiply(normalized))
        const normal = point.clone().sub(center)
        if (normal.lengthSq() <= EPSILON) normal.copy(toward).sub(center)
        if (normal.lengthSq() <= EPSILON) normal.set(1, 0, 0)
        normal.normalize()
        return { point, normal, bounds }
    }

    const namedPort = !port || port === 'auto' ? automaticPort(bounds, toward) : port
    const point = center.clone()
    const normal = new THREE.Vector3()
    if (namedPort === 'left') { point.x = bounds.min.x; normal.set(-1, 0, 0) }
    else if (namedPort === 'right') { point.x = bounds.max.x; normal.set(1, 0, 0) }
    else if (namedPort === 'front') { point.z = bounds.max.z; normal.set(0, 0, 1) }
    else if (namedPort === 'back') { point.z = bounds.min.z; normal.set(0, 0, -1) }
    else if (namedPort === 'top') { point.y = bounds.max.y; normal.set(0, 1, 0) }
    else if (namedPort === 'bottom') { point.y = bounds.min.y; normal.set(0, -1, 0) }
    else {
        normal.copy(toward).sub(center)
        if (normal.lengthSq() <= EPSILON) normal.set(1, 0, 0)
        normal.normalize()
    }
    return { point, normal, bounds }
}

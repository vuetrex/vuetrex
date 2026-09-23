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

/** Bounds measured in the owner's coordinate system, before its world transform. */
export function localPortBounds(object: THREE.Object3D): THREE.Box3 {
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3()
    const visit = (child: THREE.Object3D, matrix: THREE.Matrix4) => {
        const geometry = (child as THREE.Mesh).geometry
        if (geometry) {
            if ((child as THREE.InstancedMesh).isInstancedMesh) {
                const instance = child as THREE.InstancedMesh
                instance.computeBoundingBox()
                if (instance.boundingBox) bounds.union(instance.boundingBox.clone().applyMatrix4(matrix))
            } else {
                geometry.computeBoundingBox()
                if (geometry.boundingBox) bounds.union(geometry.boundingBox.clone().applyMatrix4(matrix))
            }
        }
        for (const descendant of child.children) {
            // Text and other decorations are not the model's connection surface.
            if ((descendant as any).isTroikaText) continue
            visit(descendant, matrix.clone().multiply(descendant.matrix))
        }
    }
    visit(object, new THREE.Matrix4())
    return bounds
}

export function declaredPortDefinition(element: Element3d, record: import('../declarations.js').ConnectorPortDeclarationRecord): import('../types.js').ConnectorPortDefinition | undefined {
    if (record.disabled) return undefined
    if (record.position && record.normal) return { position: record.position, normal: record.normal }
    if (!element.mesh) return undefined
    const bounds = localPortBounds(element.mesh)
    const size = bounds.getSize(new THREE.Vector3())
    // Group objects exist before the post-flush mesh effects attach their children.
    // Keep the edge unresolved during that insertion phase; later mesh sync reroutes it.
    const pending = (node: import('../../nodes/Base.js').Base): boolean => node.getHostChildren().some(child =>
        child.isRenderableNode() && (!(child as import('../../nodes/Node.js').Node).element.mesh || pending(child)))
    if (bounds.isEmpty() && pending(element.node)) return undefined
    if (bounds.isEmpty() || size.x <= EPSILON || size.y <= EPSILON || size.z <= EPSILON) {
        throw new Error(`Face port '${record.name}' on '${element.node.id}' requires nonzero local bounds.`)
    }
    const [u, v] = record.at ?? [0.5, 0.5]
    const point = bounds.min.clone()
    const normal = new THREE.Vector3()
    switch (record.face) {
        case 'front': case 'back':
            point.add(new THREE.Vector3(size.x * u, size.y * v, record.face === 'front' ? size.z : 0))
            normal.z = record.face === 'front' ? 1 : -1; break
        case 'left': case 'right':
            point.add(new THREE.Vector3(record.face === 'right' ? size.x : 0, size.y * v, size.z * u))
            normal.x = record.face === 'right' ? 1 : -1; break
        case 'top': case 'bottom':
            point.add(new THREE.Vector3(size.x * u, record.face === 'top' ? size.y : 0, size.z * v))
            normal.y = record.face === 'top' ? 1 : -1; break
    }
    return { position: Object.freeze(point.toArray()) as readonly [number, number, number], normal: Object.freeze(normal.toArray()) as readonly [number, number, number] }
}

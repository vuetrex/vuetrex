import * as THREE from 'three'
import type { ResolvedConnectorNetwork } from '@/lib-components/connectors/compiler/types.js'

const EPSILON = 1e-10

/** Normalized progress on the terminal traversal nearest an actual world-space hit. */
export function connectorPathPosition(network: ResolvedConnectorNetwork, point: THREE.Vector3): number {
    let selected: readonly THREE.Vector3[] | undefined
    let nearestDistance = Infinity
    for (const traversal of network.traversals) {
        const distance = polylineDistanceSquared(traversal.points, point)
        if (distance < nearestDistance) {
            nearestDistance = distance
            selected = traversal.points
        }
    }
    return selected ? polylineProgress(selected, point) : 0
}

function polylineDistanceSquared(points: readonly THREE.Vector3[], point: THREE.Vector3): number {
    let nearest = Infinity
    const projected = new THREE.Vector3()
    for (let index = 1; index < points.length; index++) {
        new THREE.Line3(points[index - 1], points[index]).closestPointToPoint(point, true, projected)
        nearest = Math.min(nearest, projected.distanceToSquared(point))
    }
    return nearest
}

function polylineProgress(points: readonly THREE.Vector3[], point: THREE.Vector3): number {
    let total = 0
    let nearestDistance = Infinity
    let nearestAlong = 0
    const projected = new THREE.Vector3()
    for (let index = 1; index < points.length; index++) {
        const start = points[index - 1]
        const end = points[index]
        const length = start.distanceTo(end)
        new THREE.Line3(start, end).closestPointToPoint(point, true, projected)
        const distance = projected.distanceToSquared(point)
        if (distance < nearestDistance) {
            nearestDistance = distance
            nearestAlong = total + start.distanceTo(projected)
        }
        total += length
    }
    return total <= EPSILON ? 0 : THREE.MathUtils.clamp(nearestAlong / total, 0, 1)
}

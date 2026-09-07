import * as THREE from 'three'
import type {
    RotationLike,
    ScaleLike,
    Vector3Like,
} from '@/lib-components/geometry/types.js'

export function toVector3(value: Vector3Like | undefined, fallback = new THREE.Vector3()): THREE.Vector3 {
    if (value === undefined) return fallback.clone()
    if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2])
    if ((value as THREE.Vector3).isVector3) return (value as THREE.Vector3).clone()
    const object = value as Readonly<{ x: number; y: number; z: number }>
    return new THREE.Vector3(object.x, object.y, object.z)
}

export function toScale3(value: ScaleLike | undefined): THREE.Vector3 {
    if (value === undefined) return new THREE.Vector3(1, 1, 1)
    if (typeof value === 'number') return new THREE.Vector3(value, value, value)
    return toVector3(value)
}

export function toQuaternion(value: RotationLike | undefined): THREE.Quaternion {
    if (value === undefined) return new THREE.Quaternion()
    if ((value as THREE.Quaternion).isQuaternion) return (value as THREE.Quaternion).clone()
    if ((value as THREE.Euler).isEuler) return new THREE.Quaternion().setFromEuler(value as THREE.Euler)
    if (Array.isArray(value) && value.length === 4) {
        return new THREE.Quaternion(value[0], value[1], value[2], value[3]).normalize()
    }
    const euler = value as readonly [number, number, number]
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], 'XYZ'))
}

export function composeTransform(options: {
    translate?: Vector3Like
    rotate?: RotationLike
    scale?: ScaleLike
    pivot?: Vector3Like
}): THREE.Matrix4 {
    const translation = toVector3(options.translate)
    const rotation = toQuaternion(options.rotate)
    const scale = toScale3(options.scale)
    const pivot = toVector3(options.pivot)

    const result = new THREE.Matrix4().makeTranslation(translation.x, translation.y, translation.z)
    if (pivot.lengthSq() > 0) result.multiply(new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
    result.multiply(new THREE.Matrix4().compose(new THREE.Vector3(), rotation, scale))
    if (pivot.lengthSq() > 0) result.multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    return result
}

export function directionQuaternion(direction: Vector3Like | undefined): THREE.Quaternion {
    if (direction === undefined) return new THREE.Quaternion()
    const target = toVector3(direction)
    if (target.lengthSq() < 1e-12) return new THREE.Quaternion()
    return new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        target.normalize(),
    )
}

export function finiteNumber(value: unknown, fallback: number, minimum = -Infinity): number {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? Math.max(minimum, number) : fallback
}

export function integer(value: unknown, fallback: number, minimum = 0): number {
    return Math.floor(finiteNumber(value, fallback, minimum))
}


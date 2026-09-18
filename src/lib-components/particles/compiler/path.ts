import * as THREE from 'three'

export interface ParticleMotionPath {
    getLength(): number
    getPointAt(progress: number): THREE.Vector3
    getTangentAt(progress: number): THREE.Vector3
}

/** Exact distance-based sampling: corners never cut across the authored segments. */
export class LinearParticlePath implements ParticleMotionPath {
    private readonly points: THREE.Vector3[]
    private readonly distances: number[] = [0]

    constructor(points: readonly THREE.Vector3[], closed: boolean) {
        this.points = points.filter((point, index) => index === 0 || !point.equals(points[index - 1]))
            .map(point => point.clone())
        if (closed && this.points.length > 1 && !this.points[0].equals(this.points.at(-1)!)) {
            this.points.push(this.points[0].clone())
        }
        for (let index = 1; index < this.points.length; index++) {
            this.distances.push(this.distances[index - 1] + this.points[index].distanceTo(this.points[index - 1]))
        }
    }

    getLength(): number {
        return this.distances.at(-1)!
    }

    getPointAt(progress: number): THREE.Vector3 {
        if (this.points.length < 2) return this.points[0]?.clone() ?? new THREE.Vector3()
        const distance = THREE.MathUtils.clamp(progress, 0, 1) * this.getLength()
        const index = this.segmentAt(distance)
        const fraction = (distance - this.distances[index]) / (this.distances[index + 1] - this.distances[index])
        return this.points[index].clone().lerp(this.points[index + 1], fraction)
    }

    getTangentAt(progress: number): THREE.Vector3 {
        if (this.points.length < 2) return new THREE.Vector3(1, 0, 0)
        const index = this.segmentAt(THREE.MathUtils.clamp(progress, 0, 1) * this.getLength())
        return this.points[index + 1].clone().sub(this.points[index]).normalize()
    }

    private segmentAt(distance: number): number {
        let low = 0
        let high = this.points.length - 2
        while (low < high) {
            const middle = Math.floor((low + high) / 2)
            if (this.distances[middle + 1] <= distance) low = middle + 1
            else high = middle
        }
        return low
    }
}

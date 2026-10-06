import * as THREE from 'three'
import type { CompiledParticleEmitter, CompiledPathEmitter } from './types.js'

/** Keep unsupported motion on the CPU, without silently dropping authored effects. */
export function supportsGpuPathMotion(emitter: CompiledParticleEmitter): emitter is CompiledPathEmitter {
    return emitter.kind === 'path' && emitter.options.interpolation === 'linear'
        && emitter.path.points.length <= 65535
        && Object.keys(emitter.motion).every(key => key === 'speed')
        && Object.keys(emitter.simulation).every(key => key === 'backend')
}

interface PathParticle {
    readonly phase: number
    readonly speed: number
    readonly spread: number
    readonly angle: number
}

const samplers = new WeakMap<THREE.Object3D, (index: number) => THREE.Vector3 | undefined>()

/** On-demand CPU sampling for picking only; rendering never uploads moving positions. */
export function gpuParticlePosition(object: THREE.Object3D, index: number): THREE.Vector3 | undefined {
    return samplers.get(object)?.(index)
}

/** Owns a static route texture and attributes. Each frame changes just the clock uniform. */
export function attachGpuPathMotion(
    points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>,
    emitter: CompiledPathEmitter,
    particles: readonly PathParticle[],
    sample: (index: number, time: number) => THREE.Vector3,
): { update(time: number): void; dispose(): void } {
    const vertices = emitter.path.points.map(point => Array.isArray(point)
        ? new THREE.Vector3(point[0], point[1], point[2])
        : new THREE.Vector3((point as THREE.Vector3).x, (point as THREE.Vector3).y, (point as THREE.Vector3).z))
        .filter((point, index, all) => index === 0 || !point.equals(all[index - 1]))
    if (!vertices.length) vertices.push(new THREE.Vector3())
    if ((emitter.path.closed ?? emitter.options.closed ?? false)
        && vertices.length > 1 && !vertices[0].equals(vertices.at(-1)!)) vertices.push(vertices[0].clone())
    const width = Math.min(256, vertices.length)
    const height = Math.ceil(vertices.length / width)
    const data = new Float32Array(width * height * 4)
    let length = 0
    vertices.forEach((point, index) => {
        if (index) length += point.distanceTo(vertices[index - 1])
        data.set([point.x, point.y, point.z, length], index * 4)
    })
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType)
    texture.needsUpdate = true
    const clock = { value: 0 }
    Object.assign(points.material.uniforms, {
        pathMotionTime: clock,
        pathMotionTexture: { value: texture },
        pathMotionTextureSize: { value: new THREE.Vector2(width, height) },
        pathMotionCount: { value: vertices.length },
        pathMotionLength: { value: length },
    })
    const attributes = new Float32Array(particles.length * 4)
    let spread = 0
    particles.forEach((particle, index) => {
        attributes.set([particle.phase, particle.speed, particle.spread, particle.angle], index * 4)
        spread = Math.max(spread, Math.abs(particle.spread))
    })
    points.geometry.setAttribute('pathMotion', new THREE.BufferAttribute(attributes, 4))
    points.geometry.boundingBox = new THREE.Box3().setFromPoints(vertices).expandByScalar(spread)
    points.geometry.boundingSphere = points.geometry.boundingBox.getBoundingSphere(new THREE.Sphere())
    points.material.vertexShader = pathMotionShader + points.material.vertexShader.replace(
        'modelViewMatrix * vec4(position, 1.0)', 'modelViewMatrix * vec4(pathMotionPosition(), 1.0)',
    )
    points.userData.vxParticleAdapter = 'gpu-path'
    const position = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const pickingPositions = new Float32Array(particles.length * 3)
    const originalRaycast = points.raycast
    const pickBounds = new THREE.Sphere()
    // Three's Points raycaster reads CPU positions. Evaluate only when a pick is requested,
    // keeping the GPU's static position buffer and its upload version untouched.
    points.raycast = function (raycaster, intersects) {
        if (this.userData.vxConnectorOutput && !this.userData.vxConnectorOwner) return
        pickBounds.copy(this.geometry.boundingSphere!).applyMatrix4(this.matrixWorld)
        pickBounds.radius += raycaster.params.Points.threshold
        if (!raycaster.ray.intersectsSphere(pickBounds)) return
        for (let index = 0; index < particles.length; index++) sample(index, clock.value).toArray(pickingPositions, index * 3)
        const original = position.array
        position.array = pickingPositions
        try { originalRaycast.call(this, raycaster, intersects) }
        finally { position.array = original }
    }
    samplers.set(points, index => index >= 0 && index < particles.length ? sample(index, clock.value) : undefined)
    let disposed = false
    return {
        update(time) { clock.value = time },
        dispose() {
            if (disposed) return
            disposed = true
            samplers.delete(points)
            points.raycast = originalRaycast
            texture.dispose()
        },
    }
}

const pathMotionShader = `
    attribute vec4 pathMotion;
    uniform float pathMotionTime;
    uniform sampler2D pathMotionTexture;
    uniform vec2 pathMotionTextureSize;
    uniform float pathMotionCount;
    uniform float pathMotionLength;
    vec4 pathMotionVertex(float index) {
        vec2 pixel = vec2(mod(index, pathMotionTextureSize.x), floor(index / pathMotionTextureSize.x));
        return texture2D(pathMotionTexture, (pixel + 0.5) / pathMotionTextureSize);
    }
    vec3 pathMotionPosition() {
        if (pathMotionLength <= 0.0) return pathMotionVertex(0.0).xyz;
        float distance = fract(pathMotion.x + pathMotionTime * pathMotion.y / pathMotionLength) * pathMotionLength;
        float low = 0.0;
        float high = pathMotionCount - 2.0;
        // At most 65536 vertices; binary search preserves exact segment boundaries.
        for (int step = 0; step < 16; step++) {
            if (low >= high) break;
            float middle = floor((low + high) * 0.5);
            if (pathMotionVertex(middle + 1.0).w <= distance) low = middle + 1.0;
            else high = middle;
        }
        vec4 a = pathMotionVertex(low);
        vec4 b = pathMotionVertex(low + 1.0);
        vec3 result = mix(a.xyz, b.xyz, (distance - a.w) / max(b.w - a.w, 0.0000001));
        vec3 tangent = normalize(b.xyz - a.xyz);
        vec3 side = normalize(cross(tangent, abs(tangent.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 up = normalize(cross(tangent, side));
        return result + pathMotion.z * (cos(pathMotion.w) * side + sin(pathMotion.w) * up);
    }
`

import * as THREE from 'three'
import { attachGpuPathMotion, supportsGpuPathMotion } from './gpuPathMotion.js'
import { resolveParticleField } from '@/lib-components/particles/fields.js'
import { resolveParticleValue } from '@/lib-components/particles/parameters.js'
import { LinearParticlePath, type ParticleMotionPath } from '@/lib-components/particles/compiler/path.js'
import type { ParticleBackend } from '@/lib-components/particles/backend.js'
import type {
    CompiledCloudEmitter,
    CompiledParticleEmitter,
    CompiledParticleProgram,
    CompiledPathEmitter,
    ParticleBackendContext,
    ResolvedParticleTarget,
} from '@/lib-components/particles/compiler/types.js'
import type {
    ParticleAppearanceOptions,
    ParticleColor,
    ParticleContext,
    ParticleForce,
    ParticleHit,
    ParticleTarget,
    ParticleVector3Like,
} from '@/lib-components/particles/types.js'

interface RuntimeForce {
    readonly type: 'gravity' | 'attractor' | 'vortex'
    readonly vector?: THREE.Vector3
    readonly target?: ParticleTarget
    readonly strength?: number
    readonly radius: number
}

interface RuntimeParticle {
    readonly hit: ParticleHit
    readonly context: ParticleContext<any>
    readonly emitter: CompiledParticleEmitter
    readonly phase: number
    readonly path?: ParticleMotionPath
    readonly pathLength: number
    readonly cloudOffset?: THREE.Vector3
    readonly velocity: THREE.Vector3
    readonly simulationVelocity: THREE.Vector3
    readonly simulationOffset: THREE.Vector3
    readonly turbulence: number
    readonly turbulenceScale: number
    readonly speed: number
    readonly spread: number
    readonly forces: readonly RuntimeForce[]
    readonly drag: number
    readonly maxDelta: number
    readonly simulationActive: boolean
    readonly batch: RuntimeBatch
    readonly batchIndex: number
}

interface RuntimeBatch {
    readonly key: string
    readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    readonly positions: Float32Array
    readonly hits: ParticleHit[]
    count: number
    gpuMotion?: ReturnType<typeof attachGpuPathMotion>
}

interface ResolvedStyle {
    readonly shape: 'soft-disc' | 'disc' | 'square'
    readonly blending: 'normal' | 'additive'
    readonly depthWrite: boolean
    readonly sizeAttenuation: boolean
}

const defaultTarget: ResolvedParticleTarget = {
    center: new THREE.Vector3(),
    radius: new THREE.Vector3(1, 1, 1),
}

export class CpuParticleBackend implements ParticleBackend {
    readonly object = new THREE.Group()
    readonly particleCount: number

    private readonly particles: RuntimeParticle[] = []
    private readonly cpuParticles: RuntimeParticle[] = []
    private readonly batches: RuntimeBatch[] = []
    private readonly batchByObject = new WeakMap<THREE.Object3D, RuntimeBatch>()
    private readonly bounds = new THREE.Box3()
    private lastTime?: number

    constructor(
        private readonly program: CompiledParticleProgram,
        private readonly backendContext: ParticleBackendContext,
        private readonly gpuPaths = false,
    ) {
        this.object.name = gpuPaths ? 'vx-particle-backend-auto' : 'vx-particle-backend-cpu'
        this.build()
        this.particleCount = this.particles.length
        this.update(0, 0)
    }

    update(timeSeconds: number, deltaSeconds: number): void {
        const delta = this.lastTime === undefined ? 0 : Math.max(0, deltaSeconds)
        this.lastTime = timeSeconds
        for (const particle of this.cpuParticles) this.updateParticle(particle, timeSeconds, delta)
        for (const batch of this.batches) {
            if (batch.gpuMotion) {
                batch.gpuMotion.update(timeSeconds)
                continue
            }
            batch.points.geometry.attributes.position.needsUpdate = true
            batch.points.geometry.computeBoundingSphere()
        }
    }

    localBounds(target = new THREE.Box3()): THREE.Box3 {
        target.makeEmpty()
        const point = new THREE.Vector3()
        for (const batch of this.batches) {
            if (batch.gpuMotion) {
                if (batch.count > 0) target.union(batch.points.geometry.boundingBox!)
                continue
            }
            for (let index = 0; index < batch.count; index++) {
                point.fromArray(batch.positions, index * 3)
                target.expandByPoint(point)
            }
        }
        return target
    }

    particleHitAt(index: number, object?: THREE.Object3D): ParticleHit | undefined {
        const batch = object ? this.batchByObject.get(object) : this.batches[0]
        return batch?.hits[index]
    }

    dispose(): void {
        for (const batch of this.batches) {
            batch.points.removeFromParent()
            batch.gpuMotion?.dispose()
            batch.points.geometry.dispose()
            batch.points.material.dispose()
        }
        this.object.clear()
        this.particles.length = 0
        this.cpuParticles.length = 0
        this.batches.length = 0
        this.lastTime = undefined
    }

    private build(): void {
        const emitters = this.program.emitters
        const batchPlans = new Map<string, { style: ResolvedStyle, emitters: CompiledParticleEmitter[], count: number }>()
        for (const emitter of emitters) {
            const count = resolveCount(emitter, this.backendContext)
            const style = resolveStyle(emitter.appearance, this.backendContext)
            const gpu = this.gpuPaths && supportsGpuPathMotion(emitter)
            const key = `${style.shape}|${style.blending}|${style.depthWrite}|${style.sizeAttenuation}${gpu ? `|gpu:${emitter.emitterIndex}` : ''}`
            const plan = batchPlans.get(key) ?? { style, emitters: [], count: 0 }
            plan.emitters.push(emitter)
            plan.count += count
            batchPlans.set(key, plan)
        }

        for (const [key, plan] of batchPlans) {
            const batch = createBatch(key, plan.style, plan.count, this.backendContext.pixelRatio)
            this.batches.push(batch)
            this.batchByObject.set(batch.points, batch)
            this.object.add(batch.points)

            const batchParticles: RuntimeParticle[] = []
            for (const emitter of plan.emitters) {
                const count = resolveCount(emitter, this.backendContext)
                // One immutable sampling path per emitter, shared by all its particles.
                const path = emitter.kind === 'path' ? createMotionPath(emitter) : undefined
                for (let localIndex = 0; localIndex < count; localIndex++) {
                    const particle = this.createParticle(emitter, localIndex, count, batch, path)
                    this.particles.push(particle)
                    batchParticles.push(particle)
                }
            }
            const geometry = batch.points.geometry
            geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3))
            const emitter = plan.emitters[0]
            if (this.gpuPaths && supportsGpuPathMotion(emitter)) {
                for (const particle of batchParticles) this.updateParticle(particle, 0, 0)
                batch.gpuMotion = attachGpuPathMotion(batch.points, emitter, batchParticles.map(particle => ({
                    phase: particle.phase, speed: particle.speed, spread: particle.spread,
                    angle: particle.context.random * Math.PI * 2,
                })), (index, time) => this.pathPosition(batchParticles[index], time))
            } else {
                for (const particle of batchParticles) this.cpuParticles.push(particle)
            }
        }
    }

    private createParticle(
        emitter: CompiledParticleEmitter,
        localIndex: number,
        count: number,
        batch: RuntimeBatch,
        path?: ParticleMotionPath,
    ): RuntimeParticle {
        const seed = resolveParticleValue(emitter.options.seed, this.backendContext.parameters) ?? emitter.key
        const random = randomAt(seed, localIndex, emitter.emitterIndex)
        const distribution = emitter.options.distribution
        const phase = distribution === 'random' || emitter.kind === 'cloud'
            ? random
            : count <= 1 ? 0 : localIndex / count
        const item = emitter.kind === 'path' ? emitter.path.item : emitter.cloud.item
        const context: ParticleContext<any> = Object.freeze({
            key: `${emitter.key}:${localIndex}`,
            index: localIndex,
            emitterIndex: emitter.emitterIndex,
            item,
            random,
            phase,
        })
        const batchIndex = batch.count++
        const hit: ParticleHit = Object.freeze({
            id: context.key,
            item,
            particleIndex: batchIndex,
        })
        batch.hits[batchIndex] = hit
        writeAppearance(batch, batchIndex, emitter.appearance, context, this.backendContext)

        const velocity = vectorFrom(resolveParticleField(emitter.motion.velocity, context, this.backendContext.parameters))
        const forces = (emitter.simulation.forces ?? []).map(force =>
            resolveForce(force, context, this.backendContext))
        const simulationActive = Object.keys(emitter.simulation).length > 0
        const cloudOffset = emitter.kind === 'cloud'
            ? randomCloudOffset(emitter, localIndex, this.backendContext)
            : undefined
        return {
            hit,
            context,
            emitter,
            phase,
            path,
            pathLength: path?.getLength() ?? 0,
            cloudOffset,
            velocity,
            simulationVelocity: velocity.clone(),
            simulationOffset: new THREE.Vector3(),
            turbulence: resolveParticleField(emitter.motion.turbulence, context, this.backendContext.parameters) ?? 0,
            turbulenceScale: resolveParticleValue(emitter.motion.turbulenceScale, this.backendContext.parameters) ?? 1,
            speed: resolveParticleField(emitter.motion.speed, context, this.backendContext.parameters) ?? (emitter.kind === 'path' ? 0.35 : 0),
            spread: emitter.kind === 'path'
                ? resolveParticleField(emitter.options.spread, context, this.backendContext.parameters) ?? 0
                : 0,
            forces,
            drag: Math.max(0, resolveParticleValue(emitter.simulation.drag, this.backendContext.parameters) ?? 0),
            maxDelta: Math.max(0.001, resolveParticleValue(emitter.simulation.maxDelta, this.backendContext.parameters) ?? 0.05),
            simulationActive,
            batch,
            batchIndex,
        }
    }

    private updateParticle(particle: RuntimeParticle, time: number, delta: number): void {
        const position = particle.emitter.kind === 'path'
            ? this.pathPosition(particle, time)
            : this.cloudPosition(particle)

        if (particle.simulationActive) {
            this.integrate(particle, position, Math.min(delta, particle.maxDelta))
            position.add(particle.simulationOffset)
        } else if (particle.velocity.lengthSq() > 0) {
            position.addScaledVector(particle.velocity, time)
        }
        if (particle.turbulence !== 0) addTurbulence(position, particle, time)
        applyOrbit(position, particle, time, this.backendContext)
        position.toArray(particle.batch.positions, particle.batchIndex * 3)
    }

    private pathPosition(particle: RuntimeParticle, time: number): THREE.Vector3 {
        if (!particle.path) return new THREE.Vector3()
        if (particle.pathLength <= 0) return particle.path.getPointAt(0)
        const progress = modulo(particle.phase + (time * particle.speed) / particle.pathLength, 1)
        const position = particle.path.getPointAt(progress)
        if (particle.spread !== 0) {
            const tangent = particle.path.getTangentAt(progress).normalize()
            const side = tangent.clone().cross(Math.abs(tangent.y) < 0.9
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(1, 0, 0)).normalize()
            const up = tangent.clone().cross(side).normalize()
            const angle = particle.context.random * Math.PI * 2
            position.addScaledVector(side, Math.cos(angle) * particle.spread)
            position.addScaledVector(up, Math.sin(angle) * particle.spread)
        }
        return position
    }

    private cloudPosition(particle: RuntimeParticle): THREE.Vector3 {
        const emitter = particle.emitter as CompiledCloudEmitter
        const resolved = this.backendContext.resolveTarget(emitter.cloud.target) ?? defaultTarget
        const radius = resolveCloudRadius(emitter, resolved, this.backendContext)
        return resolved.center.clone().add(particle.cloudOffset!.clone().multiply(radius))
    }

    private integrate(particle: RuntimeParticle, base: THREE.Vector3, delta: number): void {
        if (delta <= 0) return
        const acceleration = new THREE.Vector3()
        const current = base.clone().add(particle.simulationOffset)
        for (const force of particle.forces) {
            if (force.type === 'gravity') {
                acceleration.add(force.vector!)
                continue
            }
            const target = this.backendContext.resolveTarget(force.target ?? [0, 0, 0]).center
            const relative = target.clone().sub(current)
            const distance = relative.length()
            if (force.radius > 0 && distance > force.radius) continue
            if (distance <= 0.00001) continue
            if (force.type === 'attractor') {
                acceleration.addScaledVector(relative.normalize(), force.strength ?? 0)
            } else {
                const axis = force.vector ?? new THREE.Vector3(0, 1, 0)
                acceleration.addScaledVector(axis.clone().cross(relative).normalize(), force.strength ?? 0)
            }
        }
        particle.simulationVelocity.addScaledVector(acceleration, delta)
        if (particle.drag > 0) particle.simulationVelocity.multiplyScalar(Math.exp(-particle.drag * delta))
        particle.simulationOffset.addScaledVector(particle.simulationVelocity, delta)
    }
}

function createMotionPath(emitter: CompiledPathEmitter): ParticleMotionPath {
    const points = emitter.path.points.map(vectorFrom)
    const closed = emitter.path.closed ?? emitter.options.closed ?? false
    return emitter.options.interpolation === 'linear'
        ? new LinearParticlePath(points, closed)
        : new THREE.CatmullRomCurve3(points, closed, 'centripetal')
}

function resolveCount(emitter: CompiledParticleEmitter, context: ParticleBackendContext): number {
    const item = emitter.kind === 'path' ? emitter.path.item : emitter.cloud.item
    const source = emitter.options.count
    const value = typeof source === 'function'
        ? resolveParticleValue(source(Object.freeze({
            item,
            key: emitter.key,
            index: emitter.emitterIndex,
            emitterIndex: emitter.emitterIndex,
        })), context.parameters)
        : resolveParticleValue(source, context.parameters)
    return Math.max(0, Math.floor(value ?? (emitter.kind === 'path' ? 80 : 160)))
}

function resolveStyle(options: ParticleAppearanceOptions, context: ParticleBackendContext): ResolvedStyle {
    return {
        shape: resolveParticleValue(options.shape, context.parameters) ?? 'soft-disc',
        blending: resolveParticleValue(options.blending, context.parameters) ?? 'additive',
        depthWrite: resolveParticleValue(options.depthWrite, context.parameters) ?? false,
        sizeAttenuation: resolveParticleValue(options.sizeAttenuation, context.parameters) ?? true,
    }
}

function createBatch(key: string, style: ResolvedStyle, count: number, pixelRatio: number): RuntimeBatch {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const opacities = new Float32Array(count)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('particleOpacity', new THREE.BufferAttribute(opacities, 1))
    const material = particleMaterial(style, pixelRatio)
    const points = new THREE.Points(geometry, material)
    points.name = `vx-particle-batch-${key}`
    points.frustumCulled = false
    points.userData.vxParticles = true
    points.userData.vxParticleAdapter = 'cpu'
    return { key, points, positions, hits: [], count: 0 }
}

function writeAppearance(
    batch: RuntimeBatch,
    index: number,
    appearance: ParticleAppearanceOptions<any>,
    context: ParticleContext<any>,
    backendContext: ParticleBackendContext,
): void {
    const colorValue = resolveParticleField(appearance.color, context, backendContext.parameters) ?? 0x43c7ff
    const color = colorValue instanceof THREE.Color ? colorValue : new THREE.Color(colorValue as ParticleColor)
    ;(batch.points.geometry.attributes.color.array as Float32Array).set(color.toArray(), index * 3)
    ;(batch.points.geometry.attributes.particleSize.array as Float32Array)[index] = Math.max(
        0,
        resolveParticleField(appearance.size, context, backendContext.parameters) ?? 0.09,
    )
    ;(batch.points.geometry.attributes.particleOpacity.array as Float32Array)[index] = THREE.MathUtils.clamp(
        resolveParticleField(appearance.opacity, context, backendContext.parameters) ?? 0.88,
        0,
        1,
    )
}

function particleMaterial(style: ResolvedStyle, pixelRatio: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: style.depthWrite,
        blending: style.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexColors: true,
        fog: true,
        // `fog: true` makes Three.js refresh these uniforms before every
        // render. Keep them on the material even though the shader chunks are
        // compiled in as strings; otherwise a fogged scene fails at runtime
        // when WebGLRenderer tries to update `fogColor`.
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                pixelRatio: { value: pixelRatio },
                attenuationScale: { value: style.sizeAttenuation ? 300 : 1 },
            },
        ]),
        vertexShader: `
            attribute float particleSize;
            attribute float particleOpacity;
            varying vec3 vColor;
            varying float vOpacity;
            uniform float pixelRatio;
            uniform float attenuationScale;
            #include <fog_pars_vertex>
            void main() {
                vColor = color;
                vOpacity = particleOpacity;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                float attenuation = attenuationScale > 1.0
                    ? attenuationScale / max(0.001, -mvPosition.z)
                    : 1.0;
                gl_PointSize = max(1.0, particleSize * pixelRatio * attenuation);
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vOpacity;
            #include <fog_pars_fragment>
            void main() {
                float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
                ${style.shape === 'square'
                    ? 'float coverage = 1.0;'
                    : style.shape === 'disc'
                        ? 'float coverage = 1.0 - smoothstep(0.46, 0.5, distanceFromCenter);'
                        : 'float coverage = 1.0 - smoothstep(0.12, 0.5, distanceFromCenter);'}
                if (coverage <= 0.0) discard;
                gl_FragColor = vec4(vColor, vOpacity * coverage);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #include <fog_fragment>
            }
        `,
    })
}

function randomCloudOffset(
    emitter: CompiledCloudEmitter,
    index: number,
    context: ParticleBackendContext,
): THREE.Vector3 {
    const seed = resolveParticleValue(emitter.options.seed, context.parameters) ?? emitter.key
    const x = randomAt(seed, index, 11) * 2 - 1
    const y = randomAt(seed, index, 23) * 2 - 1
    const z = randomAt(seed, index, 37) * 2 - 1
    if ((emitter.options.shape ?? 'sphere') === 'box') {
        const result = new THREE.Vector3(x, y, z)
        if (emitter.options.distribution === 'surface') {
            const axis = Math.floor(randomAt(seed, index, 41) * 3)
            result.setComponent(axis, randomAt(seed, index, 43) < 0.5 ? -1 : 1)
        }
        return result
    }
    const direction = new THREE.Vector3(x, y, z)
    if (direction.lengthSq() < 0.00001) direction.set(0, 1, 0)
    direction.normalize()
    const radius = emitter.options.distribution === 'surface'
        ? 1
        : Math.cbrt(randomAt(seed, index, 47))
    return direction.multiplyScalar(radius)
}

function resolveCloudRadius(
    emitter: CompiledCloudEmitter,
    target: ResolvedParticleTarget,
    context: ParticleBackendContext,
): THREE.Vector3 {
    const configured = resolveParticleValue(emitter.cloud.radius ?? emitter.options.radius, context.parameters)
    if (configured === 'bounds' || (configured === undefined && typeof emitter.cloud.target === 'string')) {
        return target.radius.clone().multiplyScalar(1.2)
    }
    if (typeof configured === 'number') return new THREE.Vector3(configured, configured, configured)
    return configured ? vectorFrom(configured) : new THREE.Vector3(1, 1, 1)
}

function resolveForce(
    force: ParticleForce<any>,
    particle: ParticleContext<any>,
    context: ParticleBackendContext,
): RuntimeForce {
    if (force.type === 'gravity') {
        return {
            type: 'gravity',
            vector: vectorFrom(resolveParticleField(force.acceleration, particle, context.parameters)),
            radius: 0,
        }
    }
    const radius = Math.max(0, resolveParticleValue(force.radius, context.parameters) ?? 0)
    const axis = force.type === 'vortex' ? vectorFrom(force.axis ?? [0, 1, 0]).normalize() : undefined
    return {
        type: force.type,
        target: force.type === 'vortex' ? force.center ?? [0, 0, 0] : force.target,
        vector: axis,
        strength: resolveParticleField(force.strength, particle, context.parameters) ?? 0,
        radius,
    }
}

function applyOrbit(
    position: THREE.Vector3,
    particle: RuntimeParticle,
    time: number,
    context: ParticleBackendContext,
): void {
    const orbit = particle.emitter.motion.orbit
    if (!orbit) return
    const speed = resolveParticleField(orbit.speed, particle.context, context.parameters) ?? 0
    if (speed === 0) return
    const center = context.resolveTarget(orbit.center ?? [0, 0, 0]).center
    const axis = vectorFrom(orbit.axis ?? [0, 1, 0]).normalize()
    position.sub(center).applyAxisAngle(axis, speed * time).add(center)
}

function addTurbulence(position: THREE.Vector3, particle: RuntimeParticle, time: number): void {
    const seed = particle.context.random * Math.PI * 2
    const t = time * particle.turbulenceScale
    position.x += Math.sin(t * 1.17 + seed) * particle.turbulence
    position.y += Math.sin(t * 1.43 + seed * 1.7) * particle.turbulence
    position.z += Math.cos(t * 1.31 + seed * 2.3) * particle.turbulence
}

function vectorFrom(value: ParticleVector3Like | undefined): THREE.Vector3 {
    if (value instanceof THREE.Vector3) return value.clone()
    if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2])
    if (value && typeof value === 'object') {
        const point = value as { x: number, y: number, z: number }
        return new THREE.Vector3(point.x, point.y, point.z)
    }
    return new THREE.Vector3()
}

function randomAt(seed: string | number, index: number, salt: number): number {
    let hash = 2166136261
    const value = `${seed}:${index}:${salt}`
    for (let offset = 0; offset < value.length; offset++) {
        hash ^= value.charCodeAt(offset)
        hash = Math.imul(hash, 16777619)
    }
    hash += hash << 13
    hash ^= hash >>> 7
    hash += hash << 3
    hash ^= hash >>> 17
    hash += hash << 5
    return (hash >>> 0) / 4294967296
}

function modulo(value: number, divisor: number): number {
    return ((value % divisor) + divisor) % divisor
}

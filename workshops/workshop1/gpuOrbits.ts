import * as THREE from 'three'
import {
  particles, registerParticleBackend, resolveParticleField, resolveParticleValue,
  type CompiledParticleProgram, type ParticleBackend, type ParticleBackendContext, type ParticleContext,
} from '@/lib-components'

const backendName = 'workshop1-gpu-orbits'
const height = 1.5
const tilt = -0.11
const spread = 0.11
const rings = [
  { radius: 1.22, color: 0x78dfff, speed: 0.24 },
  { radius: 1.56, color: 0x78dfff, speed: -0.19 },
  { radius: 1.94, color: 0x78dfff, speed: 0.15 },
] as const

type OrbitRing = typeof rings[number]

/** One authored host and one GPU batch, regardless of particle count. */
export function workshopOrbitGraph(count: number) {
  const perRing = Math.floor(count / rings.length)
  return particles.paths(rings.map((ring, index) => ({
    key: `saturn-${index}`,
    item: ring,
    closed: true,
    points: Array.from({ length: 64 }, (_, vertex): [number, number, number] => {
      const angle = vertex * Math.PI * 2 / 64
      const z = ring.radius * Math.sin(angle)
      return [ring.radius * Math.cos(angle), height + z * Math.sin(tilt), z * Math.cos(tilt)]
    }),
  })), {
    count: ({ index }) => perRing + (index === 0 ? count % rings.length : 0),
    distribution: 'random', seed: 42, spread,
  }).appearance({
    color: ({ item }) => item.color,
    size: ({ random }) => 0.006 + random * 0.012,
    // Keep the ring colors legible as density rises.
    opacity: Math.min(0.3, 0.13 * 300000 / Math.max(1, count)),
    shape: 'soft-disc', blending: 'additive',
  }).motion({ speed: ({ item }) => item.speed })
    .simulate({ backend: backendName })
    .named('massive-saturn-rings')
}

export function registerWorkshopGpuOrbits(): () => void {
  return registerParticleBackend(backendName, (program, context) => new WorkshopGpuOrbits(program, context))
}

/** Analytic circular motion: no per-particle JS objects or position uploads during animation. */
export class WorkshopGpuOrbits implements ParticleBackend {
  readonly object = new THREE.Group()
  readonly particleCount: number
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial
  private readonly bounds = new THREE.Box3()
  private disposed = false

  constructor(program: CompiledParticleProgram, context: ParticleBackendContext) {
    const plans = program.emitters.map(emitter => {
      if (emitter.kind !== 'path') throw new TypeError('Workshop GPU orbits require ring paths.')
      const ring = emitter.path.item as OrbitRing
      if (!ring || !rings.some(candidate => candidate.radius === ring.radius)) {
        throw new TypeError('Workshop GPU orbits require the workshop ring recipe.')
      }
      const value = emitter.options.count
      const count = resolveParticleValue(typeof value === 'function'
        ? value({ item: ring, key: emitter.key, index: emitter.emitterIndex, emitterIndex: emitter.emitterIndex })
        : value, context.parameters) ?? 0
      return { emitter, ring, count: Math.max(0, Math.floor(count)) }
    })
    this.particleCount = plans.reduce((total, plan) => total + plan.count, 0)
    const positions = new Float32Array(this.particleCount * 3)
    const orbits = new Float32Array(this.particleCount * 4)
    const colors = new Float32Array(this.particleCount * 3)
    const sizes = new Float32Array(this.particleCount)
    const opacities = new Float32Array(this.particleCount)
    let offset = 0
    let seed = 42
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (const { emitter, ring, count } of plans) {
      const color = new THREE.Color(ring.color)
      const radius = ring.radius + spread
      this.bounds.expandByPoint(new THREE.Vector3(-radius, height - radius * Math.abs(Math.sin(tilt)) - spread, -radius))
      this.bounds.expandByPoint(new THREE.Vector3(radius, height + radius * Math.abs(Math.sin(tilt)) + spread, radius))
      for (let index = 0; index < count; index++, offset++) {
        const phase = random()
        const field: ParticleContext<OrbitRing> = {
          item: ring, key: `${emitter.key}:${index}`, index, emitterIndex: emitter.emitterIndex, random: phase, phase,
        }
        const angle = phase * Math.PI * 2
        const orbitRadius = ring.radius + (random() * 2 - 1) * spread
        const vertical = (random() * 2 - 1) * spread * 0.5
        const speed = resolveParticleField(emitter.motion.speed, field, context.parameters) ?? ring.speed
        orbits.set([orbitRadius, angle, speed / ring.radius, vertical], offset * 4)
        const z = orbitRadius * Math.sin(angle)
        positions.set([orbitRadius * Math.cos(angle), height + z * Math.sin(tilt) + vertical, z * Math.cos(tilt)], offset * 3)
        colors.set([color.r, color.g, color.b], offset * 3)
        sizes[offset] = resolveParticleField(emitter.appearance.size, field, context.parameters) ?? 0.012
        opacities[offset] = resolveParticleField(emitter.appearance.opacity, field, context.parameters) ?? 0.13
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.geometry.setAttribute('orbitData', new THREE.BufferAttribute(orbits, 4))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.geometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1))
    this.geometry.setAttribute('particleOpacity', new THREE.BufferAttribute(opacities, 1))
    this.geometry.boundingBox = this.bounds.clone()
    this.geometry.boundingSphere = this.bounds.getBoundingSphere(new THREE.Sphere())
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { orbitTime: { value: 0 }, pixelRatio: { value: context.pixelRatio },
          ringPlane: { value: new THREE.Vector3(height, Math.sin(tilt), Math.cos(tilt)) } },
      ]),
      vertexShader: `
        attribute vec4 orbitData;
        attribute float particleSize;
        attribute float particleOpacity;
        uniform float orbitTime;
        uniform float pixelRatio;
        uniform vec3 ringPlane;
        varying vec3 vColor;
        varying float vOpacity;
        #include <fog_pars_vertex>
        void main() {
          float angle = orbitData.y + orbitTime * orbitData.z;
          float z = orbitData.x * sin(angle);
          vec3 pos = vec3(orbitData.x * cos(angle), ringPlane.x + z * ringPlane.y + orbitData.w, z * ringPlane.z);
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = max(1.0, particleSize * pixelRatio * 300.0 / max(0.001, -mvPosition.z));
          vColor = color;
          vOpacity = particleOpacity;
          #include <fog_vertex>
        }
      `,
      // Same output contract as the built-in particles, including selected bloom.
      fragmentShader: `
        varying vec3 vColor;
        varying float vOpacity;
        #include <fog_pars_fragment>
        void main() {
          float radius = length(gl_PointCoord - vec2(0.5));
          float coverage = 1.0 - smoothstep(0.12, 0.5, radius);
          if (coverage <= 0.0) discard;
          gl_FragColor = vec4(vColor, vOpacity * coverage);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    })
    const points = new THREE.Points(this.geometry, this.material)
    points.userData.vxParticleAdapter = 'gpu-path'
    points.raycast = () => {} // Decorative million-point clouds never participate in hover scans.
    this.object.name = 'workshop1-gpu-orbits'
    this.object.add(points)
  }

  update(timeSeconds: number): void { this.material.uniforms.orbitTime.value = timeSeconds }
  localBounds(target = new THREE.Box3()): THREE.Box3 { return target.copy(this.bounds) }
  particleHitAt(): undefined { return undefined }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.object.clear()
    this.geometry.dispose()
    this.material.dispose()
  }
}

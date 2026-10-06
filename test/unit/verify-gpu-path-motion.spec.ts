import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { particles } from '@/lib-components/particles/index.js'
import { createParticleBackend, registerParticleBackend } from '@/lib-components/particles/backend.js'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { gpuParticlePosition } from '@/lib-components/particles/compiler/gpuPathMotion.js'
import type { ParticleSource } from '@/lib-components/particles/types.js'
import { ComposerController } from '@/lib-components/three/postprocessing/ComposerController.js'

const context = {
    parameters: {}, pixelRatio: 1,
    resolveTarget: () => ({ center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }),
}
const path = () => particles.path([[0, 0, 0], [1, 0, 0], [1, 0, 3]], {
    count: 1, interpolation: 'linear',
}).motion({ speed: 1 })
const create = (source: ParticleSource = path()) => createParticleBackend(compileParticles(source), context, { gpuPaths: true })
const pointsOf = (backend: ReturnType<typeof create>) => backend.object.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>

describe('GPU connector path motion', () => {
    it('advances only the clock, preserves buffers and conservative bounds, and picks the animated location', () => {
        const backend = create()
        const points = pointsOf(backend)
        const position = points.geometry.getAttribute('position') as THREE.BufferAttribute
        const initial = [...position.array]
        const version = position.version
        const bounds = backend.localBounds()
        const computeBounds = vi.spyOn(points.geometry, 'computeBoundingSphere')
        backend.update(1.5, 0.5)
        expect([...position.array]).toEqual(initial)
        expect(position.version).toBe(version)
        expect(computeBounds).not.toHaveBeenCalled()
        expect(backend.localBounds().equals(bounds)).toBe(true)
        expect(bounds.min.toArray()).toEqual([0, 0, 0])
        expect(bounds.max.toArray()).toEqual([1, 0, 3])
        expect(points.material.uniforms.pathMotionTime.value).toBe(1.5)
        expect(gpuParticlePosition(points, 0)!.toArray()).toEqual([1, 0, 0.5])
        const raycaster = new THREE.Raycaster(new THREE.Vector3(1, 5, 0.5), new THREE.Vector3(0, -1, 0))
        raycaster.params.Points.threshold = 0.01
        const hits = raycaster.intersectObject(points)
        expect(hits).toHaveLength(1)
        expect(hits[0].index).toBe(0)
        points.userData.vxConnectorOutput = true
        expect(raycaster.intersectObject(points)).toHaveLength(0)
        points.userData.vxConnectorOwner = 'owner'
        expect(raycaster.intersectObject(points)).toHaveLength(1)
        expect(backend.particleHitAt(0, points)?.particleIndex).toBe(0)
        expect([...position.array]).toEqual(initial)
        expect(position.version).toBe(version)
        backend.update(4.5, 0.5)
        expect(gpuParticlePosition(points, 0)!.toArray()).toEqual([0.5, 0, 0])
        backend.dispose()
    })

    it('encodes cumulative distances, closes paths, and handles repeated or collapsed vertices', () => {
        const backend = create(particles.path([[2, 1, 0], [2, 1, 0], [5, 1, 0], [5, 1, 4]], {
            count: 1, closed: true, interpolation: 'linear',
        }).motion({ speed: -1 }))
        const points = pointsOf(backend)
        const data = points.material.uniforms.pathMotionTexture.value.image.data
        expect([...data]).toEqual([2, 1, 0, 0, 5, 1, 0, 3, 5, 1, 4, 7, 2, 1, 0, 12])
        backend.update(2.5, 1)
        expect(gpuParticlePosition(points, 0)!.toArray()).toEqual([3.5, 1, 2])
        backend.dispose()
        const collapsed = create(particles.path([[2, 1, 3], [2, 1, 3]], { count: 1, interpolation: 'linear' }))
        collapsed.update(10, 1)
        expect(gpuParticlePosition(pointsOf(collapsed), 0)!.toArray()).toEqual([2, 1, 3])
        expect(pointsOf(collapsed).material.uniforms.pathMotionLength.value).toBe(0)
        collapsed.dispose()
    })

    it('matches CPU seeded fields and spread, including vertical segments', () => {
        const source = particles.path([[0, 0, 0], [0, 3, 0], [2, 3, 0]], {
            count: 8, interpolation: 'linear', distribution: 'random', seed: 'same', spread: 0.3,
        }).motion({ speed: ({ random }) => random - 0.5 }).appearance({ size: ({ random }) => random })
        const gpu = create(source)
        const cpu = createParticleBackend(compileParticles(source), context)
        gpu.update(3, 1)
        cpu.update(3, 1)
        const cpuPositions = pointsOf(cpu).geometry.getAttribute('position')
        for (let index = 0; index < 8; index++) {
            const sampled = gpuParticlePosition(pointsOf(gpu), index)!
            expect(sampled.distanceTo(new THREE.Vector3().fromBufferAttribute(cpuPositions, index))).toBeLessThan(1e-6)
            expect(gpu.localBounds().containsPoint(sampled)).toBe(true)
        }
        expect(pointsOf(gpu).geometry.getAttribute('particleSize').array)
            .toEqual(pointsOf(cpu).geometry.getAttribute('particleSize').array)
        gpu.dispose()
        cpu.dispose()
    })

    it('keeps unsupported emitters on CPU and honors explicit backend selection', () => {
        const sources = [
            path().motion({ turbulence: 0.1 }),
            path().motion({ velocity: [1, 0, 0] }),
            path().motion({ orbit: { speed: 1 } }),
            path().simulate({ forces: [{ type: 'gravity', acceleration: [0, -1, 0] }] }),
            particles.path([[0, 0, 0], [1, 0, 0]], { count: 1, interpolation: 'catmull-rom' }),
            particles.cloud([0, 0, 0], { count: 1 }),
            path().simulate({ backend: 'cpu' }),
        ]
        for (const source of sources) {
            const backend = create(source)
            expect(pointsOf(backend).userData.vxParticleAdapter).toBe('cpu')
            backend.dispose()
        }
        const mixed = create(path().join(particles.cloud([0, 0, 0], { count: 1 }).motion({ velocity: [1, 0, 0] })))
        expect(mixed.object.children.map(object => object.userData.vxParticleAdapter).sort()).toEqual(['cpu', 'gpu-path'])
        mixed.update(1, 1)
        const cloud = mixed.object.children.find(object => object.userData.vxParticleAdapter === 'cpu') as THREE.Points
        expect(cloud.geometry.getAttribute('position').version).toBeGreaterThan(0)
        mixed.dispose()
        const factory = vi.fn(() => createParticleBackend(compileParticles(path()), context))
        const unregister = registerParticleBackend('test-gpu', factory)
        const custom = create(path().simulate({ backend: 'test-gpu' }))
        expect(factory).toHaveBeenCalledOnce()
        custom.dispose()
        unregister()
    })

    it('shares the GPU clock and texture with selected bloom and disposes owned resources once', () => {
        const backend = create()
        const points = pointsOf(backend)
        const source = points.material
        const texture = source.uniforms.pathMotionTexture.value as THREE.DataTexture
        const disposeTexture = vi.spyOn(texture, 'dispose')
        const disposeGeometry = vi.spyOn(points.geometry, 'dispose')
        const disposeMaterial = vi.spyOn(source, 'dispose')
        const renderer = { getPixelRatio: () => 1 } as THREE.WebGLRenderer
        const composer = new ComposerController(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 320, 180)
        const mask = (composer as any).emissionMaterial(source, 0, 1, points) as THREE.ShaderMaterial
        expect(mask.vertexShader).toBe(source.vertexShader)
        expect(mask.uniforms.pathMotionTexture.value).toBe(texture)
        backend.update(2, 1)
        expect(mask.uniforms.pathMotionTime.value).toBe(2)
        composer.destroy()
        expect(disposeTexture).not.toHaveBeenCalled()
        backend.dispose()
        backend.dispose()
        expect(disposeTexture).toHaveBeenCalledOnce()
        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
        expect(gpuParticlePosition(points, 0)).toBeUndefined()
    })
})

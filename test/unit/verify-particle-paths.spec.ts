import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { particles, particleGraphSignature } from '@/lib-components/particles/index.js'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { CpuParticleBackend } from '@/lib-components/particles/compiler/cpuBackend.js'
import { LinearParticlePath } from '@/lib-components/particles/compiler/path.js'

describe('particle path interpolation', () => {
    it('follows unequal straight segments at constant speed through a sharp corner and wraps', () => {
        const source = particles.path([[0, 0, 0], [1, 0, 0], [1, 0, 3]], {
            count: 1,
            interpolation: 'linear',
        }).motion({ speed: 1 })
        const backend = new CpuParticleBackend(compileParticles(source), {
            parameters: {},
            pixelRatio: 1,
            resolveTarget: () => ({ center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }),
        })
        const points = backend.object.children[0] as THREE.Points
        for (const [time, expected] of [
            [0.5, [0.5, 0, 0]],
            [1, [1, 0, 0]],
            [1.5, [1, 0, 0.5]],
            [3.5, [1, 0, 2.5]],
            [4.5, [0.5, 0, 0]],
        ] as const) {
            backend.update(time, 0.5)
            expect([...points.geometry.getAttribute('position').array]).toEqual(expected)
        }
        backend.dispose()
    })

    it('supports closed paths, repeated vertices, and collapsed paths away from the origin', () => {
        const path = new LinearParticlePath([
            new THREE.Vector3(2, 1, 0),
            new THREE.Vector3(2, 1, 0),
            new THREE.Vector3(5, 1, 0),
            new THREE.Vector3(5, 1, 4),
        ], true)
        expect(path.getLength()).toBe(12)
        expect(path.getPointAt(3 / 12).toArray()).toEqual([5, 1, 0])
        expect(path.getTangentAt(3 / 12).toArray()).toEqual([0, 0, 1])
        expect(path.getPointAt(9.5 / 12).toArray()).toEqual([3.5, 1, 2])
        expect(path.getPointAt(1).toArray()).toEqual([2, 1, 0])
        const collapsed = new LinearParticlePath([new THREE.Vector3(2, 1, 3), new THREE.Vector3(2, 1, 3)], true)
        expect(collapsed.getLength()).toBe(0)
        expect(collapsed.getPointAt(0.5).toArray()).toEqual([2, 1, 3])
    })

    it('keeps standalone paths smooth by default and propagates interpolation through paths()', () => {
        const vertices = [[0, 0, 0], [1, 0, 0], [1, 0, 3]] as const
        const smooth = particles.path(vertices, { count: 8 })
        const explicitSmooth = particles.path(vertices, { count: 8, interpolation: 'catmull-rom' })
        const linear = particles.paths([{ key: 'elbow', points: vertices }], { count: 8, interpolation: 'linear' })
        const buffers = [smooth, explicitSmooth, linear].map(source => {
            const backend = new CpuParticleBackend(compileParticles(source), {
                parameters: {}, pixelRatio: 1,
                resolveTarget: () => ({ center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }),
            })
            const buffer = [...(backend.object.children[0] as THREE.Points).geometry.getAttribute('position').array]
            backend.dispose()
            return buffer
        })
        expect(buffers[0]).toEqual(buffers[1])
        expect(buffers[0]).not.toEqual(buffers[2])
        expect(particleGraphSignature(smooth)).not.toBe(particleGraphSignature(explicitSmooth))
    })
})

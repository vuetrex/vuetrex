import { describe, expect, expectTypeOf, it } from 'vitest'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { createParticleBackend } from '@/lib-components/particles/backend.js'
import {
    defineParticleOutputs,
    defineParticles,
    isParticleSource,
    particleGraphSignature,
    particles,
    registerParticleBackend,
    type ParticleSource,
} from '@/lib-components/particles/index.js'

describe('particle graph', () => {
    it('builds the same immutable graph with functional and fluent authoring', () => {
        const functional = particles.named(
            particles.simulate(
                particles.motion(
                    particles.appearance(
                        particles.path([[0, 0, 0], [3, 0, 0]], { count: 20 }),
                        { color: 0x33ccff, size: 0.12 },
                    ),
                    { speed: 1.5, turbulence: 0.04 },
                ),
                { backend: 'cpu', drag: 0.2 },
            ),
            'requests',
        )
        const fluent = particles.path([[0, 0, 0], [3, 0, 0]], { count: 20 })
            .appearance({ color: 0x33ccff, size: 0.12 })
            .motion({ speed: 1.5, turbulence: 0.04 })
            .simulate({ backend: 'cpu', drag: 0.2 })
            .named('requests')

        expect(particleGraphSignature(fluent)).toBe(particleGraphSignature(functional))
        expect(Object.isFrozen(fluent)).toBe(true)
        expect(Object.isFrozen(fluent.parameters)).toBe(true)
        expect(Object.keys(fluent)).not.toContain('appearance')
        expect(Object.getPrototypeOf(fluent)).toBe(Object.getPrototypeOf(particles.cloud([0, 0, 0])))
        expect(isParticleSource(fluent)).toBe(true)
    })

    it('keeps data items available to count and visual fields', () => {
        const metrics = [
            { id: 'api', rate: 4, color: 0xff3355 },
            { id: 'worker', rate: 7, color: 0x33aaff },
        ]
        const source = particles.paths(metrics.map((metric, index) => ({
            key: metric.id,
            item: metric,
            points: [[0, 0, index], [4, 0, index]],
        })), {
            count: item => item.rate,
        }).appearance({
            color: context => context.item.color,
        })

        expectTypeOf(source).toEqualTypeOf<ParticleSource<(typeof metrics)[number]>>()
        const program = compileParticles(source)
        expect(program.emitters).toHaveLength(2)
        expect(program.emitters[0].key).toBe('api')
        expect(program.emitters[0].appearance.color).toBeTypeOf('function')
    })

    it('supports joins, pipes, parameters, and reusable modules', () => {
        const size = particles.param('size', 0.08)
        const module = defineParticles<{ target: string }>('halo', ({ target }) =>
            particles.cloud(target, { count: 32, radius: 'bounds' })
                .appearance({ size }),
        )
        const outputs = defineParticleOutputs('traffic', () => ({
            ingress: particles.path([[0, 0, 0], [1, 0, 0]]),
            egress: particles.path([[1, 0, 0], [2, 0, 0]]),
        }))({})
        const source = module({ target: 'pod-a' })
            .join([outputs.ingress, outputs.output('egress')])
            .pipe(value => value.named('all-effects'))

        expect(compileParticles(source, { size: 0.2 }).emitters).toHaveLength(3)
        expect(() => particles.path([[0, 0, 0]])).toThrow(/at least two points/)
        expect(() => source.pipe(() => null as any)).toThrow(/must return a ParticleSource/)
    })

    it('lets the outermost fluent modifier win', () => {
        const source = particles.cloud([0, 0, 0])
            .appearance({ size: 0.1, color: 0xff0000 })
            .appearance({ size: 0.25 })
        const [emitter] = compileParticles(source).emitters
        expect(emitter.appearance.size).toBe(0.25)
        expect(emitter.appearance.color).toBe(0xff0000)
    })

    it('selects registered execution backends without changing the graph API', () => {
        const source = particles.cloud([0, 0, 0], { count: 1 }).simulate({ backend: 'test-fbo' })
        const program = compileParticles(source)
        const object = new (class extends EventTarget {})() as any
        object.name = 'test-fbo'
        const backend = {
            object,
            particleCount: 1,
            update() {},
            localBounds: () => ({}) as any,
            particleHitAt: () => undefined,
            dispose() {},
        }
        expect(() => createParticleBackend(program, {
            parameters: {},
            pixelRatio: 1,
            resolveTarget: () => ({ center: {} as any, radius: {} as any }),
        })).toThrow(/not registered/)

        const unregister = registerParticleBackend('test-fbo', () => backend)
        expect(createParticleBackend(program, {
            parameters: {},
            pixelRatio: 1,
            resolveTarget: () => ({ center: {} as any, radius: {} as any }),
        })).toBe(backend)
        unregister()
    })
})

import { describe, expect, it } from 'vitest'
import { defineGeometry, geo } from '@/lib-components/geometry/index.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'

describe('procedural geometry modules', () => {
    it('returns a GeometrySource that can enter every higher pipeline', () => {
        const twig = defineGeometry<{ length: number }>('twig', parameters =>
            geo.line({ length: parameters.length, thickness: 0.04 }),
        )
        const graph = geo.randomize(
            geo.distribute(twig({ length: 2 }), {
                pattern: 'line',
                count: 3,
                start: [0, 0, 0],
                end: [3, 0, 0],
            }),
            { seed: 7, scale: [0.9, 1.1] },
        )

        expect(twig.geometryModuleName).toBe('twig')
        expect(evaluateGeometry(graph).records).toHaveLength(3)
    })

    it('supports finite recursive, self-similar factories', () => {
        type Parameters = { depth: number; length: number }
        let branch: ReturnType<typeof defineGeometry<Parameters>>
        branch = defineGeometry<Parameters>('branch', parameters => {
            const stem = geo.line({ length: parameters.length, thickness: 0.03 })
            if (parameters.depth <= 0) return stem
            return geo.boolean([
                stem,
                geo.transform(branch({
                    depth: parameters.depth - 1,
                    length: parameters.length * 0.7,
                }), { translate: [0, parameters.length, 0], rotate: [0, 0, 0.4] }),
            ])
        })

        const prototypes = new GeometryPrototypeRegistry()
        const result = evaluateGeometry(branch({ depth: 3, length: 1 }), prototypes)
        expect(result.records).toHaveLength(4)
        prototypes.dispose()
    })

    it('rejects factories that do not return geometry', () => {
        const invalid = defineGeometry('invalid', (() => ({ nope: true })) as any)
        expect(() => invalid({})).toThrow(/did not return a GeometrySource/)
    })
})


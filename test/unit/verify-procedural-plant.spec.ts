import { describe, expect, it } from 'vitest'
import { geo } from '@/lib-components/geometry/index.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { branch, stem, tree, twig } from '../../demo/geometry/plant.js'

function recordCount(source: Parameters<typeof evaluateGeometry>[0]): number {
    const prototypes = new GeometryPrototypeRegistry()
    const count = evaluateGeometry(source, prototypes).records.length
    prototypes.dispose()
    return count
}

describe('procedural plant geometry library', () => {
    it('keeps every module independently renderable and composable', () => {
        expect(recordCount(stem({ length: 2, radius: 0.1 }))).toBe(1)
        expect(recordCount(twig({
            length: 1,
            radius: 0.04,
            leafCount: 4,
            leafSize: 0.1,
            seed: 1,
        }))).toBe(5)
        expect(recordCount(branch({
            length: 2,
            radius: 0.08,
            twigCount: 3,
            leafCount: 4,
            leafSize: 0.1,
            seed: 2,
        }))).toBe(16)

        const completeTree = tree({
            height: 4,
            trunkRadius: 0.15,
            branchCount: 5,
            branchLength: 1.6,
            twigCount: 3,
            leafCount: 4,
            leafSize: 0.1,
            spread: 0.8,
            seed: 3,
        })
        expect(recordCount(completeTree)).toBe(84)
        expect(recordCount(geo.transform(
            geo.randomize(completeTree, { seed: 9, rotation: [0.02, 0.05, 0.02] }),
            { translate: [1, 0, 0] },
        ))).toBe(84)
    })
})


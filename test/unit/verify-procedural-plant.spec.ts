import { describe, expect, it } from 'vitest'
import { geo } from '@/lib-components/geometry/index.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { tree } from '../../demo/geometry/plant.js'

const parameters = {
    height: 4,
    trunkRadius: 0.15,
    branchCount: 5,
    branchLength: 1.6,
    forkCount: 2,
    leafCount: 4,
    leafSize: 0.1,
    spread: 0.8,
    seed: 3,
}

describe('self-similar procedural plant', () => {
    it('reuses one branch through every recursive level', () => {
        const prototypes = new GeometryPrototypeRegistry()
        const records = evaluateGeometry(tree(parameters), prototypes).records

        // At four levels, every top-level branch has 15 stems and 32 leaves.
        expect(records.filter(record => record.materialKey === 'bark')).toHaveLength(76)
        expect(records.filter(record => record.materialKey === 'foliage')).toHaveLength(160)
        expect(new Set(records.map(record => record.materialKey))).toEqual(new Set(['bark', 'foliage']))

        const transformed = geo.transform(tree(parameters), { translate: [1, 0, 0] })
        expect(evaluateGeometry(transformed, prototypes).records).toHaveLength(236)
        prototypes.dispose()
    })
})

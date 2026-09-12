import { describe, expect, it } from 'vitest'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { quads } from '../../demo/geometry/quads.js'

describe('recursive quads', () => {
    it('grows five children from every cube for five levels', () => {
        const prototypes = new GeometryPrototypeRegistry()
        const records = evaluateGeometry(quads({ size: 1 }), prototypes).records

        // 1 + 5 + 25 + 125 + 625 cubes, connected by one pipe per child.
        expect(records.filter(record => record.materialKey === 'cube')).toHaveLength(781)
        expect(records.filter(record => record.materialKey === 'pipe')).toHaveLength(780)
        prototypes.dispose()
    })
})

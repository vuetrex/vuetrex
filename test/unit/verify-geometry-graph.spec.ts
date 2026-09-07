import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
    GEOMETRY_GRAPH_NODE,
    type GeometrySource,
} from '@/lib-components/geometry/types.js'
import { geometryGraphSignature } from '@/lib-components/geometry/graph.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import { geo } from '@/lib-components/geometry/index.js'

function boundsOf(source: GeometrySource) {
    const prototypes = new GeometryPrototypeRegistry()
    const set = evaluateGeometry(source, prototypes)
    const bounds = geometrySetBounds(set)
    prototypes.dispose()
    return bounds
}

describe('procedural geometry graph', () => {
    it('creates immutable, reusable graph descriptions with named inputs', () => {
        const source = geo.box({ width: 2, key: 'unit-box' })
        const transformed = geo.transform(source, { translate: [1, 2, 3] })

        expect(Object.isFrozen(source)).toBe(true)
        expect(Object.isFrozen(source.parameters)).toBe(true)
        expect(transformed.inputs.geometry).toBe(source)
        expect(geometryGraphSignature(transformed)).toContain('transform')
    })

    it('rejects cyclic object graphs with an actionable error', () => {
        const cyclic: any = {
            [GEOMETRY_GRAPH_NODE]: true,
            kind: 'cycle',
            parameters: {},
            inputs: {},
        }
        cyclic.inputs.geometry = cyclic
        expect(() => geometryGraphSignature(cyclic)).toThrow(/Cyclic procedural geometry graph/)
    })

    it('realizes line, pipe, plane, box, and icosphere primitives', () => {
        const thin = evaluateGeometry(geo.line({ length: 2 }))
        const pipe = evaluateGeometry(geo.line({ length: 2, thickness: 0.1 }))
        expect(thin.records[0].prototype.topology).toBe('line')
        expect(pipe.records[0].prototype.topology).toBe('mesh')

        const planeBounds = boundsOf(geo.plane({ width: 4, depth: 2 }))
        const planeSize = planeBounds.getSize(new THREE.Vector3())
        expect(planeSize.x).toBeCloseTo(4)
        expect(planeSize.y).toBeCloseTo(0)
        expect(planeSize.z).toBeCloseTo(2)

        const boxBounds = boundsOf(geo.box({ width: 2, height: 3, depth: 4 }))
        expect(boxBounds.getSize(new THREE.Vector3()).toArray()).toEqual([2, 3, 4])

        const sphereBounds = boundsOf(geo.icosphere({ radius: 2, detail: 1 }))
        const sphereSize = sphereBounds.getSize(new THREE.Vector3())
        expect(sphereSize.x).toBeGreaterThan(3)
        expect(sphereSize.y).toBeGreaterThan(3)
        expect(sphereSize.z).toBeGreaterThan(3)
    })
})

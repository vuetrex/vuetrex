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
import { defineGeometryOutputs, geo, isGeometrySource } from '@/lib-components/geometry/index.js'

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

    it('builds equivalent immutable graphs with fluent source methods', () => {
        const functional = geo.named(
            geo.randomize(
                geo.material(
                    geo.parameterMap(
                        geo.distribute(
                            geo.transform(geo.box({ width: 1, height: 2, depth: 1 }), {
                                translate: [0, 1, 0],
                            }),
                            { points: [[0, 0, 0], [2, 0, 0]] },
                        ),
                        { scale: 0.75, color: 0x336699 },
                    ),
                    'accent',
                ),
                { seed: 4, scale: 1 },
            ),
            'units',
        )
        const fluent = geo.box({ width: 1, height: 2, depth: 1 })
            .transform({ translate: [0, 1, 0] })
            .distribute({ points: [[0, 0, 0], [2, 0, 0]] })
            .parameterMap({ scale: 0.75, color: 0x336699 })
            .material('accent')
            .randomize({ seed: 4, scale: 1 })
            .named('units')

        expect(geometryGraphSignature(fluent)).toBe(geometryGraphSignature(functional))
        expect(Object.isFrozen(fluent)).toBe(true)
        expect(Object.keys(fluent)).not.toContain('transform')
        expect(Object.getPrototypeOf(fluent)).toBe(Object.getPrototypeOf(geo.box()))
        expect(isGeometrySource(fluent)).toBe(true)
        expect(evaluateGeometry(fluent).records).toHaveLength(2)
    })

    it('supports fluent joins, custom pipes, modules, and item-domain inference', () => {
        const pods = [
            { id: 'pod-a', x: 0 },
            { id: 'pod-b', x: 2 },
        ]
        const podGeometry = geo.box({ width: 0.5 })
            .distribute({
                items: pods,
                keyBy: 'id',
                position: ({ item: pod }) => [pod.x, 0, 0],
            })
            .parameterMap({
                color: context => context.item.id === 'pod-a' ? 0x00ff00 : 0xff0000,
            })
        const graph = podGeometry
            .join(geo.icosphere({ radius: 0.25 }).transform({ translate: [4, 0, 0] }), { key: 'assembly' })
            .pipe(source => source.named('fluent-result'))

        expect(evaluateGeometry(graph).records).toHaveLength(3)
        expect(graph.kind).toBe('named')
        expect((graph.inputs.geometry as GeometrySource).key).toBe('assembly')

        const parts = defineGeometryOutputs('fluent.parts', () => ({ core: geo.box() }))({})
        expect(parts.core.transform({ scale: 2 }).kind).toBe('transform')
        expect(() => geo.box().pipe(() => null as any)).toThrow(/must return a GeometrySource/)
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

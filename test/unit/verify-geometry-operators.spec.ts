import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { geo } from '@/lib-components/geometry/index.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'

function evaluate(source: Parameters<typeof evaluateGeometry>[0]) {
    const prototypes = new GeometryPrototypeRegistry()
    const result = evaluateGeometry(source, prototypes)
    return { result, dispose: () => prototypes.dispose() }
}

function positionOf(matrix: THREE.Matrix4): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(matrix)
}

describe('procedural geometry operators', () => {
    it('composes outer transforms without mutating shared inputs', () => {
        const source = geo.box()
        const left = evaluateGeometry(geo.transform(source, { translate: [-2, 0, 0] }))
        const right = evaluateGeometry(geo.transform(source, { translate: [2, 0, 0] }))
        const original = evaluateGeometry(source)

        expect(positionOf(left.records[0].matrix).x).toBe(-2)
        expect(positionOf(right.records[0].matrix).x).toBe(2)
        expect(positionOf(original.records[0].matrix).x).toBe(0)
    })

    it('combines complete streams while keeping their prototype identity', () => {
        const shared = geo.box()
        const { result, dispose } = evaluate(geo.join([
            geo.transform(shared, { translate: [-1, 0, 0] }),
            geo.transform(shared, { translate: [1, 0, 0] }),
        ]))
        expect(result.records).toHaveLength(2)
        expect(result.records[0].prototype).toBe(result.records[1].prototype)
        expect(result.records[0].key).not.toBe(result.records[1].key)
        dispose()
    })

    it('distributes a multi-record subgraph and preserves stable item context', () => {
        const sprout = geo.join([
            geo.box({ key: 'stem' }),
            geo.icosphere({ key: 'leaf' }),
        ])
        const items = [
            { id: 'a', position: [0, 0, 0] as const },
            { id: 'b', position: [2, 0, 0] as const },
        ]
        const { result, dispose } = evaluate(geo.distribute(sprout, {
            items,
            keyBy: 'id',
            position: ({ item }) => item.position,
        }))

        expect(result.records).toHaveLength(4)
        expect(result.records.filter(record => record.context.item === items[1])).toHaveLength(2)
        expect(result.records.some(record => record.key.includes('/b/'))).toBe(true)
        dispose()
    })

    it('maps item fields to local scale, color, and visibility', () => {
        const items = [
            { id: 'short', size: 1, color: 0x112233, visible: true },
            { id: 'tall', size: 2, color: 0x445566, visible: false },
        ]
        const graph = geo.parameterMap(
            geo.distribute(geo.box(), {
                items,
                keyBy: 'id',
                position: ({ index }) => [index * 3, 0, 0],
            }),
            {
                scale: ({ item }) => item.size,
                color: ({ item }) => item.color,
                visible: ({ item }) => item.visible,
            },
        )
        const { result, dispose } = evaluate(graph)
        const scale = new THREE.Vector3()
        result.records[1].matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
        expect(scale.toArray()).toEqual([2, 2, 2])
        expect(result.records[0].color.getHex()).toBe(0x112233)
        expect(result.records[1].visible).toBe(false)
        dispose()
    })

    it('maps and randomizes a distributed multi-record module as one coherent domain', () => {
        const pair = geo.join([
            geo.box({ key: 'left' }),
            geo.transform(geo.box({ key: 'right' }), { translate: [2, 0, 0] }),
        ])
        const graph = geo.randomize(
            geo.parameterMap(
                geo.distribute(pair, { points: [[5, 0, 0]] }),
                { scale: 2 },
            ),
            { seed: 9, translate: [0.5, 0, 0] },
        )
        const { result, dispose } = evaluate(graph)
        const positions = result.records.map(record => positionOf(record.matrix))

        expect(positions[1].x - positions[0].x).toBeCloseTo(4)
        expect(positions[1].y).toBeCloseTo(positions[0].y)
        expect(positions[1].z).toBeCloseTo(positions[0].z)
        expect(result.records[0].context.domainKey).toBe(result.records[1].context.domainKey)
        dispose()
    })

    it('keeps keyed random values stable across reorder and channels independent', () => {
        const makeGraph = (items: readonly { id: string }[], withColor: boolean) =>
            geo.randomize(
                geo.distribute(geo.box(), {
                    items,
                    keyBy: 'id',
                    position: () => [0, 0, 0],
                }),
                {
                    seed: 'garden',
                    translate: [1, 0, 0],
                    scale: [0.8, 1.2],
                    ...(withColor ? { color: [0x004400, 0x88ff88] as const } : {}),
                },
            )
        const original = evaluateGeometry(makeGraph([{ id: 'a' }, { id: 'b' }], false))
        const reordered = evaluateGeometry(makeGraph([{ id: 'b' }, { id: 'a' }], true))
        const byItem = (records: typeof original.records) => new Map(records.map(record => [
            (record.context.item as { id: string }).id,
            record.matrix.elements,
        ]))

        expect(byItem(reordered.records).get('a')).toEqual(byItem(original.records).get('a'))
        expect(byItem(reordered.records).get('b')).toEqual(byItem(original.records).get('b'))
    })

    it('samples a surface deterministically and aligns records to its domain', () => {
        const graph = geo.distribute(geo.icosphere({ radius: 0.05 }), {
            pattern: 'surface',
            surface: geo.plane({ width: 4, depth: 2 }),
            count: 12,
            seed: 19,
            align: 'normal',
        })
        const first = evaluateGeometry(graph)
        const second = evaluateGeometry(graph)
        expect(first.records).toHaveLength(12)
        expect(first.records.map(record => record.matrix.elements)).toEqual(
            second.records.map(record => record.matrix.elements),
        )
        for (const record of first.records) {
            expect(record.context.position.x).toBeGreaterThanOrEqual(-2)
            expect(record.context.position.x).toBeLessThanOrEqual(2)
            expect(record.context.position.z).toBeGreaterThanOrEqual(-1)
            expect(record.context.position.z).toBeLessThanOrEqual(1)
            expect(record.context.position.y).toBeCloseTo(0)
            expect(record.context.normal?.y).toBeGreaterThan(0.99)
        }
    })
})

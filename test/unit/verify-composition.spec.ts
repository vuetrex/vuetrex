import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
    aggregate,
    compose,
    encode,
    groupBy,
    operatorCatalog,
    radialFocus,
    ring,
    row,
    sphere,
    type RepresentationRecipe,
} from '@/lib-components/composition/index.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

describe('representation recipes', () => {
    it('executes select, aggregate, arrange, and emit in order', () => {
        const phases: string[] = []
        const recipe: RepresentationRecipe<number[], number[], number[], number> = {
            select(data) { phases.push('select'); return data.filter(n => n > 1) },
            aggregate(data) { phases.push('aggregate'); return data },
            arrange(data, context) { phases.push('arrange'); return row(data, context, { gap: 2 }) },
            emit(data, placements) {
                phases.push('emit')
                return encode(data, placements, { id: n => String(n), representation: 'number' })
            },
            capabilities: [{ type: 'select', target: 'node' }],
        }

        const result = compose(recipe, [1, 2, 3])

        expect(phases).toEqual(['select', 'aggregate', 'arrange', 'emit'])
        expect(result.fragment.nodes.map(node => node.id)).toEqual(['2', '3'])
        expect(result.fragment.nodes.map(node => node.placement.position.x)).toEqual([-1, 1])
        expect(result.capabilities).toEqual([{ type: 'select', target: 'node' }])
    })

    it('provides concise collection and spatial operators', () => {
        const groups = groupBy([
            { team: 'a', value: 2 },
            { team: 'b', value: 4 },
            { team: 'a', value: 3 },
        ], item => item.team)

        expect(groups.map(group => [group.key, group.items.length])).toEqual([['a', 2], ['b', 1]])
        expect(aggregate(groups[0].items, (sum, item) => sum + item.value, 0)).toBe(5)
        expect(ring(groups, {}, { radius: 2 })).toHaveLength(2)
        expect(operatorCatalog.map(operator => operator.name)).toContain('bundleBy')
        expect(operatorCatalog.map(operator => operator.name)).not.toContain('lod')
    })

    it('normal-aligns sphere placements', () => {
        const placements = sphere(['a', 'b', 'c', 'd'], {}, { radius: 3 })

        placements.forEach(item => {
            expect(item.position.length()).toBeCloseTo(3)
            const normal = item.position.clone().normalize()
            const orientedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(item.orientation)
            expect(orientedUp.distanceTo(normal)).toBeLessThan(1e-6)
        })
    })

    it('places a selected item at the centre, neighbours inside, and remaining context outside', () => {
        const items = [
            { id: 'gateway' },
            { id: 'catalog' },
            { id: 'orders' },
            { id: 'payments' },
            { id: 'events' },
        ]
        const placements = radialFocus(items, { selectedId: 'orders' }, {
            id: item => item.id,
            relations: [
                { from: 'gateway', to: 'orders' },
                { from: 'orders', to: 'payments' },
                { from: 'catalog', to: 'events' },
            ],
            innerRadius: 2,
            outerRadius: 4,
            centerScale: new THREE.Vector3(1.3, 1.3, 1.3),
            innerScale: new THREE.Vector3(1, 1, 1),
            outerScale: new THREE.Vector3(0.75, 0.75, 0.75),
        })

        expect(placements).toHaveLength(items.length)
        expect(placements[2].position.length()).toBeCloseTo(0)
        expect(placements[2].scale.toArray()).toEqual([1.3, 1.3, 1.3])
        expect(placements[0].position.length()).toBeCloseTo(2)
        expect(placements[3].position.length()).toBeCloseTo(2)
        expect(placements[1].position.length()).toBeCloseTo(4)
        expect(placements[4].position.length()).toBeCloseTo(4)
        expect(operatorCatalog.map(operator => operator.name)).toContain('radialFocus')
    })

    it('falls back to an overview ring without a valid selection', () => {
        const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        const placements = radialFocus(items, { selectedId: 'missing' }, {
            id: item => item.id,
            relations: [],
            outerRadius: 3,
        })

        placements.forEach(item => expect(item.position.length()).toBeCloseTo(3))
    })
})

describe('GroupNode placement bridge', () => {
    it('applies a recipe placement and opts out of parent layout', async () => {
        const scene = new THREE.Scene()
        const update = vi.fn()
        const stage = {
            boxDistance: 1,
            gap: 1,
            getScene: () => scene,
            connectors: { update, remove: () => [] },
        } as unknown as VuetrexStage
        const parent = new GroupNode(stage)
        const child = new GroupNode(stage)
        parent.appendChild(child)
        const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
        child.setStateValue('placement', {
            position: new THREE.Vector3(2, 3, 4),
            orientation,
            scale: new THREE.Vector3(2, 1, 0.5),
        })

        child.syncWithThree()
        await nextTick()

        expect(child.participatesInLayout()).toBe(false)
        expect(parent.elements.value).not.toContain(child)
        expect(child.group.position.toArray()).toEqual([2, 3, 4])
        expect(child.group.quaternion.angleTo(orientation)).toBeCloseTo(0)
        expect(child.group.scale.toArray()).toEqual([2, 1, 0.5])
        expect(update).toHaveBeenCalled()
    })
})

import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
    horizontalLayout, depthLayout, stackLayout, ringLayout, gridLayout, layoutWithDirection,
} from '@/lib-components/nodes/layouts.js'

const unit = () => new Vector3(1, 0.5, 1)

describe('horizontalLayout', () => {
    it('measures total width = sum of widths + gaps', () => {
        const m = horizontalLayout.measure([unit(), unit(), unit()], 0.5)
        expect(m.x).toBeCloseTo(4, 6)   // 3*1 + 2*0.5
        expect(m.y).toBeCloseTo(0.5, 6)
        expect(m.z).toBeCloseTo(1, 6)
    })
    it('places children symmetric about origin on X', () => {
        const c = [unit(), unit(), unit()]
        const xs = c.map((_, i) => horizontalLayout.place(i, c, 0.5).x)
        expect(xs).toEqual([-1.5, 0, 1.5].map(v => expect.closeTo(v, 6)))
        c.forEach((_, i) => {
            expect(horizontalLayout.place(i, c, 0.5).y).toBeCloseTo(0, 6)
            expect(horizontalLayout.place(i, c, 0.5).z).toBeCloseTo(0, 6)
        })
    })
})

describe('depthLayout', () => {
    it('places children symmetric about origin on Z, X=0', () => {
        const c = [unit(), unit(), unit()]
        const zs = c.map((_, i) => depthLayout.place(i, c, 0.5).z)
        expect(zs).toEqual([-1.5, 0, 1.5].map(v => expect.closeTo(v, 6)))
        c.forEach((_, i) => expect(depthLayout.place(i, c, 0.5).x).toBeCloseTo(0, 6))
    })
})

describe('stackLayout', () => {
    it('stacks bases by cumulative height + gap', () => {
        const c = [new Vector3(1, 0.5, 1), new Vector3(1, 0.33, 1), new Vector3(1, 0.75, 1)]
        expect(stackLayout.place(0, c, 0.2).y).toBeCloseTo(0, 6)
        expect(stackLayout.place(1, c, 0.2).y).toBeCloseTo(0.7, 6)    // 0.5 + 0.2
        expect(stackLayout.place(2, c, 0.2).y).toBeCloseTo(1.23, 6)   // 0.5 + 0.33 + 0.4
        expect(stackLayout.measure(c, 0.2).y).toBeCloseTo(1.98, 6)    // 1.58 + 0.4
    })
})

describe('linear layout direction', () => {
    it('reverses child order without mismatching unequal footprints', () => {
        const children = [
            new Vector3(1, 0.5, 1),
            new Vector3(2, 0.5, 1),
            new Vector3(3, 0.5, 1),
        ]
        const reverse = layoutWithDirection(horizontalLayout, 'reverse')

        expect(reverse.measure(children, 0.5)).toEqual(horizontalLayout.measure(children, 0.5))
        expect(children.map((_, index) => reverse.place(index, children, 0.5).x))
            .toEqual([3, 1, -2])
    })

    it('returns the original layout for normal direction', () => {
        expect(layoutWithDirection(stackLayout, 'normal')).toBe(stackLayout)
    })
})

describe('gridLayout', () => {
    it('centers a single child', () => {
        const c = [unit()]
        const p = gridLayout.place(0, c, 0.5)
        expect(p.x).toBeCloseTo(0, 6)
        expect(p.z).toBeCloseTo(0, 6)
    })
    it('lays four children into a 2x2 grid', () => {
        const c = [unit(), unit(), unit(), unit()]
        const xs = [...new Set(c.map((_, i) => +gridLayout.place(i, c, 0.5).x.toFixed(6)))].sort((a, b) => a - b)
        const zs = [...new Set(c.map((_, i) => +gridLayout.place(i, c, 0.5).z.toFixed(6)))].sort((a, b) => a - b)
        expect(xs).toEqual([-0.75, 0.75])
        expect(zs).toEqual([-0.75, 0.75])
    })
})

describe('ringLayout', () => {
    it('places N=4 children on a circle of equal radius and equal angular step', () => {
        const c = [unit(), unit(), unit(), unit()]
        const ps = c.map((_, i) => ringLayout.place(i, c, 0.5))
        const radii = ps.map(p => Math.hypot(p.x, p.z))
        radii.forEach(r => { expect(r).toBeCloseTo(radii[0], 6); expect(r).toBeGreaterThan(0) })
        ps.forEach(p => expect(p.y).toBeCloseTo(0, 6))
    })

    it('startAngle=90 places the first child on +X', () => {
        const c = [unit(), unit(), unit(), unit()]
        const p = ringLayout.withOptions({ startAngle: 90 }).place(0, c, 0.5)
        expect(p.x).toBeGreaterThan(0)
        expect(p.z).toBeCloseTo(0, 6)
    })

    it('direction=reverse reverses the angular sweep', () => {
        const c = [unit(), unit(), unit(), unit()]
        const normal = ringLayout.withOptions({ direction: 'normal' }).place(1, c, 0.5)
        const reverse = ringLayout.withOptions({ direction: 'reverse' }).place(1, c, 0.5)
        expect(reverse.x).toBeCloseTo(-normal.x, 6)
        expect(reverse.z).toBeCloseTo(normal.z, 6)
    })

    it('explicit defaults reproduce the legacy placement', () => {
        const c = [unit(), unit(), unit(), unit()]
        const configured = ringLayout.withOptions({ startAngle: 0, direction: 'normal' })
        c.forEach((_, index) => {
            expect(configured.place(index, c, 0.5)).toEqual(ringLayout.place(index, c, 0.5))
        })
    })
})

describe('empty containers', () => {
    it('measure and place return the zero vector', () => {
        for (const L of [horizontalLayout, depthLayout, stackLayout, ringLayout, gridLayout]) {
            expect(L.measure([], 0.5)).toEqual(new Vector3(0, 0, 0))
            expect(L.place(0, [], 0.5)).toEqual(new Vector3(0, 0, 0))
        }
    })
})

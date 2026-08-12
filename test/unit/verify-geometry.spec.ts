/**
 * Spec: layout and geometry calculations for all node types.
 *
 * Tests are split into three layers:
 *  1. Layout maths   — layoutPositionOf() for Ring, Stack, Row, Layer, GroupNode(grid).
 *  2. THREE geometry — modelGen() output: bounding-box centering and symmetry.
 *  3. Integration    — position propagated through renderMesh() correctly.
 *
 * The critical invariant for animations (hover-scale, entrance slide) is that
 * each shape's geometry centroid sits at (0,0,0) in its mesh's local space.
 * GSAP targets mesh.position / mesh.scale, so both pivot from the local origin.
 * If the centroid is displaced the scale will visually "fly" toward/away from
 * the wrong point.
 */

import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { Ring }     from '@/lib-components/nodes/Ring.js'
import { Stack }    from '@/lib-components/nodes/Stack.js'
import { Row }      from '@/lib-components/nodes/Row.js'
import { Layer }    from '@/lib-components/nodes/Layer.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { Box }      from '@/lib-components/nodes/shapes/Box.js'
import { Cylinder } from '@/lib-components/nodes/shapes/Cylinder.js'
import { Wedge }    from '@/lib-components/nodes/shapes/Wedge.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

// ── Mock stage ─────────────────────────────────────────────────────────────────
// Only the properties consumed by layoutPositionOf and modelGen are needed.
// VuetrexStage is not instantiated (requires a DOM/WebGL context).
const mockScene = new THREE.Scene()
const mockStage = {
    boxRadius: 1.3,
    boxDistance: 1.5,
    gap: 1.5,
    createElementMaterial: () => new THREE.MeshStandardMaterial(),
    renderMesh: () => {},
    removeObject: () => {},
    getScene: () => mockScene,
    connect: () => {},
    unregisterConnection: () => {},
    reconcileConnections: () => {},
    connectors: {
        update: () => {},
        remove: () => [],
    },
} as unknown as VuetrexStage

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Average position of all vertices — more stable than bounding-box centre
 *  for irregular shapes like arcs. */
function vertexCentroid(geo: THREE.BufferGeometry): THREE.Vector3 {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const c = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
        c.x += pos.getX(i)
        c.y += pos.getY(i)
        c.z += pos.getZ(i)
    }
    return c.divideScalar(pos.count)
}

/** Bounding-box centre — used for symmetric shapes (Box, Cylinder). */
function bboxCentre(geo: THREE.BufferGeometry): THREE.Vector3 {
    geo.computeBoundingBox()
    const c = new THREE.Vector3()
    geo.boundingBox!.getCenter(c)
    return c
}

function meshGeo(obj: THREE.Object3D): THREE.BufferGeometry {
    return (obj as THREE.Mesh).geometry
}

// ── 1. Ring.layoutPositionOf ───────────────────────────────────────────────────

describe('Ring.layoutPositionOf', () => {

    function buildRing(n: number) {
        const ring = new Ring(mockStage)
        const wedges = Array.from({ length: n }, () => {
            const w = new Wedge(mockStage)
            ring.appendChild(w)
            return w
        })
        return { ring, wedges }
    }

    it('all children have the same Y (elevation) coordinate', () => {
        const { ring, wedges } = buildRing(4)
        const ys = wedges.map(w => ring.layoutPositionOf(w).y)
        ys.forEach(y => expect(y).toBeCloseTo(ys[0], 6))
    })

    it('N=3: children form an equilateral triangle (equidistant from each other)', () => {
        const { ring, wedges } = buildRing(3)
        const [p0, p1, p2] = wedges.map(w => ring.layoutPositionOf(w))
        const d01 = p0.distanceTo(p1)
        const d12 = p1.distanceTo(p2)
        const d20 = p2.distanceTo(p0)
        expect(d01).toBeCloseTo(d12, 4)
        expect(d12).toBeCloseTo(d20, 4)
    })

    it('N=4: adjacent children are separated by equal arc lengths', () => {
        const { ring, wedges } = buildRing(4)
        const ps = wedges.map(w => ring.layoutPositionOf(w))
        const dists = ps.map((p, i) => p.distanceTo(ps[(i + 1) % 4]))
        dists.forEach(d => expect(d).toBeCloseTo(dists[0], 4))
    })

    it('all children lie on a circle (equidistant from the ring centre)', () => {
        const { ring, wedges } = buildRing(5)
        const ps = wedges.map(w => ring.layoutPositionOf(w))
        // The ring centre is the XZ centroid of all positions.
        const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length
        const cz = ps.reduce((s, p) => s + p.z, 0) / ps.length
        const radii  = ps.map(p => new THREE.Vector2(p.x - cx, p.z - cz).length())
        radii.forEach(r => expect(r).toBeCloseTo(radii[0], 4))
        // Confirm each child is not collapsed on the centre (ring has a non-zero radius)
        expect(radii[0]).toBeGreaterThan(0)
    })

    it('angular step between consecutive children is 2π/N', () => {
        const N = 6
        const { ring, wedges } = buildRing(N)
        const ps   = wedges.map(w => ring.layoutPositionOf(w))
        const cx   = ps.reduce((s, p) => s + p.x, 0) / N
        const cz   = ps.reduce((s, p) => s + p.z, 0) / N
        const angles = ps.map(p => Math.atan2(p.x - cx, p.z - cz))
        // Wrap to [0, 2π) and sort to get consistent ordering
        const sorted = angles.map(a => (a + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b)
        const steps  = sorted.map((a, i) => sorted[(i + 1) % N] - a + (i === N - 1 ? Math.PI * 2 : 0))
        const expected = (Math.PI * 2) / N
        steps.forEach(s => expect(s).toBeCloseTo(expected, 3))
    })

    it('reacts to startAngle and direction state changes', () => {
        const { ring, wedges } = buildRing(4)
        ring.setStateValue('start-angle', '90')
        const rotated = ring.layoutPositionOf(wedges[0])
        expect(rotated.x).toBeGreaterThan(0)
        expect(rotated.z).toBeCloseTo(0, 6)

        ring.setStateValue('startAngle', 0)
        ring.setStateValue('direction', 'reverse')
        const reverse = ring.layoutPositionOf(wedges[1])
        expect(reverse.x).toBeLessThan(0)
        expect(reverse.z).toBeCloseTo(0, 6)
    })

    it('does not change radius when angular gap-ratio changes', () => {
        const noGap = buildRing(3)
        noGap.ring.setStateValue('gap', 0)
        const noGapRadius = noGap.ring.layoutPositionOf(noGap.wedges[0]).length()

        const ratioGap = buildRing(3)
        ratioGap.ring.setStateValue('gap-ratio', 0.25)
        const ratioGapRadius = ratioGap.ring.layoutPositionOf(ratioGap.wedges[0]).length()

        expect(ratioGapRadius).toBeCloseTo(noGapRadius, 6)
    })
})

// ── 2. Stack.layoutPositionOf ─────────────────────────────────────────────────

describe('Stack.layoutPositionOf', () => {

    it('children are stacked upward: each Y is greater than the previous', () => {
        const stack = new Stack(mockStage)
        const heights = [0.5, 0.33, 0.75]
        const nodes = heights.map(h => {
            const w = new Wedge(mockStage)
            w.setHeight(h)
            stack.appendChild(w)
            return w
        })
        const ys = nodes.map(n => stack.layoutPositionOf(n).y)
        expect(ys[1]).toBeGreaterThan(ys[0])
        expect(ys[2]).toBeGreaterThan(ys[1])
    })

    it('all children share the same X and Z position within a stack', () => {
        const stack = new Stack(mockStage)
        const nodes = [new Box(mockStage), new Box(mockStage), new Box(mockStage)]
        nodes.forEach(n => stack.appendChild(n))
        const ps = nodes.map(n => stack.layoutPositionOf(n))
        ps.forEach(p => {
            expect(p.x).toBeCloseTo(ps[0].x, 5)
            expect(p.z).toBeCloseTo(ps[0].z, 5)
        })
    })
})

// ── 3. Row / Layer / default grid layouts ───────────────────────────────────

describe('Row.layoutPositionOf', () => {

    it('sibling boxes in a row are evenly spaced along the X axis', () => {
        const row   = new Row(mockStage)
        const boxes = [new Box(mockStage), new Box(mockStage), new Box(mockStage)]
        boxes.forEach(b => row.appendChild(b))

        const ps = boxes.map(b => row.layoutPositionOf(b))
        const dx = ps[1].x - ps[0].x
        expect(ps[2].x - ps[1].x).toBeCloseTo(dx, 5)
        ps.forEach(p => expect(p.z).toBeCloseTo(ps[0].z, 5))
    })

    it('align-x="start" shifts a child left of its slot center', () => {
        const row = new Row(mockStage)
        const box = new Box(mockStage)
        row.appendChild(box)
        row.setStateValue('align-x', 'start')

        expect(row.layoutPositionOf(box).x).toBeCloseTo(-0.5, 5)
    })
})

describe('Stack alignment', () => {
    it('align-z="end" shifts a child toward +Z inside its slot', () => {
        const stack = new Stack(mockStage)
        const box = new Box(mockStage)
        stack.appendChild(box)
        stack.setStateValue('align-z', 'end')

        expect(stack.layoutPositionOf(box).z).toBeCloseTo(0.5, 5)
    })
})

describe('Layer.layoutPositionOf', () => {

    it('children in a layer are distributed along Z at equal intervals', () => {
        const layer = new Layer(mockStage)
        const row0  = new Row(mockStage)
        const row1  = new Row(mockStage)
        const row2  = new Row(mockStage)
        layer.appendChild(row0)
        layer.appendChild(row1)
        layer.appendChild(row2)

        const ps = [row0, row1, row2].map(row => layer.layoutPositionOf(row))
        const dz = ps[1].z - ps[0].z
        expect(ps[2].z - ps[1].z).toBeCloseTo(dz, 5)
        ps.forEach(p => expect(p.x).toBeCloseTo(ps[0].x, 5))
    })
})

describe('GroupNode.layoutPositionOf (default grid layout)', () => {

    it('four children occupy a 2x2 XZ grid', () => {
        const group = new GroupNode(mockStage)
        const boxes = [new Box(mockStage), new Box(mockStage), new Box(mockStage), new Box(mockStage)]
        boxes.forEach(box => group.appendChild(box))

        const ps = boxes.map(box => group.layoutPositionOf(box))
        const xs = [...new Set(ps.map(p => Number(p.x.toFixed(6))))].sort((a, b) => a - b)
        const zs = [...new Set(ps.map(p => Number(p.z.toFixed(6))))].sort((a, b) => a - b)

        expect(xs).toHaveLength(2)
        expect(zs).toHaveLength(2)
    })

    it('single child stays centered in the container', () => {
        const group = new GroupNode(mockStage)
        const box = new Box(mockStage)
        group.appendChild(box)
        const p = group.layoutPositionOf(box)
        expect(p.x).toBeCloseTo(0, 5)
        expect(p.z).toBeCloseTo(0, 5)
    })

    it('supports the canonical group layout prop', () => {
        const group = new GroupNode(mockStage)
        const boxes = [new Box(mockStage), new Box(mockStage)]
        boxes.forEach(box => group.appendChild(box))
        group.setStateValue('layout', 'depth')

        const positions = boxes.map(box => group.layoutPositionOf(box))
        expect(positions[0].x).toBeCloseTo(0, 5)
        expect(positions[1].x).toBeCloseTo(0, 5)
        expect(positions[0].z).toBeLessThan(positions[1].z)
    })
})

// ── 4. Box.modelGen — geometry centroid ──────────────────────────────────────

describe('Box.modelGen geometry', () => {

    it('bounding-box centre is at XZ origin', () => {
        const box  = new Box(mockStage)
        const mesh = box.modelGen()(0.5, 1.3) as THREE.Mesh
        const c    = bboxCentre(meshGeo(mesh))
        expect(c.x).toBeCloseTo(0, 3)
        expect(c.z).toBeCloseTo(0, 3)
    })

    it('bounding-box is symmetric in X and Z for equal width and depth', () => {
        const box = new Box(mockStage)
        const geo = meshGeo(box.modelGen()(0.5, 1.3) as THREE.Mesh)
        geo.computeBoundingBox()
        const { min, max } = geo.boundingBox!
        expect(Math.abs(max.x + min.x)).toBeCloseTo(0, 3)  // symmetric X
        expect(Math.abs(max.z + min.z)).toBeCloseTo(0, 3)  // symmetric Z
    })
})

// ── 5. Cylinder.modelGen — geometry centroid ─────────────────────────────────

describe('Cylinder.modelGen geometry', () => {

    it.each([0.12, 0.33, 0.9])('uses the declared height %s', height => {
        const cyl = new Cylinder(mockStage)
        const geo = meshGeo(cyl.modelGen()(height, 1.0) as THREE.Mesh)
        geo.computeBoundingBox()
        const { min, max } = geo.boundingBox!
        expect(max.y - min.y).toBeCloseTo(height, 5)
        expect((max.y + min.y) / 2).toBeCloseTo(0, 5)
    })

    it('bounding-box centre is on the XZ plane centre (x≈0, z≈0)', () => {
        const cyl  = new Cylinder(mockStage)
        const mesh = cyl.modelGen()(0.33, 1.0) as THREE.Mesh
        const c    = bboxCentre(meshGeo(mesh))
        expect(c.x).toBeCloseTo(0, 3)
        expect(c.z).toBeCloseTo(0, 3)
    })

    it('geometry is rotationally symmetric: bounding-box X and Z extents are equal', () => {
        const cyl  = new Cylinder(mockStage)
        const geo  = meshGeo(cyl.modelGen()(0.33, 1.0) as THREE.Mesh)
        geo.computeBoundingBox()
        const { min, max } = geo.boundingBox!
        const extentX = max.x - min.x
        const extentZ = max.z - min.z
        expect(extentX).toBeCloseTo(extentZ, 3)
    })
})

// ── 6. Wedge.modelGen — geometry centroid (animation pivot invariant) ────────
//
// This is the critical section.  Before the centering fix the vertex centroid
// sits at ≈ (±0.3, 0, ±0.3) — displaced radially inward — so GSAP scale and
// Y-slide animations pivot from the wrong point.  After the fix it must be
// at (0, *, 0) for every wedge regardless of N or index.

describe('Wedge.modelGen geometry centroid', () => {

    function buildWedges(n: number) {
        const ring = new Ring(mockStage)
        return Array.from({ length: n }, () => {
            const w = new Wedge(mockStage)
            ring.appendChild(w)
            return w
        })
    }

    // Tolerance note: the vertex centroid of an extruded/bevelled arc sits
    // slightly away from the exact midpoint of the arc radii because bevel
    // vertices are not uniformly distributed around the arc.  The residual
    // after centering is ~0.08 units — visually negligible for animations but
    // above the strict 0.05 tolerance of toBeCloseTo(0, 1).
    // The discriminating threshold here is 0.15: before the centering fix the
    // displacement was ~0.38 (25 % of size), after it is < 0.10 (< 7 % of size).
    const XZ_CENTROID_TOLERANCE = 0.15

    function centroidFor(w: Wedge, height = 0.75, size = 1.5): THREE.Vector3 {
        return vertexCentroid(meshGeo(w.modelGen()(height, size) as THREE.Mesh))
    }

    it('N=3: every wedge has XZ centroid near origin', () => {
        buildWedges(3).forEach(w => {
            const c = centroidFor(w)
            expect(Math.abs(c.x)).toBeLessThan(XZ_CENTROID_TOLERANCE)
            expect(Math.abs(c.z)).toBeLessThan(XZ_CENTROID_TOLERANCE)
        })
    })

    it('N=5: every wedge has XZ centroid near origin', () => {
        buildWedges(5).forEach(w => {
            const c = centroidFor(w)
            expect(Math.abs(c.x)).toBeLessThan(XZ_CENTROID_TOLERANCE)
            expect(Math.abs(c.z)).toBeLessThan(XZ_CENTROID_TOLERANCE)
        })
    })

    it('N=8: every wedge has XZ centroid near origin', () => {
        buildWedges(8).forEach(w => {
            const c = centroidFor(w)
            expect(Math.abs(c.x)).toBeLessThan(XZ_CENTROID_TOLERANCE)
            expect(Math.abs(c.z)).toBeLessThan(XZ_CENTROID_TOLERANCE)
        })
    })

    it('all wedges in a ring have the same radial distance to their centroid (uniform sizing)', () => {
        const wedges = buildWedges(4)
        const centroids = wedges.map(w => centroidFor(w))
        const radii = centroids.map(c => Math.sqrt(c.x * c.x + c.z * c.z))
        // After centering fix: all centroids at origin → all radii ≈ 0
        radii.forEach(r => expect(r).toBeLessThan(0.15))
    })

    it('geometry extent does not degenerate as N increases from 2 to 8', () => {
        for (let n = 2; n <= 8; n++) {
            const w   = buildWedges(n)[0]
            const geo = meshGeo(w.modelGen()(0.75, 1.5) as THREE.Mesh)
            geo.computeBoundingBox()
            const size = new THREE.Vector3()
            geo.boundingBox!.getSize(size)
            // Each segment must have non-trivial XZ extent
            expect(size.x + size.z).toBeGreaterThan(0.1)
        }
    })

    it('keeps a spaced wedge concentric with its parent ring', () => {
        const ring = new Ring(mockStage)
        ring.setStateValue('gap-ratio', 0.25)
        const wedges = Array.from({ length: 3 }, () => {
            const wedge = new Wedge(mockStage)
            wedge.setSize(0.5)
            ring.appendChild(wedge)
            return wedge
        })
        const wedge = wedges[0]
        const mesh = wedge.modelGen()(0.35, 0.5) as THREE.Mesh
        mesh.position.copy(ring.layoutPositionOf(wedge))
        mesh.updateMatrixWorld(true)

        const positions = meshGeo(mesh).getAttribute('position') as THREE.BufferAttribute
        const point = new THREE.Vector3()
        const worldPoints: THREE.Vector3[] = []
        for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
            worldPoints.push(point.clone())
        }

        const topY = Math.max(...worldPoints.map(p => p.y))
        const topFaceRadii = new Set(worldPoints
            .filter(p => Math.abs(p.y - topY) < 1e-5)
            .map(p => Math.hypot(p.x, p.z).toFixed(4)))

        // Every point on the top face belongs to either the inner or outer
        // circle. Before the fix, the same face produced 26 different radii
        // because its two arcs were centred away from the parent ring centre.
        expect(topFaceRadii.size).toBe(2)

        const angles = worldPoints
            .filter(p => Math.abs(p.y - topY) < 1e-5)
            .map(p => Math.atan2(p.x, p.z))
        const angularSpan = Math.max(...angles) - Math.min(...angles)
        expect(angularSpan).toBeCloseTo((Math.PI * 2 / 3) * 0.75, 4)
    })

    it('keeps explicit outer radius and thickness constant across segment counts', () => {
        for (const count of [3, 4, 6, 8]) {
            const ring = new Ring(mockStage)
            ring.setStateValue('radius', 1)
            ring.setStateValue('gap-ratio', 0.25)
            const wedges = Array.from({ length: count }, () => {
                const wedge = new Wedge(mockStage)
                wedge.setStateValue('thickness', 0.15)
                ring.appendChild(wedge)
                return wedge
            })
            const wedge = wedges[0]
            const mesh = wedge.modelGen()(0.35, 1) as THREE.Mesh
            mesh.position.copy(ring.layoutPositionOf(wedge))
            mesh.updateMatrixWorld(true)

            const positions = meshGeo(mesh).getAttribute('position') as THREE.BufferAttribute
            const point = new THREE.Vector3()
            const worldPoints: THREE.Vector3[] = []
            for (let i = 0; i < positions.count; i++) {
                point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
                worldPoints.push(point.clone())
            }

            const topY = Math.max(...worldPoints.map(p => p.y))
            const radialBands = [...new Set(worldPoints
                .filter(p => Math.abs(p.y - topY) < 1e-5)
                .map(p => Number(Math.hypot(p.x, p.z).toFixed(4))))]
                .sort((a, b) => a - b)

            expect(radialBands).toEqual([0.85, 1])
            expect(ring.measuredSize.value.x).toBeCloseTo(2, 6)
            expect(ring.measuredSize.value.z).toBeCloseTo(2, 6)
        }
    })

    it('uses a constant-width normal gap that bevels cannot close', () => {
        const count = 10
        const outerRadius = 0.7
        const thickness = 0.11
        const gapRatio = 0.05
        const ring = new Ring(mockStage)
        ring.setStateValue('radius', outerRadius)
        ring.setStateValue('gap-ratio', gapRatio)
        const wedges = Array.from({ length: count }, () => {
            const wedge = new Wedge(mockStage)
            wedge.setStateValue('thickness', thickness)
            ring.appendChild(wedge)
            return wedge
        })

        const worldPointsFor = (wedge: Wedge): THREE.Vector3[] => {
            const mesh = wedge.modelGen()(0.35, 1) as THREE.Mesh
            mesh.position.copy(ring.layoutPositionOf(wedge))
            mesh.updateMatrixWorld(true)
            const positions = meshGeo(mesh).getAttribute('position') as THREE.BufferAttribute
            const point = new THREE.Vector3()
            const result: THREE.Vector3[] = []
            for (let i = 0; i < positions.count; i++) {
                point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld)
                result.push(point.clone())
            }
            return result
        }

        const allWorldPoints = wedges.map(worldPointsFor)
        const firstPoints = allWorldPoints[0]
        const topY = Math.max(...firstPoints.map(point => point.y))
        const topPoints = firstPoints.filter(point => Math.abs(point.y - topY) < 1e-5)
        const innerRadius = outerRadius - thickness
        const outerHalfAngle = Math.max(...topPoints
            .filter(point => Math.abs(Math.hypot(point.x, point.z) - outerRadius) < 1e-4)
            .map(point => Math.abs(Math.atan2(point.x, point.z))))
        const innerHalfAngle = Math.max(...topPoints
            .filter(point => Math.abs(Math.hypot(point.x, point.z) - innerRadius) < 1e-4)
            .map(point => Math.abs(Math.atan2(point.x, point.z))))
        const slotHalfAngle = Math.PI / count

        const outerInset = outerRadius * Math.sin(slotHalfAngle - outerHalfAngle)
        const innerInset = innerRadius * Math.sin(slotHalfAngle - innerHalfAngle)
        expect(innerInset).toBeCloseTo(outerInset, 5)

        const requestedGapWidth = gapRatio * 2 * outerRadius * Math.sin(slotHalfAngle)
        const visibleGaps = allWorldPoints.map((points, index) => {
            const boundaryAngle = (index + 0.5) * Math.PI * 2 / count
            const gapTangent = new THREE.Vector2(Math.cos(boundaryAngle), -Math.sin(boundaryAngle))
            const projection = (point: THREE.Vector3) => point.x * gapTangent.x + point.z * gapTangent.y
            const nextPoints = allWorldPoints[(index + 1) % count]
            return Math.min(...nextPoints.map(projection)) - Math.max(...points.map(projection))
        })

        visibleGaps.forEach(gap => expect(gap).toBeCloseTo(requestedGapWidth, 4))
        expect(Math.max(...visibleGaps) - Math.min(...visibleGaps)).toBeLessThan(1e-5)
    })
})

describe('base anchoring via Element3d.getPosition', () => {
    it('a box in a stack sits on the floor: mesh Y = base + height/2', () => {
        const stack = new Stack(mockStage)
        const box = new Box(mockStage)
        box.setHeight(0.5)
        stack.appendChild(box)
        // base from layout is y=0 for the first child; renderOffset lifts by height/2
        expect(box.element.getPosition().y).toBeCloseTo(0.25, 5)
    })
})

describe('GroupNode content-driven sizing', () => {
    it('a row measures to the summed width of its children + gap', () => {
        const row = new Row(mockStage)        // mockStage.boxDistance = 1.5 → gap 1.5
        const boxes = [new Box(mockStage), new Box(mockStage)]
        boxes.forEach(b => { b.setSize(1); row.appendChild(b) })
        // 2 boxes of width 1 + one 1.5 gap = 3.5
        expect(row.measuredSize.value.x).toBeCloseTo(3.5, 5)
    })

    it('an explicit smaller size shrinks but never enlarges (override is a max)', () => {
        const row = new Row(mockStage)
        const boxes = [new Box(mockStage), new Box(mockStage)]
        boxes.forEach(b => { b.setSize(1); row.appendChild(b) })
        row.setStateValue('size', 1)          // declare 1×1 footprint, smaller than 3.5 content
        expect(row.measuredSize.value.x).toBeCloseTo(1, 5)   // reports the reservation
        row.syncWithThree()
        expect(row.group.scale.x).toBeCloseTo(1 / 3.5, 5)
        expect(row.group.scale.y).toBeCloseTo(1 / 3.5, 5)
        expect(row.group.scale.z).toBeCloseTo(1 / 3.5, 5)
    })
})

import { Root } from '@/lib-components/nodes/Root.js'

describe('Root.layoutPositionOf', () => {
    it('centers a single top-level child near the root space center', () => {
        const root = new Root(mockStage)
        const row = new Row(mockStage)
        root.appendChild(row)
        const p = root.layoutPositionOf(row)
        expect(p.x).toBeCloseTo(0, 5)
        expect(p.z).toBeCloseTo(0, 5)
        expect(p.y).toBeCloseTo(-0.1, 5)   // ROOT_SPACE_CENTER.y
    })

    it('distributes two top-level siblings through the root grid', () => {
        const root = new Root(mockStage)
        const rows = [new Row(mockStage), new Row(mockStage)]
        rows.forEach(row => {
            row.appendChild(new Box(mockStage))
            root.appendChild(row)
        })

        const positions = rows.map(row => root.layoutPositionOf(row))
        expect(positions[0].x).toBeCloseTo(-1.25, 5)
        expect(positions[1].x).toBeCloseTo(1.25, 5)
        positions.forEach(position => {
            expect(position.y).toBeCloseTo(-0.1, 5)
            expect(position.z).toBeCloseTo(0, 5)
        })
    })
})

describe('GroupNode child elevation', () => {
    it.each([
        ['Row', () => new Row(mockStage)],
        ['Ring', () => new Ring(mockStage)],
        ['Layer', () => new Layer(mockStage)],
    ])('applies elevation to a child of %s', (_, makeParent) => {
        const parent = makeParent()
        const child = new Layer(mockStage)
        child.setStateValue('elevation', 0.75)
        parent.appendChild(child)

        expect(parent.layoutPositionOf(child).y).toBeCloseTo(0.75, 5)
    })
})

describe('Stack default gap (tight stacking)', () => {
    it('stacks boxes with a small fixed gap, ignoring the global spacing gap', () => {
        const stack = new Stack(mockStage)        // mockStage.gap = 1.5 (planar spacing)
        const b0 = new Box(mockStage); b0.setHeight(0.25)
        const b1 = new Box(mockStage); b1.setHeight(0.25)
        stack.appendChild(b0)
        stack.appendChild(b1)
        // base of second box = first box height (0.25) + stack gap (0.05) = 0.30,
        // NOT 0.25 + 1.5 — a Stack must not inherit the planar gap.
        expect(stack.layoutPositionOf(b1).y).toBeCloseTo(0.30, 5)
    })

    it('an explicit gap prop still overrides the stack default', () => {
        const stack = new Stack(mockStage)
        const b0 = new Box(mockStage); b0.setHeight(0.25)
        const b1 = new Box(mockStage); b1.setHeight(0.25)
        stack.appendChild(b0)
        stack.appendChild(b1)
        stack.setStateValue('gap', 0.5)
        expect(stack.layoutPositionOf(b1).y).toBeCloseTo(0.75, 5)   // 0.25 + 0.5
    })

    it('lets an elevated child layer return to the stack floor', () => {
        const stack = new Stack(mockStage)
        const box = new Box(mockStage)
        const layer = new Layer(mockStage)
        layer.setStateValue('elevation', -(0.5 + 0.05))
        stack.appendChild(box)
        stack.appendChild(layer)

        expect(stack.layoutPositionOf(layer).y).toBeCloseTo(0, 5)
    })
})

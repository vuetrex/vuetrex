import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { Node } from '@/lib-components/nodes/Node.js'
import { Connectors } from '@/lib-components/three/connectors/connectors.js'
import { connectors, compileConnectors } from '@/lib-components/connectors/index.js'
import { resolvePort } from '@/lib-components/connectors/compiler/ports.js'
import { enclosingElementsScale } from '@/lib-components/connectors/runtime/scale.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

class EndpointNode extends Node { constructor(stage: VuetrexStage) { super(stage) } }

function harness() {
    const scene = new THREE.Scene(), elements = new Map<string, Element3d>()
    const stage = { scene, settings: { connectorColor: 0x26313a }, boxDistance: 1,
        getById: (id: string) => elements.get(id),
    } as unknown as VuetrexStage
    const controller = new Connectors(stage)
    const add = (id: string, parent: THREE.Object3D = scene) => {
        const node = new EndpointNode(stage)
        node.id = id
        node.element.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        parent.add(node.element.mesh)
        elements.set(id, node.element)
        return node.element
    }
    const dispose = () => {
        controller.clear()
        for (const element of elements.values()) {
            const mesh = element.mesh as THREE.Mesh
            mesh.geometry.dispose()
            ;(mesh.material as THREE.Material).dispose()
        }
    }
    return { scene, controller, elements, add, dispose }
}

describe('route network realization', () => {
    it('keeps direct and orthogonal routing distinct across both world axes', () => {
        const h = harness()
        h.add('a').mesh!.position.set(-2, 0, -2)
        h.add('b').mesh!.position.set(2, 0, 2)
        const edge = connectors.edge('a', 'b', { key: 'edge' })
        h.controller.reconcile('owner', compileConnectors(edge.route({ strategy: 'direct', lane: 0 })))
        const direct = h.controller.getResolvedNetwork('owner', 'edge')!.runs[0].points
        expect(direct).toHaveLength(2)
        expect(direct[0].x).not.toBe(direct[1].x)
        expect(direct[0].z).not.toBe(direct[1].z)
        h.controller.reconcile('owner', compileConnectors(edge.route({ strategy: 'orthogonal', lane: 0 })))
        const points = h.controller.getResolvedNetwork('owner', 'edge')!.runs[0].points
        expect(points.length).toBeGreaterThan(2)
        points.slice(1).forEach((point, index) => {
            expect(point.x === points[index].x || point.z === points[index].z).toBe(true)
        })
        h.dispose()
    })

    it('uses stage color and removes zero-opacity strokes without leaving depth-writing meshes', () => {
        const h = harness()
        const graph = connectors.edge({ position: [0, 0, 0] }, { position: [2, 0, 1] }, { key: 'edge' })
        h.controller.reconcile('owner', compileConnectors(graph.stroke()))
        const group = h.scene.getObjectByName('vx-connector-strokes')!
        const mesh = group.children[0] as THREE.Mesh
        expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x26313a)
        const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose')
        const disposeMaterial = vi.spyOn(mesh.material as THREE.Material, 'dispose')
        h.controller.reconcile('owner', compileConnectors(graph.stroke({ opacity: 0 })))
        expect(group.children).toHaveLength(0)
        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
        h.controller.reconcile('owner', compileConnectors(graph.stroke()))
        expect(group.children).toHaveLength(1)
        h.dispose()
    })

    it.each([0.012, 0.05, 0.2])('ends a width-%s shaft at the arrow base instead of exposing its square cap', width => {
        const h = harness()
        const graph = connectors.edge({ position: [0, 1, 0] }, { position: [4, 1, 0] }, { key: 'arrow' })
            .route({ strategy: 'direct' })
        h.controller.reconcile('owner', compileConnectors(graph.stroke({ width: 0.01, markerEnd: 'arrow' })))
        const network = h.controller.getResolvedNetwork('owner', 'arrow')!
        h.controller.reconcile('owner', compileConnectors(graph.stroke({ width, offset: 0.04, markerEnd: 'arrow' })))
        expect(h.controller.getResolvedNetwork('owner', 'arrow')).toBe(network)
        const mesh = h.scene.getObjectByName('vx-connector-owner-arrow') as THREE.Mesh
        const positions = mesh.geometry.getAttribute('position')
        const tipIndex = positions.count - 3
        const baseX = positions.getX(tipIndex + 1)
        expect(positions.getX(tipIndex)).toBeCloseTo(4)
        expect(positions.getY(tipIndex)).toBeCloseTo(1.04)
        const shaftXs = Array.from({ length: tipIndex }, (_, i) => positions.getX(i))
        expect(Math.max(...shaftXs)).toBeCloseTo(baseX)
        // A ray just outside the taper must miss, even though it lies inside the shaft's old square cap.
        mesh.updateMatrixWorld(true)
        const ray = new THREE.Raycaster(new THREE.Vector3(4 - width * 0.1, 2, width * 0.4), new THREE.Vector3(0, -1, 0))
        expect(ray.intersectObject(mesh)).toHaveLength(0)
        expect(network.traversals[0].points.at(-1)!.x).toBe(4)
        h.dispose()
    })

    it.each([[0, 4, 0], [2, 3, 4]])('joins the arrow and shaft in the same plane toward (%s, %s, %s)', (x, y, z) => {
        const h = harness()
        h.controller.reconcile('owner', compileConnectors(connectors
            .edge({ position: [0, 1, 0] }, { position: [x, y, z] }, { key: 'spatial' })
            .route({ strategy: 'direct' }).stroke({ width: 0.15, markerEnd: 'arrow' })))
        const mesh = h.scene.getObjectByName('vx-connector-owner-spatial') as THREE.Mesh
        const positions = mesh.geometry.getAttribute('position')
        const point = (i: number) => new THREE.Vector3().fromBufferAttribute(positions, i)
        const arrow = positions.count - 3
        const shaftEnd = point(2).add(point(5)).multiplyScalar(0.5)
        const arrowBase = point(arrow + 1).add(point(arrow + 2)).multiplyScalar(0.5)
        expect(shaftEnd.distanceTo(arrowBase)).toBeLessThan(1e-6)
        const shaftNormal = point(1).sub(point(0)).cross(point(2).sub(point(0))).normalize()
        const arrowNormal = point(arrow + 1).sub(point(arrow)).cross(point(arrow + 2).sub(point(arrow))).normalize()
        expect(Math.abs(shaftNormal.dot(arrowNormal))).toBeCloseTo(1)
        h.dispose()
    })

    it('trims both arrows across short terminal segments without shifting existing dash spans', () => {
        const h = harness()
        h.controller.reconcile('owner', compileConnectors(connectors
            .edge({ position: [0, 1, 0] }, { position: [4, 1, 0] }, { key: 'dashed' })
            .route({ strategy: 'manual', waypoints: [[3.9, 1, 0]] })
            .stroke({ width: 0.2, dash: [0.15, 0.1], markerStart: 'arrow', markerEnd: 'arrow' })))
        const mesh = h.scene.getObjectByName('vx-connector-owner-dashed') as THREE.Mesh
        const positions = mesh.geometry.getAttribute('position')
        const shaftXs = Array.from({ length: positions.count - 6 }, (_, i) => positions.getX(i))
        expect(Math.min(...shaftXs)).toBeCloseTo(0.5)
        expect(Math.max(...shaftXs)).toBeCloseTo(3.6)
        expect(positions.getX(positions.count - 6)).toBeCloseTo(0)
        expect(positions.getX(positions.count - 3)).toBeCloseTo(4)
        h.dispose()
    })

    it('omits the shaft on a route shorter than its arrow and leaves unmarked ends intact', () => {
        const h = harness()
        const graph = connectors.edge({ position: [0, 1, 0] }, { position: [0.05, 1, 0] }, { key: 'short' })
            .route({ strategy: 'direct' })
        h.controller.reconcile('owner', compileConnectors(graph.stroke({ width: 0.1, markerEnd: 'arrow' })))
        const arrow = h.scene.getObjectByName('vx-connector-owner-short') as THREE.Mesh
        expect(arrow.geometry.getAttribute('position').count).toBe(3)
        h.controller.reconcile('owner', compileConnectors(graph.stroke({ width: 0.1, markerEnd: false })))
        const plain = h.scene.getObjectByName('vx-connector-owner-short') as THREE.Mesh
        const positions = plain.geometry.getAttribute('position')
        expect(positions.count).toBe(6)
        expect(Math.max(...Array.from({ length: positions.count }, (_, i) => positions.getX(i)))).toBeCloseTo(0.05)
        h.dispose()
    })

    it('preserves parallel owners and recenters the surviving automatic lane', () => {
        const h = harness()
        h.add('a').mesh!.position.x = -2
        h.add('b').mesh!.position.x = 2
        const graph = connectors.edge('a', 'b', { key: 'edge' }).route({ strategy: 'direct' })
        h.controller.reconcile('first', compileConnectors(graph))
        h.controller.reconcile('second', compileConnectors(graph))
        expect(h.controller.connectorDiagnostics().resolvedCount).toBe(2)
        const before = h.controller.getResolvedNetwork('second', 'edge')!
        h.controller.removeOwner('first')
        expect(h.controller.connectorDiagnostics().resolvedCount).toBe(1)
        expect(h.controller.getResolvedNetwork('second', 'edge')!.routeSignature).not.toBe(before.routeSignature)
        h.dispose()
    })

    it('retargets an owner and retains declarations while endpoints disappear and reappear', () => {
        const h = harness()
        h.add('a'); h.add('b')
        h.controller.reconcile('owner', compileConnectors(connectors.edge('a', 'b', { key: 'edge' })))
        h.controller.reconcile('owner', compileConnectors(connectors.edge('a', 'later', { key: 'edge' })))
        expect(h.controller.connectorDiagnostics().unresolvedCount).toBe(1)
        const later = h.add('later')
        h.controller.reconcileConnections()
        expect(h.controller.getResolvedNetwork('owner', 'edge')!.to[0].nodeId).toBe('later')
        h.controller.remove(later)
        h.elements.delete('later')
        expect(h.controller.connectorDiagnostics().unresolvedCount).toBe(1)
        h.elements.set('later', later)
        h.controller.reconcileConnections()
        expect(h.controller.connectorDiagnostics().resolvedCount).toBe(1)
        h.dispose()
    })

    it('resolves named and normalized ports from nested world bounds', () => {
        const h = harness(), parent = new THREE.Group()
        parent.position.set(4, 0, -3)
        parent.scale.set(2, 1.5, 0.5)
        h.scene.add(parent)
        const endpoint = h.add('nested', parent)
        endpoint.mesh!.position.set(1, 1, 2)
        const right = resolvePort(endpoint, 'right', new THREE.Vector3(20, 0, 0))
        expect(right.point.x).toBeCloseTo(right.bounds.max.x)
        expect(right.normal.toArray()).toEqual([1, 0, 0])
        const normalized = resolvePort(endpoint, { x: 0, y: 1, z: 0.25 }, new THREE.Vector3())
        expect(normalized.point.x).toBeCloseTo(normalized.bounds.min.x)
        expect(normalized.point.y).toBeCloseTo(normalized.bounds.max.y)
        expect(normalized.point.z).toBeCloseTo(THREE.MathUtils.lerp(normalized.bounds.min.z, normalized.bounds.max.z, 0.25))
        h.dispose()
    })

    it.each(['bezier', 'spline'])('creates elevated %s routes between edge ports', strategy => {
        const h = harness()
        h.add('a').mesh!.position.set(-2, 0, -1)
        h.add('b').mesh!.position.set(2, 0, 1)
        h.controller.reconcile('owner', compileConnectors(connectors.edge('a', 'b', { key: 'edge' }).route({
            strategy, fromPort: 'right', toPort: 'left', elevation: 1, lane: 1, clearance: 0.3,
        })))
        const points = h.controller.getResolvedNetwork('owner', 'edge')!.traversals[0].points
        expect(points.length).toBeGreaterThan(10)
        expect(points[0].x).toBeCloseTo(-1.5)
        expect(points.at(-1)!.x).toBeCloseTo(1.5)
        expect(Math.max(...points.map(point => point.y))).toBeGreaterThan(0.8)
        h.dispose()
    })

    it('splits a bus trunk into shared runs and one traversal per target', () => {
        const h = harness()
        h.add('gateway').mesh!.position.x = -3
        for (const [index, id] of ['auth', 'catalog', 'orders'].entries()) h.add(id).mesh!.position.set(2, 0, index * 2 - 2)
        h.controller.reconcile('owner', compileConnectors(connectors.bus('gateway', ['auth', 'catalog', 'orders'], { key: 'bus' })
            .route({ fromPort: 'right', toPort: 'left', elevation: 0.4, clearance: 0.25 })))
        const network = h.controller.getResolvedNetwork('owner', 'bus')!
        expect(network.runs.filter(run => run.role === 'trunk')).toHaveLength(2)
        expect(network.traversals).toHaveLength(3)
        expect(h.controller.getConnectionPorts().filter(port => port.role === 'to')).toHaveLength(3)
        h.dispose()
    })

    it('updates the enclosing scale after a common parent scales', () => {
        const h = harness(), parent = new THREE.Group()
        parent.scale.setScalar(0.1)
        h.scene.add(parent)
        const a = h.add('a', parent), b = h.add('b', parent)
        h.scene.updateMatrixWorld(true)
        expect(enclosingElementsScale([a, b])).toBeCloseTo(0.1)
        h.controller.reconcile('owner', compileConnectors(connectors.edge('a', 'b', { key: 'edge' })))
        expect(h.controller.getResolvedNetwork('owner', 'edge')!.scale).toBeCloseTo(0.1)
        parent.scale.setScalar(0.05)
        h.scene.updateMatrixWorld(true)
        h.controller.update({ mesh: parent } as Element3d)
        expect(h.controller.getResolvedNetwork('owner', 'edge')!.scale).toBeCloseTo(0.05)
        h.dispose()
    })
})

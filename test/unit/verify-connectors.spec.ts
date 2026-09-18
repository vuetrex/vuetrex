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

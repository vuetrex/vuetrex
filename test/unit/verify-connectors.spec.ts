import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import * as THREE from 'three'
import { ConnectorNode } from '@/lib-components/nodes/ConnectorNode.js'
import { BusConnectorNode } from '@/lib-components/nodes/BusConnectorNode.js'
import { Row } from '@/lib-components/nodes/Row.js'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { Node } from '@/lib-components/nodes/Node.js'
import { Connectors, enclosingConnectionScale } from '@/lib-components/three/connectors/connectors.js'
import { LineRenderer } from '@/lib-components/three/connectors/LineRenderer.js'
import { scaledParticleMetrics } from '@/lib-components/three/connectors/ParticleRenderer.js'
import {
    BezierStrategy,
    ConnectorPath,
    DirectStrategy,
    OrthogonalStrategy,
    Segment,
    SplineStrategy,
    resolvePort,
} from '@/lib-components/three/connectors/path.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

class EndpointNode extends Node {
    constructor(stage: VuetrexStage) { super(stage) }
}

function makeRegistryHarness() {
    const scene = new THREE.Scene()
    const elements = new Map<string, Element3d>()
    const stage = {
        scene,
        settings: {},
        boxDistance: 1,
        registerAnimation: vi.fn(),
        getById: (id: string) => elements.get(id),
    } as unknown as VuetrexStage
    const connectors = new Connectors(stage)
    connectors.mount()

    const addEndpoint = (id: string, parent: THREE.Object3D = scene): Element3d => {
        const node = new EndpointNode(stage)
        node.name = id
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        mesh.name = `el-${id}`
        parent.add(mesh)
        node.element.mesh = mesh
        elements.set(id, node.element)
        return node.element
    }

    return { scene, elements, stage, connectors, addEndpoint }
}

describe('connector layout participation', () => {
    it('synchronizes as a renderable record without reserving layout space', async () => {
        const scene = new THREE.Scene()
        const stage = {
            boxRadius: 1,
            boxDistance: 0.5,
            gap: 0.5,
            createElementMaterial: () => new THREE.MeshStandardMaterial(),
            getScene: () => scene,
            renderMesh: vi.fn(),
            removeObject: vi.fn(),
            connect: vi.fn(),
            unregisterConnection: vi.fn(),
            reconcileConnections: vi.fn(),
            connectors: { update: vi.fn(), remove: vi.fn(() => []) },
        } as unknown as VuetrexStage
        const row = new Row(stage)
        const left = new Box(stage)
        const connector = new ConnectorNode(stage)
        const right = new Box(stage)

        row.appendChild(left)
        row.appendChild(connector)
        row.appendChild(right)

        expect(connector.isRenderableNode()).toBe(true)
        expect(connector.participatesInLayout()).toBe(false)
        expect(row.elements.value).toEqual([left, right])
        expect(left.myIdx.value).toBe(0)
        expect(connector.myIdx.value).toBe(-1)
        expect(right.myIdx.value).toBe(1)
        expect(row.measuredSize.value.x).toBeCloseTo(2.5, 6)
        await flushPromises()
    })
})

describe('ConnectorNode registration lifecycle', () => {
    it('updates one stable registration and removes it on unmount', async () => {
        const stage = {
            connect: vi.fn(),
            unregisterConnection: vi.fn(),
            reconcileConnections: vi.fn(),
        } as unknown as VuetrexStage
        const connector = new ConnectorNode(stage)
        connector.state.from = 'a'
        connector.state.to = 'b'
        connector.state.layout = 'straight'
        connector.state.type = 'line'
        connector.syncWithThree()
        await flushPromises()

        expect(stage.connect).toHaveBeenCalledTimes(1)
        const registrationId = vi.mocked(stage.connect).mock.calls[0][4]
        expect(registrationId).toMatch(/^connector:/)

        connector.state.to = 'c'
        await nextTick()
        await flushPromises()
        expect(stage.connect).toHaveBeenCalledTimes(2)
        expect(vi.mocked(stage.connect).mock.calls[1][4]).toBe(registrationId)

        connector.onRemoved()
        expect(stage.unregisterConnection).toHaveBeenLastCalledWith(registrationId)
    })

    it('registers one bus declaration for a reactive target collection', async () => {
        const stage = {
            connectBus: vi.fn(),
            unregisterConnection: vi.fn(),
            reconcileConnections: vi.fn(),
        } as unknown as VuetrexStage
        const bus = new BusConnectorNode(stage)
        bus.state.from = 'gateway'
        bus.state.to = ['auth', 'orders']
        bus.state.side = 'right'
        bus.syncWithThree()
        await flushPromises()

        expect(stage.connectBus).toHaveBeenCalledTimes(1)
        const call = vi.mocked(stage.connectBus).mock.calls[0]
        expect(call[0]).toBe('gateway')
        expect(call[1]).toEqual(['auth', 'orders'])
        expect(call[4]).toMatchObject({ side: 'right', avoid: true })

        bus.state.to = ['auth', 'orders', 'catalog']
        await nextTick()
        await flushPromises()
        expect(stage.connectBus).toHaveBeenCalledTimes(2)
        expect(vi.mocked(stage.connectBus).mock.calls[1][3]).toBe(call[3])

        bus.onRemoved()
        expect(stage.unregisterConnection).toHaveBeenLastCalledWith(call[3])
    })

    it('gives MeshNode shorthand connections the same update/removal safety', async () => {
        const scene = new THREE.Scene()
        const stage = {
            boxRadius: 1,
            boxDistance: 0.5,
            gap: 0.5,
            createElementMaterial: () => new THREE.MeshStandardMaterial(),
            getScene: () => scene,
            renderMesh: vi.fn(),
            removeObject: vi.fn(),
            connect: vi.fn(),
            unregisterConnection: vi.fn(),
            reconcileConnections: vi.fn(),
            connectors: { update: vi.fn(), remove: vi.fn(() => []) },
        } as unknown as VuetrexStage
        const row = new Row(stage)
        const box = new Box(stage)
        box.name = 'source'
        box.setStateValue('connection', 'first-target')
        row.appendChild(box)
        await flushPromises()

        expect(stage.connect).toHaveBeenCalledTimes(1)
        const registrationId = vi.mocked(stage.connect).mock.calls[0][4]
        expect(registrationId).toMatch(/^mesh:/)

        box.setStateValue('connection', 'second-target')
        await flushPromises()
        expect(stage.connect).toHaveBeenCalledTimes(2)
        expect(vi.mocked(stage.connect).mock.calls[1][4]).toBe(registrationId)

        box.onRemoved()
        expect(stage.unregisterConnection).toHaveBeenLastCalledWith(registrationId)
    })
})

describe('keyed connector registry', () => {
    it('renders and samples a straight connector across both world axes', () => {
        const { scene, addEndpoint } = makeRegistryHarness()
        const a = addEndpoint('a')
        const b = addEndpoint('b')
        a.mesh!.position.set(-2, 0, -1)
        b.mesh!.position.set(2, 0, 2)
        scene.updateMatrixWorld(true)

        const path = new ConnectorPath()
        path.setStrategy(new DirectStrategy())
        path.connect(a, b, 'line', 'diagonal')
        const segment = path.getSegment(0)
        expect(segment.startX).toBeCloseTo(-1.5)
        expect(segment.endX).toBeCloseTo(1.5)
        expect(segment.len).toBeCloseTo(Math.sqrt(18))
        expect(segment.endInset).toBeCloseTo(0.02, 3)
        const midpoint = path.sample(segment.len / 2)
        expect(midpoint.x).toBeCloseTo(0)
        expect(midpoint.y).toBeCloseTo(0.5)

        const renderer = new LineRenderer({ scene } as unknown as VuetrexStage)
        renderer.update([segment], 0, 0)
        const mesh = ((renderer as any).group as THREE.Group).children[0] as THREE.Mesh
        expect(mesh.position.x).toBeCloseTo(0)
        expect(mesh.position.z).toBeCloseTo(0.5)
        expect(mesh.rotation.y).not.toBe(0)
        const lineGroup = (renderer as any).group as THREE.Group
        expect(lineGroup.children).toHaveLength(2)
        const arrow = lineGroup.children[1] as THREE.Mesh
        expect(arrow.userData.connectorPart).toBe('arrowhead')
        const arrowDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion)
        expect(arrowDirection.x).toBeCloseTo(1 / Math.sqrt(2), 6)
        expect(arrowDirection.z).toBeCloseTo(1 / Math.sqrt(2), 6)
        renderer.dispose()
    })

    it('uses the stage connector color for solid routes and arrowheads', () => {
        const scene = new THREE.Scene()
        const renderer = new LineRenderer({
            scene,
            settings: { connectorColor: 0x26313a },
        } as unknown as VuetrexStage)

        expect(((renderer as any).material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x26313a)
        renderer.dispose()
    })

    it('keeps every bend of a three-segment orthogonal line route', () => {
        const { scene, connectors, addEndpoint } = makeRegistryHarness()
        const a = addEndpoint('a')
        const b = addEndpoint('b')
        a.mesh!.position.set(-2, 0, -2)
        b.mesh!.position.set(2, 0, 2)
        scene.updateMatrixWorld(true)

        connectors.register('a', 'b', 'orthogonal', 'line', 'bent-line')
        connectors.reconcileConnections()
        const segments = [...connectors.getSegments()]
        expect(segments).toHaveLength(3)
        expect(segments.every(segment =>
            segment.startX === segment.endX || segment.startZ === segment.endZ,
        )).toBe(true)
        expect(segments[0].endX).toBe(segments[1].startX)
        expect(segments[0].endZ).toBe(segments[1].startZ)
        expect(segments[1].endX).toBe(segments[2].startX)
        expect(segments[1].endZ).toBe(segments[2].startZ)
        expect(new Set(segments.map(segment => segment.elevation)).size).toBe(1)
        expect(segments[0].startX).toBeCloseTo(-1.5)
        expect(segments[2].endX).toBeCloseTo(1.5)

        const renderer = new LineRenderer({ scene } as unknown as VuetrexStage)
        renderer.update(segments, 0, 0)
        expect(((renderer as any).group as THREE.Group).children).toHaveLength(4)
        renderer.dispose()
        connectors.clear()
    })

    it('does not add an arrowhead to direct particle segments', () => {
        const { scene, addEndpoint } = makeRegistryHarness()
        const a = addEndpoint('a')
        const b = addEndpoint('b')
        a.mesh!.position.set(-1, 0, 0)
        b.mesh!.position.set(1, 0, 0)
        scene.updateMatrixWorld(true)

        const segment = new DirectStrategy().calculatePath(a, b, 'particles')[0]
        const renderer = new LineRenderer({ scene } as unknown as VuetrexStage)
        renderer.update([segment], 0, 0)
        const parts = ((renderer as any).group as THREE.Group).children
        expect(parts).toHaveLength(1)
        expect(parts[0].userData.connectorPart).toBe('shaft')
        renderer.dispose()
    })

    it('keeps direct and orthogonal routing geometrically distinct', () => {
        const { scene, addEndpoint } = makeRegistryHarness()
        const a = addEndpoint('a')
        const b = addEndpoint('b')
        a.mesh!.position.set(-2, 0, -2)
        b.mesh!.position.set(2, 0, 2)
        scene.updateMatrixWorld(true)

        const direct = new DirectStrategy().calculatePath(a, b)
        const orthogonal = new OrthogonalStrategy().calculatePath(a, b)

        expect(direct).toHaveLength(1)
        expect(direct[0].startX).not.toBe(direct[0].endX)
        expect(direct[0].startZ).not.toBe(direct[0].endZ)
        expect(orthogonal).toHaveLength(3)
        expect(orthogonal.every(segment =>
            segment.startX === segment.endX || segment.startZ === segment.endZ,
        )).toBe(true)
    })

    it('preserves parallel edges and removes only the requested registration', () => {
        const { connectors, addEndpoint } = makeRegistryHarness()
        addEndpoint('a')
        addEndpoint('b')

        connectors.register('a', 'b', 'straight', 'line', 'edge-1')
        connectors.register('a', 'b', 'straight', 'particles', 'edge-2')
        connectors.reconcileConnections()

        expect(connectors.registrationCount).toBe(2)
        expect(connectors.activeConnectionCount).toBe(2)
        expect(connectors.segmentCount).toBe(4)
        expect(new Set(connectors.getSegments().map(segment => segment.connectionId))).toEqual(new Set(['edge-1', 'edge-2']))

        connectors.unregister('edge-1')
        expect(connectors.registrationCount).toBe(1)
        expect(connectors.activeConnectionCount).toBe(1)
        expect(connectors.getSegments().map(segment => segment.connectionId)).toEqual(['edge-2', 'edge-2'])
        connectors.clear()
    })

    it('replaces a reactive registration without leaving its old route behind', () => {
        const { connectors, addEndpoint } = makeRegistryHarness()
        addEndpoint('a')
        const b = addEndpoint('b')
        const c = addEndpoint('c')

        connectors.register('a', 'b', 'straight', 'line', 'edge')
        connectors.reconcileConnections()
        expect(connectors.getSegments()[0].tEl).toBe(b)

        connectors.register('a', 'c', 'straight', 'line', 'edge')
        connectors.reconcileConnections()
        expect(connectors.registrationCount).toBe(1)
        expect(connectors.segmentCount).toBe(1)
        expect(connectors.getSegments()[0].tEl).toBe(c)
        connectors.clear()
    })

    it('retains unresolved declarations and connects them when endpoints appear', () => {
        const { connectors, addEndpoint } = makeRegistryHarness()
        addEndpoint('a')
        connectors.register('a', 'later', 'straight', 'particles', 'deferred')
        connectors.reconcileConnections()
        expect(connectors.registrationCount).toBe(1)
        expect(connectors.activeConnectionCount).toBe(0)

        addEndpoint('later')
        connectors.reconcileConnections()
        expect(connectors.activeConnectionCount).toBe(1)
        expect(connectors.segmentCount).toBe(1)
        connectors.clear()
    })

    it('resolves named and normalized ports from nested world bounds', () => {
        const { scene, addEndpoint } = makeRegistryHarness()
        const parent = new THREE.Group()
        parent.position.set(4, 0, -3)
        parent.scale.set(2, 1.5, 0.5)
        scene.add(parent)
        const endpoint = addEndpoint('nested', parent)
        endpoint.mesh!.position.set(1, 1, 2)
        scene.updateMatrixWorld(true)

        const right = resolvePort(endpoint, 'right', new THREE.Vector3(20, 0, 0))
        expect(right.point.x).toBeCloseTo(right.bounds.max.x)
        expect(right.normal).toEqual(new THREE.Vector3(1, 0, 0))

        const normalized = resolvePort(endpoint, { x: 0, y: 1, z: 0.25 }, new THREE.Vector3())
        expect(normalized.point.x).toBeCloseTo(normalized.bounds.min.x)
        expect(normalized.point.y).toBeCloseTo(normalized.bounds.max.y)
        expect(normalized.point.z).toBeCloseTo(
            THREE.MathUtils.lerp(normalized.bounds.min.z, normalized.bounds.max.z, 0.25),
        )
    })

    it('creates elevated bezier and spline routes between edge ports', () => {
        const { scene, addEndpoint } = makeRegistryHarness()
        const a = addEndpoint('a')
        const b = addEndpoint('b')
        a.mesh!.position.set(-2, 0, -1)
        b.mesh!.position.set(2, 0, 1)
        scene.updateMatrixWorld(true)

        const options = { fromPort: 'right' as const, toPort: 'left' as const, elevation: 1, lane: 1, avoid: 0.3 }
        const bezier = new BezierStrategy().calculatePath(a, b, 'line', options)
        const spline = new SplineStrategy().calculatePath(a, b, 'line', options)

        expect(bezier.length).toBeGreaterThan(10)
        expect(spline.length).toBeGreaterThan(10)
        expect(bezier[0].startX).toBeCloseTo(-1.5)
        expect(bezier.at(-1)!.endX).toBeCloseTo(1.5)
        expect(Math.max(...bezier.flatMap(segment => [segment.startY, segment.endY]))).toBeGreaterThan(0.8)
        expect(bezier.at(-1)!.terminal).toBe(true)
        expect(spline.at(-1)!.terminal).toBe(true)
    })

    it('emits one shared bus trunk and one terminal branch per target', () => {
        const { scene, connectors, addEndpoint } = makeRegistryHarness()
        const gateway = addEndpoint('gateway')
        gateway.mesh!.position.set(-3, 0, 0)
        for (const [index, id] of ['auth', 'catalog', 'orders'].entries()) {
            addEndpoint(id).mesh!.position.set(2, 0, index * 2 - 2)
        }
        scene.updateMatrixWorld(true)

        connectors.registerBus('gateway', ['auth', 'catalog', 'orders'], 'line', 'gateway-bus', {
            side: 'right',
            toPort: 'left',
            elevation: 0.4,
            avoid: 0.25,
        })
        connectors.reconcileConnections()

        const segments = [...connectors.getSegments()]
        expect(segments.filter(segment => segment.routePart === 'trunk')).toHaveLength(1)
        expect(segments.filter(segment => segment.routePart === 'branch' && segment.terminal)).toHaveLength(3)
        expect(new Set(segments.map(segment => segment.connectionId))).toEqual(new Set(['gateway-bus']))
        expect(connectors.getConnectionPorts().filter(port => port.role === 'to')).toHaveLength(3)
        connectors.clear()
    })
})

describe('connector enclosing scale', () => {
    it('uses the closest common parent and updates after an enclosing group scales', () => {
        const { scene, connectors, addEndpoint } = makeRegistryHarness()
        const layer = new THREE.Group()
        layer.scale.setScalar(0.1)
        scene.add(layer)
        const leftGroup = new THREE.Group()
        const rightGroup = new THREE.Group()
        layer.add(leftGroup, rightGroup)
        const a = addEndpoint('a', leftGroup)
        const b = addEndpoint('b', rightGroup)
        scene.updateMatrixWorld(true)

        expect(enclosingConnectionScale(a, b)).toBeCloseTo(0.1, 6)
        connectors.register('a', 'b', 'straight', 'particles', 'scaled-edge')
        connectors.reconcileConnections()
        expect(connectors.getSegments()[0].scale).toBeCloseTo(0.1, 6)

        layer.scale.setScalar(0.05)
        scene.updateMatrixWorld(true)
        connectors.update({ mesh: layer } as Element3d)
        expect(connectors.getSegments()[0].scale).toBeCloseTo(0.05, 6)
        connectors.clear()
    })

    it('applies the segment scale to world-space lines and particle behavior', () => {
        const scene = new THREE.Scene()
        const stage = { scene } as unknown as VuetrexStage
        const renderer = new LineRenderer(stage)
        const endpoint = {} as Element3d
        const segment = new Segment(true, 0, -1, 1, endpoint, endpoint, 'line', 'scaled', 0.1)
        renderer.update([segment], 0, 0)

        const lineGroup = (renderer as any).group as THREE.Group
        const geometry = (lineGroup.children[0] as THREE.Mesh).geometry as THREE.BoxGeometry
        expect(geometry.parameters.height).toBeCloseTo(0.0012, 8)
        expect(geometry.parameters.depth).toBeCloseTo(0.0012, 8)

        const direct = Segment.between(
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(1, 0, 0),
            endpoint,
            endpoint,
            'line',
        )
        direct.scale = 0.1
        direct.endInset = 0.05
        renderer.update([direct], 0, 0)
        const arrowGeometry = (lineGroup.children[1] as THREE.Mesh).geometry as THREE.ConeGeometry
        expect(arrowGeometry.parameters.height).toBeCloseTo(0.016, 8)
        expect(arrowGeometry.parameters.radius).toBeCloseTo(0.0065, 8)

        const baseParticleMetrics = scaledParticleMetrics(1, 0.035)
        expect(scaledParticleMetrics(0.1, 0.035)).toEqual({
            spread: expect.closeTo(0.0035, 8),
            size: expect.closeTo(baseParticleMetrics.size * 0.1, 8),
            sizeRandomness: expect.closeTo(baseParticleMetrics.sizeRandomness * 0.1, 8),
            velocityScale: 0.1,
        })
        renderer.dispose()
    })
})

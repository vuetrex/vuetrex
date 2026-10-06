import { tabAConnectors } from '../../demo/connectors/tabA.js'
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Base } from '@/lib-components/nodes/Base.js'
import { Node } from '@/lib-components/nodes/Node.js'
import { ConnectorGraphHost } from '@/lib-components/nodes/ConnectorGraphHost.js'
import { Connectors } from '@/lib-components/three/connectors/connectors.js'
import {
    compileConnectors,
    connectorGraphSignature,
    connectors,
    defineConnectorOutputs,
    defineConnectors,
    geo,
    inspectConnectors,
    particles,
    registerConnectorAppearance,
    registerConnectorStrategy,
} from '@/lib-components/index.js'
import type { ConnectorFlowFactory, ConnectorSource } from '@/lib-components/connectors/types.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

class HostRoot extends Base {
    protected state = {}
}

class EndpointNode extends Node {
    constructor(stage: VuetrexStage) { super(stage) }

    override connectorPorts() {
        return {
            signal: { position: [1, 0.5, 0] as const, normal: [1, 0, 0] as const },
        }
    }
}

function makeHarness(settings: Record<string, unknown> = {}) {
    const scene = new THREE.Scene()
    const elements = new Map<string, Element3d>()
    const stopFrame = vi.fn()
    const frameCallbacks: Array<(time: number, tick: number) => void> = []
    const onEachFrame = vi.fn((callback: (time: number, tick: number) => void) => {
        frameCallbacks.push(callback)
        return stopFrame
    })
    const stage = {
        scene,
        settings: { connectorColor: 0x77cbd2, ...settings },
        boxDistance: 1,
        getScene: () => scene,
        getById: (id: string) => elements.get(id),
        onEachFrame,
        registerAnimation: onEachFrame,
        createElementMaterial: () => new THREE.MeshStandardMaterial(),
        shadowsEnabled: () => false,
    } as unknown as VuetrexStage
    const controller = new Connectors(stage)
    ;(stage as any).connectors = controller
    controller.mount()

    const addEndpoint = (id: string, position: THREE.Vector3): Element3d => {
        const node = new EndpointNode(stage)
        node.id = id
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
        mesh.name = `el-${id}`
        mesh.position.copy(position)
        mesh.userData.el = node.element
        node.element.mesh = mesh
        scene.add(mesh)
        elements.set(id, node.element)
        scene.updateMatrixWorld(true)
        return node.element
    }
    return { scene, elements, stage, controller, addEndpoint, onEachFrame, stopFrame, frameCallbacks }
}

describe('fluent connector authoring', () => {
    it('uses one context convention, supports empty composition, overlays presentations, and scopes modules', () => {
        const contexts: unknown[] = []
        const relationships = [{ id: 'rel', from: 'a', to: 'b' }]
        const base = connectors.edges(relationships, {
            keyBy: context => { contexts.push(context); return context.item.id },
            from: context => { contexts.push(context); return context.item.from },
            to: context => { contexts.push(context); return context.item.to },
        })
        const presented = base.stroke({ key: 'shaft', color: 0xff0000, width: 0.03 })
            .join(base.flow(route => particles.path(route.points, { key: route.key, count: 2 })))
        const plan = compileConnectors(connectors.join([connectors.empty(), presented]))

        expect(contexts.every(context => Object.keys(context as object).sort().join(',') === 'index,item,key')).toBe(true)
        expect(plan.records).toHaveLength(1)
        expect(plan.records[0].strokes).toHaveLength(1)
        expect(plan.records[0].strokes[0]).toMatchObject({ key: 'shaft', color: 0xff0000, width: 0.03 })
        expect(plan.records[0].flows).toHaveLength(1)
        expect(compileConnectors(connectors.join([])).records).toEqual([])

        const reusable = defineConnectors<{ from: string; to: string }>('dependency', params =>
            connectors.edge(params.from, params.to))
        const scoped = compileConnectors(connectors.join([
            reusable({ from: 'a', to: 'b' }, { scope: 'left' }),
            reusable({ from: 'a', to: 'b' }, { scope: 'right' }),
        ], { operation: 'combine' }))
        expect(scoped.records.map(record => record.key)).toEqual(['left/a->b', 'right/a->b'])
    })

    it('merges routing and keyed layers predictably and lowers built-in profiles to public operators', () => {
        const merged = compileConnectors(connectors.edge('a', 'b')
            .route({ clearance: 0.7, elevation: 0.1 })
            .route({ elevation: 0.8 })
            .stroke({ key: 'shaft', color: 0xff0000 })
            .stroke({ key: 'shaft', width: 0.05 })
            .marker({ end: geo.box() }))
        expect(merged.records[0].routing).toMatchObject({ clearance: 0.7, elevation: 0.8 })
        expect(merged.records[0].strokes).toHaveLength(1)
        expect(merged.records[0].strokes[0]).toMatchObject({ key: 'shaft', color: 0xff0000, width: 0.05 })

        const replaced = compileConnectors(connectors.edge('a', 'b')
            .route({ clearance: 0.7, elevation: 0.6 })
            .route({ strategy: 'bezier', replace: true }))
        expect(replaced.records[0].routing).toMatchObject({ strategy: 'bezier', elevation: 0 })
        expect(replaced.records[0].routing.clearance).toBeUndefined()

        const ground = connectors.edge('a', 'b').profile('ground').marker({ end: geo.box() })
        expect((ground.inputs.connectors as ConnectorSource).kind).toBe('stroke')
        expect(compileConnectors(ground).records[0].strokes).toHaveLength(1)
    })

    it('keeps functional and fluent construction equivalent and frozen', () => {
        const source = connectors.edge('a', 'b', { key: 'a-b' })
        const route = { strategy: 'bezier' as const, elevation: 0.4 }
        const stroke = { color: 0x66cbd2, width: 0.02, markerEnd: 'arrow' as const }
        const fluent = source.route(route).stroke(stroke)
        const functional = connectors.stroke(connectors.route(source, route), stroke)

        expect(connectorGraphSignature(fluent)).toBe(connectorGraphSignature(functional))
        expect(Object.isFrozen(fluent)).toBe(true)
        expect(Object.isFrozen(fluent.inputs)).toBe(true)
        expect(Object.isFrozen(fluent.parameters)).toBe(true)
        expect(Object.isFrozen((source.parameters as any).records[0].to)).toBe(true)
        expect(inspectConnectors(fluent)).toMatchObject({ recordCount: 1, edgeCount: 1, busCount: 0 })
        expect(() => (fluent.parameters as any).color = 0).toThrow()
    })

    it('compiles keyed fields, profiles, layers, bundles, visibility, and names', () => {
        const data = [
            { id: 'critical', from: 'a', to: 'b', critical: true, color: 0xff7755 },
            { id: 'quiet', from: 'a', to: 'c', critical: false, color: 0x66cbd2 },
        ]
        const graph = connectors.edges(data, {
            from: ({ item }) => item.from,
            to: ({ item }) => item.to,
        }).profile(({ item }) => item.critical ? 'ground' : 'air')
            .route({ strategy: ({ item }) => item.critical ? 'orthogonal' : 'spline', lane: 'auto' })
            .bundle({ keyBy: () => 'outbound', width: 0.08 })
            .stroke({ key: 'underlay', color: ({ item }) => item.color, width: 0.04 })
            .stroke({ key: 'shaft', color: 0xffffff, width: 0.012, dash: [0.08, 0.04] })
            .visible(({ item }) => item.id !== 'quiet')
            .named(({ item }) => `dependency:${item.id}`)
        const plan = compileConnectors(graph)

        expect(plan.records.map(record => record.key)).toEqual(['critical', 'quiet'])
        expect(plan.records[0]).toMatchObject({ bundleKey: 'outbound', visible: true, names: ['dependency:critical'] })
        expect(plan.records[0].strokes).toHaveLength(2)
        expect(plan.records[1]).toMatchObject({ profile: 'air', visible: false })
    })

    it('rejects unstable or duplicate collection keys and invalid pipe results', () => {
        expect(() => connectors.edges([{ from: 'a', to: 'b' }], {
            from: ({ item }) => item.from,
            to: ({ item }) => item.to,
        })).toThrow(/require keyBy/)
        expect(() => connectors.edges([
            { id: 'same', from: 'a', to: 'b' },
            { id: 'same', from: 'a', to: 'c' },
        ], { from: ({ item }) => item.from, to: ({ item }) => item.to })).toThrow(/duplicate key/)
        expect(() => connectors.edge('a', 'b').pipe(() => null as unknown as ConnectorSource)).toThrow(/ConnectorSource/)
    })

    it('supports reusable modules and named outputs', () => {
        const dependency = defineConnectors<{ from: string; to: string }>('dependency', params =>
            connectors.edge(params.from, params.to).route({ strategy: 'direct' }))
        const outputs = defineConnectorOutputs('network', (params: { from: string; to: string }) => ({
            solid: dependency(params).stroke(),
            dashed: dependency(params).stroke({ dash: [0.1, 0.05] }),
        }))
        const built = outputs({ from: 'a', to: 'b' })

        expect(built.output('solid')).toBe(built.solid)
        expect(compileConnectors(built.dashed).records).toHaveLength(1)
    })
})

describe('connector host and runtime', () => {
    it('resolves buses as keyed route networks and invokes factories at explicit scopes', () => {
        const { controller, addEndpoint } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, -1))
        addEndpoint('c', new THREE.Vector3(3, 0, 1))
        const traversalContexts: any[] = []
        const networkContexts: any[] = []
        const graph = connectors.bus('a', ['b', 'c'], { key: 'fanout' })
            .flow(context => {
                traversalContexts.push(context)
                return particles.path(context.points, { key: context.key, count: 1 })
            }, { key: 'terminal-flow' })
            .flow(context => {
                networkContexts.push(context)
                return particles.path(context.runs[0].points, { key: context.key, count: 1 })
            }, { key: 'network-flow', scope: 'network' })

        controller.reconcile('owner', compileConnectors(graph))
        const network = controller.getResolvedNetwork('owner', 'fanout')!
        expect(network.memberKeys).toEqual(['fanout'])
        expect(network.junctions.every(junction => junction.memberKeys.includes('fanout'))).toBe(true)
        expect(network.runs.map(run => run.role)).toEqual(expect.arrayContaining(['source', 'trunk', 'branch']))
        expect(network.traversals).toHaveLength(2)
        expect(network.traversals.every(traversal => traversal.runKeys.length >= 2)).toBe(true)
        expect(traversalContexts).toHaveLength(2)
        expect(traversalContexts.every(context => context.scope === 'traversal' && Object.isFrozen(context.points))).toBe(true)
        expect(networkContexts).toHaveLength(1)
        expect(networkContexts[0]).toMatchObject({ scope: 'network', key: 'fanout' })
        controller.clear()
    })

    it('invokes a bundle network factory once with all semantic members', () => {
        const { controller, addEndpoint } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, 0))
        const contexts: any[] = []
        const graph = connectors.edges([
            { id: 'primary', from: 'a', to: 'b' },
            { id: 'backup', from: 'a', to: 'b' },
        ], { from: ({ item }) => item.from, to: ({ item }) => item.to })
            .bundle({ keyBy: () => 'service-link' })
            .flow(network => {
                contexts.push(network)
                return particles.path(network.runs[0].points, { key: 'bundle-flow', count: 1 })
            }, { key: 'bundle-flow', scope: 'network' })

        controller.reconcile('owner', compileConnectors(graph))
        expect(contexts).toHaveLength(1)
        expect(contexts[0]).toMatchObject({
            scope: 'network',
            topology: 'bundle',
            memberKeys: ['primary', 'backup'],
        })
        expect(contexts[0].traversals).toHaveLength(2)
        expect(controller.getResolvedNetwork('owner', 'service-link')?.topology).toBe('bundle')
        expect(controller.connectorDiagnostics().particleEmitterCount).toBe(1)
        controller.clear()
    })

    it('propagates shared parameters into particle and geometry compiler bridges', () => {
        const { controller, addEndpoint } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-2, 0, 0))
        addEndpoint('b', new THREE.Vector3(2, 0, 0))
        const count = connectors.param<number>('count')
        const width = connectors.param<number>('markerWidth')
        const graph = connectors.edge('a', 'b', { key: 'parameterized' })
            .flow(route => particles.path(route.points, { key: 'flow', count }))
            .geometry(() => geo.box({ key: 'marker', width, height: 0.1, depth: 0.1 }))
        controller.reconcile('owner', compileConnectors(graph), undefined, { count: 7, markerWidth: 0.25 })
        expect(controller.connectorDiagnostics()).toMatchObject({ particleEmitterCount: 1, geometryRecordCount: 1 })
        const points = controller.stage.scene.getObjectByName('vx-connector-particles-owner-parameterized')
        expect(points).toBeDefined()
        controller.clear()
    })

    it('reports the actual raycast point and normalized traversal progress', () => {
        const { controller, addEndpoint } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, 0))
        controller.reconcile('owner', compileConnectors(
            connectors.edge('a', 'b', { key: 'a-b' }).route({ strategy: 'direct' }).stroke(),
        ), { interactive: true, dispatch: vi.fn() })
        const network = controller.getResolvedNetwork('owner', 'a-b')!
        const points = network.traversals[0].points
        const clicked = points[0].clone().lerp(points.at(-1)!, 0.75)
        const object = (controller as any).strokeBackend.objectFor('owner:a-b:stroke:shaft') as THREE.Object3D
        const hit = controller.hitAt(object, undefined, { point: clicked } as THREE.Intersection) as any
        expect(hit.point).toEqual(clicked.toArray())
        expect(hit.pathPosition).toBeCloseTo(0.75, 5)
        controller.clear()
    })

    it('keeps graph hosts in raw host order but outside spatial projection and stage identity', () => {
        const registerNode = vi.fn()
        const removeOwner = vi.fn()
        const stage = { registerNode, connectors: { removeOwner } } as unknown as VuetrexStage
        const root = new HostRoot()
        const before = new HostRoot()
        const host = new ConnectorGraphHost(stage)
        const after = new HostRoot()

        root.appendChild(before)
        root.appendChild(host)
        root.appendChild(after)

        expect(root.elements.value).toEqual([])
        expect(host.getHostParent()).toBe(root)
        expect(before.getHostNextSibling()).toBe(host)
        expect(host.getHostNextSibling()).toBe(after)
        expect(host.isRenderableNode()).toBe(false)
        expect(registerNode).not.toHaveBeenCalled()
        expect((host as any).element).toBeUndefined()

        root.removeChild(host)
        expect(removeOwner).toHaveBeenCalledWith(host.ownerId)
    })

    it('preserves path identity and stroke allocations across stable-key reorder', () => {
        const { controller, addEndpoint } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, -1))
        addEndpoint('c', new THREE.Vector3(3, 0, 1))
        const items = [
            { id: 'a-b', from: 'a', to: 'b', color: 0xff6644 },
            { id: 'a-c', from: 'a', to: 'c', color: 0x55ccdd },
        ]
        const build = (values: typeof items) => connectors.edges(values, {
            from: ({ item }) => item.from,
            to: ({ item }) => item.to,
        }).route({ strategy: 'direct' }).stroke({ color: ({ item }) => item.color })

        controller.reconcile('owner', compileConnectors(build(items)))
        const path = controller.getResolvedNetwork('owner', 'a-b')
        const before = controller.connectorDiagnostics()
        controller.reconcile('owner', compileConnectors(build([...items].reverse())))
        const after = controller.connectorDiagnostics()

        expect(controller.getResolvedNetwork('owner', 'a-b')).toBe(path)
        expect(after.routeBuildCount).toBe(before.routeBuildCount)
        expect(after.decorationUpdateCount).toBe(before.decorationUpdateCount)
        controller.clear()
    })

    it('reroutes only dependent records and resolves custom and local endpoints', () => {
        const { controller, addEndpoint, scene } = makeHarness()
        const a = addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, 0))
        addEndpoint('c', new THREE.Vector3(0, 0, 4))
        const graph = connectors.join([
            connectors.edge({ node: 'a', port: { name: 'signal' } }, 'b', { key: 'ab' }).route({ strategy: 'direct' }),
            connectors.edge('b', { position: [0, 0, 1], space: { node: 'c' } }, { key: 'bc-local' }).route({ strategy: 'manual', waypoints: [[2, 1, 2]] }),
        ]).stroke()
        controller.reconcile('owner', compileConnectors(graph))
        const untouched = controller.getResolvedNetwork('owner', 'bc-local')
        const before = controller.connectorDiagnostics().routeBuildCount

        a.mesh!.position.x -= 1
        scene.updateMatrixWorld(true)
        controller.update(a)

        expect(controller.getResolvedNetwork('owner', 'ab')!.from.point.x).toBeCloseTo(-3)
        expect(controller.getResolvedNetwork('owner', 'bc-local')).toBe(untouched)
        expect(controller.connectorDiagnostics().routeBuildCount).toBe(before + 1)
        controller.clear()
    })

    it('updates only the changed stroke and particle program', () => {
        const { controller, addEndpoint, scene } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        const b = addEndpoint('b', new THREE.Vector3(3, 0, -1))
        addEndpoint('c', new THREE.Vector3(3, 0, 1))
        const flow: ConnectorFlowFactory<any> = route =>
            particles.path(route.points, { key: route.key, item: route.item, count: 2 })
        const build = (firstColor: number) => connectors.edges([
            { id: 'ab', from: 'a', to: 'b', color: firstColor },
            { id: 'ac', from: 'a', to: 'c', color: 0x55ccdd },
        ], { from: ({ item }) => item.from, to: ({ item }) => item.to })
            .route({ strategy: 'direct' })
            .stroke({ color: ({ item }) => item.color })
            .flow(flow)

        controller.reconcile('owner', compileConnectors(build(0xff6644)))
        const initial = controller.connectorDiagnostics()
        controller.reconcile('owner', compileConnectors(build(0xffaa44)))
        const recolored = controller.connectorDiagnostics()
        expect(recolored.routeBuildCount).toBe(initial.routeBuildCount)
        expect(recolored.particleProgramBuildCount).toBe(initial.particleProgramBuildCount)
        expect(recolored.decorationUpdateCount).toBe(initial.decorationUpdateCount + 1)

        b.mesh!.position.x += 0.5
        scene.updateMatrixWorld(true)
        controller.update(b)
        const moved = controller.connectorDiagnostics()
        expect(moved.routeBuildCount).toBe(recolored.routeBuildCount + 1)
        expect(moved.particleProgramBuildCount).toBe(recolored.particleProgramBuildCount + 1)
        controller.clear()
    })

    it.each([undefined, 'catmull-rom'] as const)('uses exact connector segments unless smoothing is explicit (%s)', interpolation => {
        const { controller, scene } = makeHarness()
        const graph = connectors.edge({ position: [0, 0, 0] }, { position: [1, 0, 3] }, { key: 'elbow' })
            .route({ strategy: 'manual', waypoints: [[1, 0, 0]], elevation: 0, lane: 0 })
            .flow(route => particles.path(route.points, { count: 8, interpolation }))
        controller.reconcile('owner', compileConnectors(graph))
        const points = scene.getObjectByName('vx-connector-particles-owner-elbow')!.children[0] as THREE.Points
        const positions = points.geometry.getAttribute('position')
        const offRoute = Array.from({ length: positions.count }, (_, i) => {
            const x = positions.getX(i)
            const z = positions.getZ(i)
            return !((Math.abs(z) < 1e-6 && x >= 0 && x <= 1)
                || (Math.abs(x - 1) < 1e-6 && z >= 0 && z <= 3))
        }).some(Boolean)
        expect(offRoute).toBe(interpolation === 'catmull-rom')
        controller.clear()
    })

    it('defers traversal effects on collapsed routes and restores them after layout', () => {
        const { controller, addEndpoint, scene } = makeHarness()
        addEndpoint('a', new THREE.Vector3())
        const b = addEndpoint('b', new THREE.Vector3())
        const flow = vi.fn(route => particles.path(route.points, { count: 3 }))
        const geometry = vi.fn(route => geo.line({ points: route.points, thickness: 0.01 }))
        const graph = connectors.edge('a', 'b', { key: 'ab' })
            .route({ strategy: 'direct', fromPort: 'center', toPort: 'center' })
            .flow(flow).geometry(geometry)
        controller.reconcile('owner', compileConnectors(graph))
        expect(flow).not.toHaveBeenCalled()
        expect(geometry).not.toHaveBeenCalled()
        expect(controller.connectorDiagnostics().particleEmitterCount).toBe(0)

        b.mesh!.position.x = 3
        scene.updateMatrixWorld(true)
        controller.update(b)
        expect(flow).toHaveBeenCalledTimes(1)
        expect(geometry).toHaveBeenCalledTimes(1)
        expect(controller.connectorDiagnostics().particleEmitterCount).toBe(1)

        b.mesh!.position.x = 0
        scene.updateMatrixWorld(true)
        controller.update(b)
        expect(flow).toHaveBeenCalledTimes(1)
        expect(controller.connectorDiagnostics()).toMatchObject({ particleEmitterCount: 0, geometryRecordCount: 0 })
        controller.clear()
    })

    it('retains keyed GPU flows and disposes route resources on replacement and unmount', () => {
        const { controller, scene, stopFrame } = makeHarness()
        const graph = (end: number) => connectors.edge({ position: [0, 0, 0] }, { position: [end, 0, 0] }, { key: 'gpu' })
            .route({ strategy: 'direct' })
            .flow(route => particles.path(route.points, { count: 2 }))
        const source = graph(3)
        controller.reconcile('owner', compileConnectors(source))
        const object = scene.getObjectByName('vx-connector-particles-owner-gpu')!
        const points = object.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
        const texture = points.material.uniforms.pathMotionTexture.value as THREE.DataTexture
        const disposeTexture = vi.spyOn(texture, 'dispose')
        const disposeGeometry = vi.spyOn(points.geometry, 'dispose')
        const disposeMaterial = vi.spyOn(points.material, 'dispose')
        controller.reconcile('owner', compileConnectors(source))
        expect(scene.getObjectByName(object.name)).toBe(object)
        expect(disposeTexture).not.toHaveBeenCalled()
        controller.reconcile('owner', compileConnectors(graph(6)))
        expect(disposeTexture).toHaveBeenCalledOnce()
        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
        const replacement = scene.getObjectByName(object.name)!.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
        const disposeReplacement = vi.spyOn(replacement.material.uniforms.pathMotionTexture.value, 'dispose')
        controller.clear()
        controller.clear()
        expect(disposeReplacement).toHaveBeenCalledOnce()
        expect(stopFrame).toHaveBeenCalledOnce()
    })

    it('keeps TabA dense additive flows moving through the public graph API', () => {
        const { controller, addEndpoint, scene, frameCallbacks } = makeHarness()
        for (const [index, id] of ['b2', 'b3', 'c2', 'd1'].entries()) {
            addEndpoint(id, new THREE.Vector3(index * 3, 0, 0))
        }
        controller.reconcile('tab-a', compileConnectors(tabAConnectors(0, false)))
        expect(controller.connectorDiagnostics()).toMatchObject({
            resolvedCount: 3, particleEmitterCount: 3, strokeCount: 0,
        })
        const flow = scene.getObjectByName('vx-connector-particles-tab-a-b3:b2')!
        const points = flow.children[0] as THREE.Points
        const route = controller.getResolvedNetwork('tab-a', 'b3:b2')!
        expect(points.geometry.getAttribute('position').count).toBe(Math.round(route.totalLength * 1000))
        expect((points.material as THREE.Material).blending).toBe(THREE.AdditiveBlending)
        const sizes = points.geometry.getAttribute('particleSize').array as Float32Array
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(0.01799)
        expect(Math.max(...sizes)).toBeLessThanOrEqual(0.03001)
        const positions = points.geometry.getAttribute('position').array
        const before = [...positions]
        frameCallbacks[0](0, 1)
        frameCallbacks[0](1000, 2)
        expect([...positions]).toEqual(before)
        expect(points.userData.vxParticleAdapter).toBe('gpu-path')
        expect((points.material as THREE.ShaderMaterial).uniforms.pathMotionTime.value).toBe(1)
        expect(compileConnectors(tabAConnectors(2, true)).records).toHaveLength(7)
        controller.clear()
    })

    it('shares resolved paths across stroke, dash, markers, flow, geometry, bus, and bundle output', () => {
        const { controller, addEndpoint, onEachFrame, stopFrame } = makeHarness()
        addEndpoint('a', new THREE.Vector3(-3, 0, 0))
        addEndpoint('b', new THREE.Vector3(3, 0, -1))
        addEndpoint('c', new THREE.Vector3(3, 0, 1))
        const marker = geo.box({ width: 0.08, height: 0.08, depth: 0.08 })
        const edges = connectors.edges([
            { id: 'ab', from: 'a', to: 'b' },
            { id: 'ac', from: 'a', to: 'c' },
        ], { from: ({ item }) => item.from, to: ({ item }) => item.to })
            .route({ strategy: 'bezier', elevation: 0.4 })
            .bundle({ keyBy: () => 'a-outbound' })
            .stroke({ key: 'underlay', width: 0.05 })
            .stroke({ key: 'shaft', width: 0.012, dash: [0.09, 0.04] })
            .marker({ end: marker })
            .flow(route => particles.path(route.points, { key: route.key, item: route.item, count: 3 }))
            .geometry(route => geo.line({ points: route.points, thickness: 0.006 }))
        const graph = edges.join(connectors.bus('a', ['b', 'c'], { key: 'fanout' }).stroke())

        controller.reconcile('owner', compileConnectors(graph))
        const diagnostics = controller.connectorDiagnostics()
        expect(diagnostics).toMatchObject({ authoredCount: 3, resolvedCount: 3, busCount: 1, bundledCount: 1 })
        expect(diagnostics.strokeCount).toBeGreaterThanOrEqual(6)
        expect(diagnostics.particleEmitterCount).toBe(2)
        expect(diagnostics.geometryRecordCount).toBeGreaterThan(0)
        expect(onEachFrame).toHaveBeenCalledTimes(1)

        controller.removeOwner('owner')
        expect(controller.connectorDiagnostics()).toMatchObject({ ownerCount: 0, resolvedCount: 0, strokeCount: 0 })
        expect(stopFrame).toHaveBeenCalledTimes(1)
        controller.clear()
    })

    it('snapshots registered strategy and stroke backend extensions per stage', () => {
        const reconcile = vi.fn()
        const dispose = vi.fn()
        const unregisterAppearance = registerConnectorAppearance('stroke', () => ({ reconcile, dispose }))
        const unregisterStrategy = registerConnectorStrategy('test-elbow', {
            resolve: context => {
                expect(Object.isFrozen(context.from.point)).toBe(true)
                return { points: Object.freeze([
                    context.from.point,
                    [context.from.point[0], 2, context.to.point[2]] as const,
                    context.to.point,
                ]) }
            },
        })
        try {
            const { controller, addEndpoint } = makeHarness()
            addEndpoint('a', new THREE.Vector3(-2, 0, 0))
            addEndpoint('b', new THREE.Vector3(2, 0, 1))
            const graph = connectors.edge('a', 'b').route({ strategy: 'test-elbow' }).stroke()
            controller.reconcile('owner', compileConnectors(graph))

            expect(controller.getResolvedNetwork('owner', 'a->b')?.traversals[0].points).toHaveLength(3)
            expect(reconcile).toHaveBeenCalledTimes(1)
            controller.clear()
            expect(dispose).toHaveBeenCalledTimes(1)
        } finally {
            unregisterAppearance()
            unregisterStrategy()
        }
    })
})

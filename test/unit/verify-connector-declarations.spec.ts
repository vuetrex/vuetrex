import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, queuePostFlushCb, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import { Base } from '@/lib-components/nodes/Base.js'
import { Node } from '@/lib-components/nodes/Node.js'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { PortDeclaration } from '@/lib-components/nodes/PortDeclaration.js'
import { ConnectorGraphHost, EdgeDeclaration } from '@/lib-components/nodes/ConnectorGraphHost.js'
import { Connectors } from '@/lib-components/three/connectors/connectors.js'
import { createRendererForStage } from '@/lib-components/renderer.js'
import { compileEdge, lowerEdge, presentPlan } from '@/lib-components/connectors/declarations.js'
import { declaredPortDefinition } from '@/lib-components/connectors/compiler/ports.js'
import { compileConnectors, connectors } from '@/lib-components/connectors/index.js'
import { defineVxStyleSheet, mergeConnectorAppearances } from '@/lib-components/styling/stylesheets.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import { patchProp } from '@/lib-components/patchProp.js'

class HostRoot extends Base { protected state = {} }
class Endpoint extends Node {
    constructor(stage: VuetrexStage) {
        super(stage)
        this.element.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial())
        this.element.mesh.userData.el = this.element
        stage.getScene().add(this.element.mesh)
    }
    override onRemoved() { this.element.mesh?.removeFromParent() }
}
const cleanups: Array<() => void> = []
afterEach(async () => { cleanups.splice(0).reverse().forEach(clean => clean()); await nextTick() })
function harness() {
    const scene = new THREE.Scene()
    const elements = new Map<string, Element3d>()
    const stage = {
        scene, settings: {}, boxDistance: 1, boxRadius: 0.1,
        getScene: () => scene, getById: (id: string) => elements.get(id),
        registerNode: (node: Node) => elements.set(node.id, node.element),
        unregisterNode: (node: Node) => elements.delete(node.id),
        createElementMaterial: () => new THREE.MeshStandardMaterial(),
        onEachFrame: () => () => {}, registerAnimation: () => () => {}, shadowsEnabled: () => false,
        removeObject: () => {}, invalidateContentBounds: () => {},
    } as unknown as VuetrexStage
    stage.connectors = new Connectors(stage)
    stage.connectorAppearances = shallowRef({ primary: { strokeColor: '#123456', strokeWidth: 0.07 } }) as any
    const root = new HostRoot()
    const render = createRendererForStage(stage, { 'test-node': Endpoint })
    cleanups.push(() => { render(null, root); stage.connectors.clear() })
    const endpoint = (id: string, x = 0) => {
        const node = new Endpoint(stage); node.id = id; node.element.mesh!.position.x = x
        root.appendChild(node); return node
    }
    const port = (owner: Node, name: string, props: Record<string, unknown> = { face: 'right' }) => {
        const value = new PortDeclaration(stage)
        value.setStateValue('name', name)
        Object.entries(props).forEach(([key, val]) => value.setStateValue(key, val))
        owner.appendChild(value); return value
    }
    const edge = (owner: Base, key: string, props: Record<string, unknown>) => {
        const value = new EdgeDeclaration(stage); value.declarationKey = key
        Object.entries(props).forEach(([key, val]) => value.setStateValue(key, val))
        owner.appendChild(value); return value
    }
    return { stage, root, render, endpoint, port, edge }
}

describe('connector template declarations', () => {
    it.each(['host', 'edge'])('reconciles all multi-word %s props in both spellings and restores inherited defaults', async target => {
        const { stage, render, root } = harness()
        const defaults = { routeStrategy: 'orthogonal', strokeColor: '#123456', strokeWidth: 0.07,
            strokeOpacity: 0.6, markerStart: 'dot', markerEnd: 'arrow' }
        stage.connectorAppearances = shallowRef({ primary: defaults }) as any
        const draw = (props: Record<string, unknown>) => {
            render(h('vx-connectors', { scope: 'audited', appearance: 'primary', ...(target === 'host' ? props : {}) }, [
                h('vx-edge', { key: 'link', from: 'a', to: 'b', ...(target === 'edge' ? props : {}) }),
            ]), root)
        }
        const expected = (style: typeof defaults) => {
            const record = stage.connectors.get({ scope: 'audited', key: 'link' })!.authored
            expect(record.routing.strategy).toBe(style.routeStrategy)
            expect(record.strokes[0]).toMatchObject({ color: style.strokeColor, width: style.strokeWidth,
                opacity: style.strokeOpacity, markerStart: style.markerStart, markerEnd: style.markerEnd })
        }
        const kebab = { 'route-strategy': 'direct', 'stroke-color': '#ffffff', 'stroke-width': '0.2',
            'stroke-opacity': '0.8', 'marker-start': 'diamond', 'marker-end': 'none' }
        draw(kebab); await nextTick()
        expected({ routeStrategy: 'direct', strokeColor: '#ffffff', strokeWidth: 0.2, strokeOpacity: 0.8, markerStart: 'diamond', markerEnd: 'none' })
        const camel = { routeStrategy: 'bezier', strokeColor: '#ff0000', strokeWidth: 0.3, strokeOpacity: 0.9, markerStart: 'none', markerEnd: 'dot' }
        draw(camel); await nextTick(); expected(camel)
        draw({}); await nextTick(); expected(defaults)
        draw(kebab); await nextTick()
        draw(Object.fromEntries(Object.keys(kebab).map(key => [key, undefined]))); await nextTick(); expected(defaults)
    })

    it.each([ConnectorGraphHost, EdgeDeclaration])('validates both spellings before updating %s', Type => {
        const { stage } = harness()
        const node = new Type(stage)
        const invalid: Record<string, unknown[]> = {
            strokeWidth: [-1, NaN, Infinity, true, false, [], [1], {}, '', ' ', 'bad'],
            strokeOpacity: [-1, 1.1, NaN, true, [], '', 'bad'],
            routeStrategy: ['', ' ', false, 1, {}],
            markerStart: [true, '', 'triangle', 1, {}],
            markerEnd: [true, '', 'triangle', 1, {}],
            strokeColor: [false, [], {}, NaN, Infinity, -1, 1.2, '', ' '],
        }
        const valid: Record<string, unknown> = { strokeWidth: 0.2, strokeOpacity: 0.5, routeStrategy: 'custom-route',
            markerStart: false, markerEnd: 'arrow', strokeColor: new THREE.Color('red') }
        for (const [camel, values] of Object.entries(invalid)) {
            const kebab = camel.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
            for (const key of [camel, kebab]) {
                patchProp(node, key, null, valid[camel])
                for (const value of values) expect(() => patchProp(node, key, valid[camel], value)).toThrow()
                expect((node as any).state[camel]).toBe(valid[camel])
                for (const removed of [null, undefined]) {
                    patchProp(node, key, valid[camel], removed)
                    expect((node as any).state[camel]).toBeUndefined()
                }
            }
        }
        for (const key of ['from-port', 'fromPort', 'to-port', 'toPort']) expect(() => patchProp(node, key, null, 'left')).toThrow('no longer accepts')
        expect(() => patchProp(node, 'stroke-wdth', null, 1)).toThrow('Unknown')
        expect(() => patchProp(node, 'interactive', null, 'yes')).toThrow('boolean')
        for (const removed of [null, undefined]) {
            patchProp(node, 'interactive', null, true)
            patchProp(node, 'interactive', true, removed)
            expect((node as any).state.interactive).toBe(false)
            patchProp(node, 'parameters', null, { amount: 2 })
            patchProp(node, 'parameters', { amount: 2 }, removed)
            expect((node as any).state.parameters).toEqual({})
            patchProp(node, 'graph', null, connectors.edge('a', 'b'))
            patchProp(node, 'graph', null, removed)
            expect((node as any).state.graph).toBeUndefined()
        }
        expect(() => patchProp(node, 'graph', null, {})).toThrow('ConnectorSource')
        expect(() => patchProp(node, 'parameters', null, [])).toThrow('object')
        const listener = vi.fn()
        patchProp(node, 'onClick', null, listener)
        patchProp(node, 'onClick', listener, null)
        expect(() => patchProp(node, 'onClick', null, 'bad')).toThrow('function')
    })

    it('validates port values and restores optional defaults after removal', () => {
        const { stage } = harness()
        const node = new PortDeclaration(stage)
        patchProp(node, 'name', null, 'output'); patchProp(node, 'face', null, 'right')
        for (const at of [false, '', 'xx', {}, [0], [0, 2], [0, NaN], new Array(2)]) {
            patchProp(node, 'at', null, at)
            expect(() => node.snapshot()).toThrow('coordinates')
        }
        patchProp(node, 'at', null, null)
        patchProp(node, 'direction', null, '')
        expect(() => node.snapshot()).toThrow('direction')
        patchProp(node, 'direction', '', undefined)
        expect(node.snapshot()).toMatchObject({ name: 'output', face: 'right', at: undefined, direction: undefined })
        patchProp(node, 'face', 'right', null)
        patchProp(node, 'position', null, new Array(3))
        patchProp(node, 'normal', null, [1, 0, 0])
        expect(() => node.snapshot()).toThrow('finite position and normal')
        patchProp(node, 'position', null, null)
        patchProp(node, 'normal', null, null)
        patchProp(node, 'face', null, 'right')
        for (const key of ['override', 'disabled']) {
            patchProp(node, key, null, '')
            expect((node as any).state[key]).toBe(true)
            for (const removed of [null, undefined]) {
                patchProp(node, key, true, removed)
                expect((node as any).state[key]).toBe(false)
            }
            expect(() => patchProp(node, key, null, 'yes')).toThrow('boolean')
        }
        expect(() => patchProp(node, 'unknown-prop', null, 1)).toThrow('Unknown')
        patchProp(node, 'name', 'output', null)
        expect(() => node.snapshot()).toThrow('unique name')
    })

    it('lowers local, central, and graph edges into equivalent frozen records', () => {
        const record = { key: 'a-b', from: 'a.output', to: 'b.input' }
        const local = compileEdge(record, 'a')
        const central = compileEdge(record)
        const graph = compileConnectors(connectors.edge({ node: 'a', port: { name: 'output' } }, { node: 'b', port: { name: 'input' } }, { key: 'a-b' }))
        expect(local).toEqual(central); expect(local).toEqual(graph)
        expect(Object.isFrozen(local.records[0])).toBe(true)
        expect(() => lowerEdge({ ...record, key: '' }, 'a')).toThrow('stable Vue key')
        expect(() => lowerEdge({ ...record, from: 'wrong' }, 'a')).toThrow('direct spatial parent')
    })

    it('parses template endpoints without changing graph endpoint semantics', () => {
        const literal = compileEdge({ key: 'link', from: 'node1.output', to: 'node2.input' })
        const bound = compileEdge({ key: 'link', from: { node: 'node1', port: { name: 'output' } }, to: { node: 'node2', port: { name: 'input' } } })
        const graph = compileConnectors(connectors.edge({ node: 'node1', port: { name: 'output' } }, { node: 'node2', port: { name: 'input' } }, { key: 'link' }))
        expect(literal).toEqual(bound)
        expect(literal).toEqual(graph)
        const bare = compileEdge({ key: 'bare', from: 'node1', to: 'node2' })
        expect(bare.records[0].from).toBe('node1')
        expect(bare.records[0].to).toEqual(['node2'])
        expect(bare.records[0].routing.fromPort).toBe('auto')
        expect(bare.records[0].routing.toPort).toBe('auto')
        const dotted = compileEdge({ key: 'dotted', from: { node: 'district.node1', port: { name: 'data.out' } }, to: { node: 'district.node2', port: { name: 'input' } } }, 'district.node1')
        expect(dotted.records[0].from).toEqual({ node: 'district.node1', port: { name: 'data.out' } })
        expect(dotted.records[0].to).toEqual([{ node: 'district.node2', port: { name: 'input' } }])
        expect(() => lowerEdge({ key: 'bad', from: 'district.node1.output', to: 'b' })).toThrow('containing a dot')
        for (const from of ['', '.output', 'node.', 'node..output']) {
            expect(() => lowerEdge({ key: 'bad', from, to: 'b' })).toThrow('vx-edge from')
        }
        expect(() => lowerEdge({ key: 'bad', from: 'a', to: 'b.' })).toThrow('vx-edge to')
        expect(() => lowerEdge({ key: 'bad', from: 'a', to: { node: 'b', port: { name: '' } } })).toThrow('vx-edge to')
        expect(() => lowerEdge({ key: 'bad', from: { node: 'other', port: { name: 'output' } }, to: 'b' }, 'a')).toThrow('direct spatial parent')
    })

    it('keeps bare-node automatic routing distinct from a declared port', async () => {
        const { stage, endpoint, port, edge } = harness()
        const a = endpoint('a'), b = endpoint('b', 8)
        port(b, 'input', { face: 'top' })
        const bare = edge(a, 'bare', { to: 'b' })
        const named = edge(a, 'named', { to: 'b.input' })
        await nextTick()
        const automatic = stage.connectors.getResolvedNetwork(bare.ownerId, 'bare')!
        const selected = stage.connectors.getResolvedNetwork(named.ownerId, 'named')!
        expect(automatic.to[0].normal.x).toBe(-1)
        expect(selected.to[0].normal.y).toBe(1)
        expect(() => named.setStateValue('to-port', 'input')).toThrow('no longer accepts')
        expect(() => named.setStateValue('to', 'b.')).toThrow('vx-edge to')
    })

    it('mounts declarations through component and wrapper slots, preserving public handles across reorder', async () => {
        const { stage, root, render } = harness()
        const order = ref(['one', 'two'])
        const show = ref(true)
        const Component = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h('test-node', attrs, [h('vx-port', { name: 'output', face: 'right' }), slots.ports?.(), slots.connections?.()]) })
        const NoPorts = defineComponent({ inheritAttrs: false, setup: (_, { attrs }) => () => h('test-node', attrs) })
        const Wrapper = defineComponent({ inheritAttrs: false, setup: (_, { attrs, slots }) => () => h(Component, attrs, slots) })
        const App = defineComponent({ setup: () => () => h('test-node', { id: 'assembly' }, [
            h(Wrapper, { id: 'a.with.period' }, { ports: () => h('vx-port', { name: 'extra', face: 'front' }), connections: () => h('vx-edge', { key: 'local', from: { node: 'a.with.period', port: { name: 'extra' } }, to: 'b' }) }),
            h('test-node', { id: 'b' }),
            h(NoPorts, { id: 'closed' }, { ports: () => h('vx-port', { name: 'hidden', face: 'right' }) }),
            h('vx-connectors', { scope: 'diagram' }, show.value ? order.value.map(key => h('vx-edge', { key, from: { node: 'a.with.period', port: { name: 'output' } }, to: 'b' })) : []),
        ]) })
        render(h(App), root); await nextTick()
        expect(stage.connectors.list()).toHaveLength(3)
        expect(stage.connectors.portsOf('closed')).toEqual([])
        expect(stage.connectors.portsOf('a.with.period').map(p => p.name)).toEqual(['output', 'extra'])
        const local = stage.connectors.get({ scope: 'a.with.period', key: 'local' })!
        expect(local.authored.from).toEqual({ node: 'a.with.period', port: { name: 'extra' } })
        const before = stage.connectors.connectorDiagnostics().routeBuildCount
        order.value.reverse(); await nextTick()
        expect(stage.connectors.connectorDiagnostics().routeBuildCount).toBe(before)
        show.value = false; await nextTick()
        expect(stage.connectors.list()).toHaveLength(1)
        render(null, root); await nextTick()
        expect(stage.connectors.list()).toEqual([])
        expect(stage.connectors.portsOf('a.with.period')).toEqual([])
    })

    it('waits for child mesh effects before resolving a group face port', async () => {
        const { stage, endpoint, port, edge } = harness()
        const group = endpoint('assembly')
        group.element.mesh!.removeFromParent()
        group.element.mesh = new THREE.Group()
        stage.getScene().add(group.element.mesh)
        class DeferredMesh extends Node {
            private installed = false
            constructor() { super(stage) }
            override syncWithThree() {
                if (this.installed) return
                this.installed = true
                queuePostFlushCb(() => {
                    this.element.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6), new THREE.MeshBasicMaterial())
                    group.element.mesh!.add(this.element.mesh)
                    stage.connectors.reconcileConnections()
                })
            }
        }
        group.appendChild(new DeferredMesh())
        endpoint('target', 10)
        port(group, 'output', { face: 'right' })
        edge(group, 'connection', { from: 'assembly.output', to: 'target' })
        await nextTick()
        expect(stage.connectors.get({ scope: 'assembly', key: 'connection' })!.unresolved).toEqual([])
    })

    it('transforms all six local faces and exact normals through rotated nonuniform ancestors', async () => {
        const { stage, endpoint, port, edge } = harness()
        const owner = endpoint('cafe'); endpoint('target', 12)
        const ancestor = new THREE.Group(); stage.getScene().add(ancestor); ancestor.add(owner.element.mesh!)
        ancestor.position.set(2, 3, 4); ancestor.rotation.set(0.2, 0.7, -0.3); ancestor.scale.set(2, 3, 0.5)
        const faces = ['left', 'right', 'front', 'back', 'top', 'bottom']
        faces.forEach(face => { port(owner, face, { face, at: [0.25, 0.75] }); edge(owner, face, { from: `cafe.${face}`, to: 'target', routeStrategy: 'direct' }) })
        port(owner, 'exact', { position: [2, 1, 4], normal: [1, 2, 3] }); edge(owner, 'exact', { from: 'cafe.exact', to: 'target' })
        await nextTick()
        const expected = [[-1, 1, -1.5], [1, 1, -1.5], [-0.5, 1, 3], [-0.5, 1, -3], [-0.5, 2, 1.5], [-0.5, -2, 1.5]]
        const normals = [[-1,0,0], [1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0]]
        owner.element.mesh!.updateWorldMatrix(true, true)
        for (const [i, face] of faces.entries()) {
            const result = stage.connectors.get({ scope: 'cafe', key: face })!
            expect(result.unresolved).toEqual([])
            const declaration = owner.declaredConnectorPorts.get(face)!
            expect(declaredPortDefinition(owner.element, declaration)?.position).toEqual(expected[i])
            const actual = stage.connectors.getResolvedNetwork((owner.getHostChildren().find(c => c instanceof EdgeDeclaration && c.declarationKey === face) as EdgeDeclaration).ownerId, face)!.from
            expect(actual.point.distanceTo(new THREE.Vector3(...expected[i]).applyMatrix4(owner.element.mesh!.matrixWorld))).toBeLessThan(1e-8)
            expect(actual.normal.distanceTo(new THREE.Vector3(...normals[i]).applyMatrix3(new THREE.Matrix3().getNormalMatrix(owner.element.mesh!.matrixWorld)).normalize())).toBeLessThan(1e-8)
        }
        const exact = owner.getHostChildren().find(c => c instanceof EdgeDeclaration && c.declarationKey === 'exact') as EdgeDeclaration
        expect(stage.connectors.getResolvedNetwork(exact.ownerId, 'exact')!.from.normal.length()).toBeCloseTo(1)
        const mesh = owner.element.mesh as THREE.Mesh
        mesh.geometry.dispose(); mesh.geometry = new THREE.BoxGeometry(4, 4, 6)
        stage.connectors.update(owner.element)
        expect(declaredPortDefinition(owner.element, owner.declaredConnectorPorts.get('right')!)?.position[0]).toBe(2)
    })

    it('resolves late ports, deterministic overrides, disabled diagnostics and fallback after removal', async () => {
        const { stage, endpoint, port, edge } = harness()
        const a = endpoint('a'); endpoint('b', 10)
        const relationship = edge(a, 'edge', { from: 'a.signal', to: 'b' })
        await nextTick()
        expect(stage.connectors.get({ scope: 'a', key: 'edge' })!.unresolved).toEqual(['missing port: a/signal'])
        const base = port(a, 'signal', { face: 'left' })
        const override = port(a, 'signal', { override: '', face: 'right' })
        a.insertBefore(override, base)
        await nextTick()
        expect(stage.connectors.getResolvedNetwork(relationship.ownerId, 'edge')!.from.normal.x).toBe(1)
        override.setStateValue('disabled', true); await nextTick()
        expect(stage.connectors.get({ scope: 'a', key: 'edge' })!.unresolved).toEqual(['disabled port: a/signal'])
        a.removeChild(override); await nextTick()
        expect(stage.connectors.getResolvedNetwork(relationship.ownerId, 'edge')!.from.normal.x).toBe(-1)
        a.removeChild(base); await nextTick()
        expect(stage.connectors.get({ scope: 'a', key: 'edge' })!.unresolved).toEqual(['missing port: a/signal'])
    })

    it('restores appearance defaults when props disappear without rerouting', async () => {
        const { stage, endpoint, root } = harness()
        endpoint('a'); endpoint('b', 8)
        const host = new ConnectorGraphHost(stage)
        host.setStateValue('scope', 'styled'); host.setStateValue('appearance', 'primary')
        host.setStateValue('graph', connectors.edge('a', 'b', { key: 'link' }))
        root.appendChild(host); await nextTick()
        const path = stage.connectors.getResolvedNetwork(host.ownerId, 'link')
        host.setStateValue('stroke-color', '#ffffff'); await nextTick()
        expect(stage.connectors.get({ scope: 'styled', key: 'link' })!.authored.strokes[0].color).toBe('#ffffff')
        expect(stage.connectors.getResolvedNetwork(host.ownerId, 'link')).toBe(path)
        host.setStateValue('stroke-color', null); await nextTick()
        expect(stage.connectors.get({ scope: 'styled', key: 'link' })!.authored.strokes[0].color).toBe('#123456')
        expect(stage.connectors.getResolvedNetwork(host.ownerId, 'link')).toBe(path)
        const explicit = presentPlan(compileConnectors(connectors.edge('a', 'b').stroke({ width: 0.3 }).route({ clearance: 2 })), { strokeWidth: 0.1, clearance: 1 })
        expect(explicit.records[0].strokes[0].width).toBe(0.3); expect(explicit.records[0].routing.clearance).toBe(2)
        const inherited = presentPlan(compileConnectors(connectors.edge('a', 'b')
            .stroke({ color: undefined, opacity: undefined }).route({ clearance: undefined })),
            { strokeColor: 'red', strokeOpacity: 0.5, clearance: 0.3 })
        expect(inherited.records[0].strokes[0]).toMatchObject({ color: 'red', opacity: 0.5 })
        expect(inherited.records[0].routing.clearance).toBe(0.3)
        const sheet = defineVxStyleSheet({ common: { connectors: { primary: { strokeWidth: 0.2, strokeColor: 'red' } } }, dark: { connectors: { primary: { strokeColor: 'white' } } } })
        expect(mergeConnectorAppearances([sheet], 'dark').primary).toEqual({ strokeWidth: 0.2, strokeColor: 'white' })
    })

    it('rejects duplicate public handles and invalid port coordinates', () => {
        const { stage } = harness()
        const plan = compileConnectors(connectors.edge('a', 'b', { key: 'same' }))
        stage.connectors.reconcile('one', plan, undefined, {}, 'scope')
        expect(() => stage.connectors.reconcile('two', plan, undefined, {}, 'scope')).toThrow('Duplicate connector')
        const port = new PortDeclaration(stage); port.setStateValue('name', 'test')
        port.setStateValue('position', [0, 0, 0]); expect(() => port.snapshot()).toThrow('position and normal')
        port.setStateValue('normal', [0, 0, 0]); expect(() => port.snapshot()).toThrow('nonzero')
        port.setStateValue('face', 'left'); expect(() => port.snapshot()).toThrow('mutually exclusive')
    })

    it('tears down local output before endpoint removal and reports identical handles on hits', async () => {
        const { stage, root, endpoint, edge, port } = harness()
        const a = endpoint('a'); endpoint('b', 8)
        port(a, 'socket', { face: 'right' })
        const click = vi.fn()
        const local = edge(a, 'link', { from: 'a.socket', to: 'b', onClick: click })
        await nextTick()
        const object = (stage.connectors as any).strokeBackend.objectFor(`${local.ownerId}:link:stroke:shaft`) as THREE.Mesh
        const disposeGeometry = vi.fn(), disposeMaterial = vi.fn()
        object.geometry.addEventListener('dispose', disposeGeometry)
        ;(object.material as THREE.Material).addEventListener('dispose', disposeMaterial)
        const event = new MouseEvent('click')
        const hit = stage.connectors.dispatchOwnerEvent(local.ownerId, 'onClick', object, undefined, event)
        expect(hit?.handle).toEqual({ scope: 'a', key: 'link' })
        expect(click).toHaveBeenCalledWith(hit, event)
        const removal = vi.spyOn(a, 'onRemoved').mockImplementation(() => {
            expect(stage.connectors.get({ scope: 'a', key: 'link' })).toBeUndefined()
            expect(a.declaredConnectorPorts.size).toBe(0)
        })
        root.removeChild(a); await nextTick()
        expect(removal).toHaveBeenCalledOnce()
        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
        stage.connectors.clear()
        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
    })

    it('moves declarations between owners and invalidates only the changed port dependencies', async () => {
        const { stage, endpoint, port, edge } = harness()
        const a = endpoint('a'), b = endpoint('b', 10)
        const signal = port(a, 'signal', { face: 'right' })
        port(a, 'untouched', { face: 'top' })
        const dependent = edge(a, 'signal', { from: 'a.signal', to: 'b' })
        const unaffected = edge(a, 'untouched', { from: 'a.untouched', to: 'b' })
        await nextTick()
        const before = stage.connectors.getResolvedNetwork(unaffected.ownerId, 'untouched')
        const resolve = vi.spyOn(stage.connectors as any, 'resolveOwner')
        signal.setStateValue('face', 'front'); await nextTick()
        expect(resolve.mock.calls.every(call => (call[1] as Set<string>).has('signal') && !(call[1] as Set<string>).has('untouched'))).toBe(true)
        expect(stage.connectors.getResolvedNetwork(unaffected.ownerId, 'untouched')).toBe(before)
        b.appendChild(signal); await nextTick()
        expect(stage.connectors.portsOf('a').map(p => p.name)).toEqual(['untouched'])
        expect(stage.connectors.portsOf('b').map(p => p.name)).toEqual(['signal'])
        expect(stage.connectors.get({ scope: 'a', key: 'signal' })!.unresolved).toEqual(['missing port: a/signal'])
        dependent.setStateValue('to', 'a')
        dependent.setStateValue('from', undefined)
        b.appendChild(dependent)
        dependent.setStateValue('from', 'b.signal')
        await nextTick()
        expect(stage.connectors.get({ scope: 'a', key: 'signal' })).toBeUndefined()
        expect(stage.connectors.get({ scope: 'b', key: 'signal' })!.unresolved).toEqual([])
    })

    it('keeps fixed-mesh declarations outside measurement and rejects spatial children', () => {
        const { stage } = harness()
        const box = new Box(stage); box.id = 'box'
        const size = box.measuredSize.value.clone()
        const port = new PortDeclaration(stage); port.setStateValue('name', 'socket'); port.setStateValue('face', 'right')
        box.appendChild(port)
        expect(box.elements.value).toEqual([]); expect(box.measuredSize.value).toEqual(size)
        const child = new Endpoint(stage)
        expect(() => box.appendChild(child)).toThrow('vx-group')
        expect(() => box.insertBefore(child, port)).toThrow('vx-group')
        box.removeChild(port); box.onRemoved()
    })
})

import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import { Cylinder } from '@/lib-components/nodes/shapes/Cylinder.js'
import { Wedge } from '@/lib-components/nodes/shapes/Wedge.js'
import { Row } from '@/lib-components/nodes/Row.js'
import { Ring } from '@/lib-components/nodes/Ring.js'
import { Spacer } from '@/lib-components/nodes/Spacer.js'
import { types } from '@/lib-components/nodes/types.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'

function makeStage(settings: Record<string, unknown> = {}): VuetrexStage {
    const scene = new THREE.Scene()
    const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
    Object.assign(stage as any, {
        scene,
        settings,
        nodesById: new Map(),
        nodesByName: new Map(),
        diagnostics: false,
        diagnosticsGroup: new THREE.Group(),
        boxRadius: 1,
        boxDistance: 0.5,
        gap: 0.5,
        captions: [],
        caps: { updateFn: vi.fn(), size: 2048, repeats: 17, texture: null },
        connectors: {
            update: vi.fn(),
            remove: vi.fn(),
            reconcileConnections: vi.fn(),
            getConnectionPorts: vi.fn(() => [{
                id: 'test-route',
                role: 'from',
                point: new THREE.Vector3(),
            }]),
        },
        createElementMaterial: () => new THREE.MeshStandardMaterial(),
        getScene: () => scene,
        renderMesh: vi.fn(),
        removeObject: vi.fn(),
        reconcileConnections: vi.fn(),
        invalidateContentBounds: vi.fn(),
    })
    return stage
}

describe('node identity', () => {
    it('keeps renderer keys and semantic ids separate from human names', () => {
        const stage = makeStage()
        const node = new Box(stage)
        const row = new Row(stage)
        row.appendChild(node)

        node.setRendererKey('service:orders')
        node.setId('orders')
        node.setName('Orders API')

        expect(node.key).toBe('service:orders')
        expect(node.id).toBe('orders')
        expect(node.name).toBe('Orders API')
        expect(stage.getById('orders')).toBe(node.element)
    })

    it('does not use human-readable names as semantic IDs', () => {
        const stage = makeStage()
        const node = new Box(stage)
        const row = new Row(stage)
        row.appendChild(node)
        const id = node.id
        node.setName('orders')
        expect(node.id).toBe(id)
        expect(stage.getById('orders')).toBeUndefined()
        expect(stage.getById(id)).toBe(node.element)
    })

    it('rejects duplicate ids and names during development', () => {
        const stage = makeStage()
        const row = new Row(stage)
        const first = new Box(stage)
        row.appendChild(first)
        first.setRendererKey('service:a')
        first.setId('service:a')
        first.setName('API')

        const duplicateName = new Box(stage)
        duplicateName.setRendererKey('service:b')
        row.appendChild(duplicateName)
        expect(() => duplicateName.setName('API')).toThrow(/duplicate name: API/)

        const duplicateId = new Box(stage)
        row.appendChild(duplicateId)
        expect(() => duplicateId.setId('service:a')).toThrow(/duplicate id: service:a/)
    })
})

describe('node behavior props', () => {
    it('keeps hidden nodes in layout unless participation is disabled separately', () => {
        const stage = makeStage()
        const row = new Row(stage)
        const left = new Box(stage)
        const middle = new Box(stage)
        const right = new Box(stage)
        row.appendChild(left)
        row.appendChild(middle)
        row.appendChild(right)

        middle.setStateValue('visible', false)
        expect(row.elements.value).toEqual([left, middle, right])
        expect(row.measuredSize.value.x).toBeCloseTo(4)

        middle.setStateValue('participates-in-layout', false)
        expect(row.elements.value).toEqual([left, right])
        expect(row.measuredSize.value.x).toBeCloseTo(2.5)
        expect(row.layoutPositionOf(middle)).toEqual(new THREE.Vector3())

        middle.setStateValue('visible', null)
        middle.setStateValue('participates-in-layout', undefined)
        expect(middle.visible).toBe(true)
        expect(row.elements.value).toEqual([left, middle, right])
    })

    it('applies visibility and prevents disabled interaction', () => {
        const stage = makeStage()
        const node = new Box(stage)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        node.element.mesh = mesh
        const clicked = vi.fn()
        node.onClick = clicked

        node.setStateValue('visible', false)
        node.setStateValue('disabled', true)
        node.dispatchClick(new MouseEvent('click'))

        expect(mesh.visible).toBe(false)
        expect(mesh.userData.vxDisabled).toBe(true)
        expect(clicked).not.toHaveBeenCalled()
    })
})

describe('layout reservations and geometry contracts', () => {
    it('registers vx-spacer and reserves an explicit empty slot', () => {
        const stage = makeStage()
        const row = new Row(stage)
        const box = new Box(stage)
        const spacer = new Spacer(stage)
        spacer.setStateValue('width', 2)
        spacer.setStateValue('height', 0.25)
        spacer.setStateValue('depth', 0.5)
        row.appendChild(box)
        row.appendChild(spacer)

        expect(types['vx-spacer']).toBe(Spacer)
        expect(spacer.measuredSize.value).toEqual(new THREE.Vector3(2, 0.25, 0.5))
        expect(row.measuredSize.value).toEqual(new THREE.Vector3(3.5, 0.5, 1))
    })

    it('honors depth for boxes but ignores it for radial shapes', () => {
        const stage = makeStage()
        const box = new Box(stage)
        const cylinder = new Cylinder(stage)
        const wedge = new Wedge(stage)
        for (const node of [box, cylinder, wedge]) {
            node.setStateValue('size', 2)
            node.setStateValue('depth', 7)
        }

        expect(box.measuredSize.value.z).toBe(7)
        expect(cylinder.measuredSize.value.z).toBe(2)
        expect(wedge.measuredSize.value.z).toBe(2)
    })

    it('keeps layout opt-out nodes at the local origin in radial containers', () => {
        const stage = makeStage()
        const ring = new Ring(stage)
        const node = new Box(stage)
        ring.setStateValue('radius', 4)
        ring.appendChild(node)

        node.setStateValue('participates-in-layout', false)

        expect(ring.layoutPositionOf(node)).toEqual(new THREE.Vector3())
    })
})

describe('scene diagnostics and floor feature switches', () => {
    it('draws measured footprints and connection ports without authored scene identity', () => {
        const stage = makeStage()
        const node = new Box(stage)
        const row = new Row(stage)
        row.appendChild(node)
        node.setId('orders')
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1))
        mesh.position.y = 0.25
        mesh.userData.el = node.element
        node.element.mesh = mesh
        stage.getScene().add(mesh)

        stage.setDiagnostics({ groupBounds: false, footprints: true, connectionPorts: true, nodeIds: false })

        const diagnostics = stage.getScene().getObjectByName('vx-diagnostics')!
        const kinds = diagnostics.children.map(child => child.userData.vxDiagnostic)
        expect(kinds).toEqual(['footprint', 'connection-port'])
        expect(diagnostics.children.every(child => child.userData.el === undefined)).toBe(true)
    })

    it('disables floor grid and captions independently', () => {
        const stage = makeStage({ floorGrid: false, floorCaptions: false, floorMirror: false, shadows: false })
        const fillRect = vi.fn()
        const drawText = vi.fn()
        const texture = {
            fillStyle: '',
            context: { font: '', measureText: () => ({ width: 12 }) },
            clear() { return this },
            drawText,
            setGlobalAlpha: vi.fn(),
            fillRect,
        }
        Object.assign((stage as any).caps, { texture })

        stage.repaintTitles(256)
        stage.createGroundMirror(stage.getScene())

        expect(fillRect).not.toHaveBeenCalled()
        expect(drawText).not.toHaveBeenCalled()
        expect(stage.getScene().getObjectByName('vx-ground-reflector')).toBeUndefined()
        expect(stage.shadowsEnabled()).toBe(false)
    })
})

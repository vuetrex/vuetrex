import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
    defineGeometryOutputs,
    describeGeometryGraph,
    geometryGraphToDot,
    geo,
    inspectGeometry,
} from '@/lib-components/geometry/index.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryNode } from '@/lib-components/geometry/GeometryNode.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function fixture() {
    const scene = new THREE.Scene()
    const stage = {
        boxRadius: 1,
        boxDistance: 1,
        gap: 1,
        createElementMaterial: () => new THREE.MeshStandardMaterial({ color: 0xffffff }),
        getScene: () => scene,
        shadowsEnabled: () => true,
        connectors: { update: vi.fn(), remove: vi.fn(() => []) },
        reconcileConnections: vi.fn(),
        invalidateContentBounds: vi.fn(),
    } as unknown as VuetrexStage
    const parent = new GroupNode(stage)
    scene.add(parent.group)
    return { parent, stage }
}

function geometryNode(parent: GroupNode, stage: VuetrexStage, graph: Parameters<typeof evaluateGeometry>[0]) {
    const node = new GeometryNode(stage)
    parent.appendChild(node)
    node.setStateValue('graph', graph)
    node.syncWithThree()
    return node
}

async function flush() {
    await nextTick()
    await nextTick()
}

describe('procedural geometry composability extensions', () => {
    it('updates stable parameterized graphs without rebuilding topology', async () => {
        const { parent, stage } = fixture()
        const graph = geo.parameterMap(
            geo.box({ width: geo.param('width', 1), height: 1, depth: 1 }),
            {
                scale: geo.param('scale', 1),
                color: geo.param('color', 0xffffff),
            },
        )
        const node = new GeometryNode(stage)
        parent.appendChild(node)
        node.setStateValue('graph', graph)
        node.setStateValue('parameters', { width: 1, scale: 1, color: 0x336699 })
        node.syncWithThree()
        await flush()

        const mesh = node.group.children[0] as THREE.InstancedMesh
        expect(node.geometryDiagnostics()?.updateKind).toBe('initial')
        expect(node.geometryDiagnostics()?.topologyBuildCount).toBe(1)

        node.setStateValue('parameters', { width: 1, scale: 1.8, color: 0xaa5522 })
        await flush()
        expect(node.group.children[0]).toBe(mesh)
        expect(node.geometryDiagnostics()?.updateKind).toBe('attributes')
        expect(node.geometryDiagnostics()?.topologyBuildCount).toBe(1)

        node.setStateValue('parameters', { width: 2, scale: 1.8, color: 0xaa5522 })
        await flush()
        expect(node.group.children[0]).not.toBe(mesh)
        expect(node.geometryDiagnostics()?.updateKind).toBe('topology')
        expect(node.geometryDiagnostics()?.topologyBuildCount).toBe(2)
    })

    it('supports named module outputs, semantic groups, and material channels', async () => {
        const plant = defineGeometryOutputs('test.plant-parts', (parameters: { height: number }) => {
            const trunk = geo.line({ length: parameters.height, thickness: 0.08 })
            const crown = geo.transform(geo.icosphere({ radius: 0.4 }), {
                translate: [0, parameters.height, 0],
            })
            return { trunk, crown, whole: geo.join([trunk, crown]) }
        })
        const outputs = plant({ height: 2 })
        expect(outputs.output('crown')).toBe(outputs.crown)

        const graph = geo.join([
            geo.material(geo.named(outputs.trunk, 'trunk'), 'bark'),
            geo.material(geo.named(outputs.crown, 'crown'), 'foliage'),
        ])
        const evaluated = evaluateGeometry(graph)
        expect(evaluated.records.map(record => record.materialKey)).toEqual(['bark', 'foliage'])
        expect(evaluated.records[0].groups).toContain('trunk')
        expect(evaluated.records[1].groups).toContain('crown')

        const { parent, stage } = fixture()
        const node = geometryNode(parent, stage, graph)
        node.setStateValue('materials', {
            bark: { color: 0x704020, roughness: 0.9 },
            foliage: { color: 0x4f9d55, roughness: 0.55 },
        })
        await flush()
        expect(node.instanceBatchCount).toBe(2)
        const colors = node.group.children
            .map(child => ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex())
            .sort((a, b) => a - b)
        expect(colors).toEqual([0x4f9d55, 0x704020].sort((a, b) => a - b))
    })

    it('reuses point, curve, radial, and mapped domains across pipelines', () => {
        const sites = geo.radialPoints({
            count: geo.param('siteCount', 4),
            radius: 2,
            axis: 'xz',
            item: index => ({ id: `site-${index}` }),
        })
        const origins = geo.mapPoints(sites, site => ({
            item: site.item,
            position: [0, 0, 0],
            direction: site.position,
            scale: 2,
        }))
        const graph = geo.join([
            geo.distribute(geo.icosphere({ radius: 0.1 }), sites),
            geo.distribute(geo.line({ length: 1, thickness: 0.02 }), origins),
        ])
        const set = evaluateGeometry(graph, undefined, { siteCount: 5 })
        expect(set.records).toHaveLength(10)
        expect(new Set(set.records.map(record => (record.context.item as { id: string }).id)).size).toBe(5)

        const semanticDomain = geo.mapPoints(
            geo.points([{ key: 'alpha', position: [1, 0, 0], item: { id: 'alpha' } }]),
            site => ({ position: site.position.clone().multiplyScalar(2) }),
        )
        const semanticSet = evaluateGeometry(geo.distribute(geo.box(), semanticDomain))
        expect(semanticSet.records[0].context.domainKey).toContain('/alpha')
        expect(semanticSet.records[0].context.item).toEqual({ id: 'alpha' })

        const curve = geo.curvePoints({
            points: [[0, 0, 0], [0, 1, 0], [1, 2, 0]],
            count: 4,
            align: 'tangent',
        })
        const alongCurve = evaluateGeometry(geo.distribute(geo.box({ width: 0.1 }), curve))
        expect(alongCurve.records).toHaveLength(4)
        expect(alongCurve.records.every(record => record.context.tangent)).toBe(true)
    })

    it('exposes semantic record lookup, hit identity, and local/world bounds', async () => {
        const items = [
            { id: 'pod-a', position: [0, 0, 0] as const },
            { id: 'pod-b', position: [2, 0, 0] as const },
        ]
        const graph = geo.named(geo.distribute(geo.box(), {
            items,
            keyBy: 'id',
            position: item => item.position,
        }), 'pods')
        const { parent, stage } = fixture()
        const node = geometryNode(parent, stage, graph)
        await flush()

        expect(node.recordsOf('pods')).toHaveLength(2)
        expect(node.localBoundsOf({ item: 'pod-b' })?.getCenter(new THREE.Vector3()).x).toBeCloseTo(2)
        expect(node.instanceWorldBounds('pod-b')).toBeDefined()
        const mesh = node.group.children[0] as THREE.InstancedMesh
        expect(node.instanceHitAt(0, mesh)).toMatchObject({ id: 'pod-a', item: items[0], groups: ['pods'] })
    })

    it('keeps geo.boolean as a compatible alias for the accurately named geo.join', () => {
        const source = geo.box()
        const joined = geo.join([source, source])
        const legacy = geo.boolean([source, source])
        expect(joined.kind).toBe('join')
        expect(legacy.kind).toBe('join')
        expect(evaluateGeometry(joined).records).toHaveLength(2)
        expect(evaluateGeometry(legacy).records).toHaveLength(2)
    })

    it('describes DAGs and reports runtime inspection data', () => {
        const shared = geo.box({ key: 'shared' })
        const graph = geo.join([
            geo.material(geo.named(shared, 'left'), 'primary'),
            geo.transform(shared, { translate: [2, 0, 0] }),
        ])
        const description = describeGeometryGraph(graph)
        const inspection = inspectGeometry(graph)
        expect(description.nodes.filter(node => node.kind === 'box')).toHaveLength(1)
        expect(geometryGraphToDot(graph)).toContain('digraph ProceduralGeometry')
        expect(inspection.recordCount).toBe(2)
        expect(inspection.materialKeys).toEqual(['default', 'primary'])
        expect(inspection.groups).toEqual(['left'])
        expect(inspection.bounds?.size[0]).toBe(3)

        const unstable = inspectGeometry(geo.distribute(geo.box(), {
            items: [{ name: 'first' }],
            position: [0, 0, 0],
        }))
        expect(unstable.warnings.some(warning => warning.includes('without keyBy or id'))).toBe(true)
    })

    it('shares topology prototypes across geometry nodes until the last owner unmounts', async () => {
        const { parent, stage } = fixture()
        const first = geometryNode(parent, stage, geo.box())
        const second = geometryNode(parent, stage, geo.box())
        await flush()

        const firstMesh = first.group.children[0] as THREE.InstancedMesh
        const secondMesh = second.group.children[0] as THREE.InstancedMesh
        expect(firstMesh.geometry).toBe(secondMesh.geometry)
        expect(first.sharedPrototypeCount).toBe(1)
        const dispose = vi.fn()
        firstMesh.geometry.addEventListener('dispose', dispose)

        parent.removeChild(first)
        expect(dispose).not.toHaveBeenCalled()
        parent.removeChild(second)
        expect(dispose).toHaveBeenCalledOnce()
    })
})

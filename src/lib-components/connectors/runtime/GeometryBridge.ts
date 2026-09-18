import * as THREE from 'three'
import { GeometryEvaluator } from '@/lib-components/geometry/compiler/evaluator.js'
import {
    GeometryPrototypeRegistry,
    geometryPrototypePoolFor,
} from '@/lib-components/geometry/compiler/prototypes.js'
import { GeometryRealizer } from '@/lib-components/geometry/compiler/realizer.js'
import { isGeometrySource, geometryGraphSignature } from '@/lib-components/geometry/graph.js'
import type { GeometryHit, GeometryRecord, GeometrySet } from '@/lib-components/geometry/types.js'
import type { ConnectorGeometryRecord } from '@/lib-components/connectors/compiler/types.js'
import type { ConnectorEdgeHit, ConnectorHit, ConnectorParameterValues } from '@/lib-components/connectors/types.js'
import { stableValue } from '@/lib-components/connectors/compiler/evaluator.js'
import { connectorPathPosition } from '@/lib-components/connectors/runtime/hit.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

interface OwnerGeometryState {
    readonly group: THREE.Group
    readonly material: THREE.MeshStandardMaterial
    readonly prototypes: GeometryPrototypeRegistry
    readonly realizer: GeometryRealizer
    signature: string
    records: readonly ConnectorGeometryRecord[]
    readonly connectorByGeometryKey: Map<string, ConnectorGeometryRecord>
}

export class GeometryBridge {
    private readonly owners = new Map<string, OwnerGeometryState>()
    private readonly ownerByObject = new WeakMap<THREE.Object3D, string>()
    private evaluations = 0

    constructor(private readonly stage: VuetrexStage) {}

    reconcile(ownerId: string, records: readonly ConnectorGeometryRecord[], parameters: ConnectorParameterValues = {}): void {
        if (!records.length) {
            this.removeOwner(ownerId)
            return
        }
        for (const record of records) {
            if (!isGeometrySource(record.source)) {
                throw new TypeError(`Connector geometry '${record.key}' must return a GeometrySource.`)
            }
        }
        const orderedRecords = [...records].sort((a, b) => a.id.localeCompare(b.id))
        const signature = orderedRecords.map(record =>
            `${record.id}:${record.signature}:${geometryGraphSignature(record.source)}:${stableValue(parameters)}`).join('|')
        let owner = this.owners.get(ownerId)
        if (owner?.signature === signature) return
        if (!owner) {
            const group = new THREE.Group()
            group.name = `vx-connector-geometry-${ownerId}`
            group.userData.vxConnectorOutput = true
            const material = this.stage.createElementMaterial()
            const prototypes = new GeometryPrototypeRegistry(geometryPrototypePoolFor(this.stage))
            owner = {
                group,
                material,
                prototypes,
                realizer: new GeometryRealizer(group, material, () => this.stage.shadowsEnabled?.() ?? true),
                signature: '',
                records: [],
                connectorByGeometryKey: new Map(),
            }
            this.owners.set(ownerId, owner)
            stageScene(this.stage).add(group)
        }

        owner.prototypes.beginCompilation()
        try {
            const geometryRecords: GeometryRecord[] = []
            owner.connectorByGeometryKey.clear()
            for (const connector of orderedRecords) {
                const set = new GeometryEvaluator(owner.prototypes, parameters).evaluate(connector.source)
                for (const record of set.records) {
                    const key = `${connector.id}/${record.key}`
                    owner.connectorByGeometryKey.set(key, connector)
                    geometryRecords.push(Object.freeze({
                        ...record,
                        key,
                        context: Object.freeze({
                            ...record.context,
                            key,
                            item: connector.item,
                        }),
                    }))
                }
            }
            const set: GeometrySet = Object.freeze({ records: Object.freeze(geometryRecords) })
            owner.realizer.realize(set)
            owner.signature = signature
            owner.records = Object.freeze(orderedRecords)
            owner.group.traverse(object => {
                object.userData.vxConnectorOutput = true
                object.userData.vxConnectorOwner = orderedRecords.some(record => record.interactive) ? ownerId : undefined
                this.ownerByObject.set(object, ownerId)
            })
            this.evaluations++
        } catch (error) {
            owner.realizer.realize({ records: [] })
            owner.connectorByGeometryKey.clear()
            owner.records = []
            owner.signature = ''
            throw error
        } finally {
            owner.prototypes.endCompilation()
        }
    }

    removeOwner(ownerId: string): void {
        const owner = this.owners.get(ownerId)
        if (!owner) return
        owner.realizer.dispose()
        owner.prototypes.dispose()
        owner.material.dispose()
        owner.group.removeFromParent()
        this.owners.delete(ownerId)
    }

    hitAt(object: THREE.Object3D, instanceId?: number, intersection?: THREE.Intersection): ConnectorHit | undefined {
        const ownerId = this.ownerByObject.get(object)
        const owner = ownerId ? this.owners.get(ownerId) : undefined
        if (!owner) return undefined
        const geometryHit = owner.realizer.geometryHitAt(object, instanceId)
        const connector = geometryHit
            ? owner.connectorByGeometryKey.get(geometryHit.recordKey)
            : owner.records.length === 1 ? owner.records[0] : undefined
        if (!connector?.interactive) return undefined
        const point = intersection?.point.clone() ?? geometryHitPoint(object, geometryHit)
        const hit: ConnectorEdgeHit = Object.freeze({
            kind: 'edge',
            key: connector.key,
            item: connector.item,
            part: connector.part,
            point: Object.freeze(point.toArray() as [number, number, number]),
            pathPosition: connectorPathPosition(connector.network, point),
            sourceName: connector.sourceName,
        })
        return hit
    }

    diagnostics(): { readonly owners: number; readonly records: number; readonly batches: number; readonly evaluations: number } {
        let batches = 0
        let records = 0
        for (const owner of this.owners.values()) {
            batches += owner.realizer.batchCount
            records += owner.records.length
        }
        return Object.freeze({ owners: this.owners.size, records, batches, evaluations: this.evaluations })
    }

    dispose(): void {
        for (const ownerId of [...this.owners.keys()]) this.removeOwner(ownerId)
    }
}

function stageScene(stage: VuetrexStage): THREE.Scene {
    return typeof stage.getScene === 'function' ? stage.getScene() : stage.scene
}

function geometryHitPoint(object: THREE.Object3D, hit?: GeometryHit<unknown>): THREE.Vector3 {
    if (object instanceof THREE.InstancedMesh && hit) {
        const matrix = new THREE.Matrix4()
        object.getMatrixAt(hit.instanceIndex, matrix)
        return new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld)
    }
    return object.getWorldPosition(new THREE.Vector3())
}

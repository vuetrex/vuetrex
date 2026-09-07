import * as THREE from 'three'
import type { InstanceHit } from '@/lib-components/nodes/InstanceNode.js'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type { GeometryPrototype, GeometryRecord, GeometrySet } from '@/lib-components/geometry/types.js'

const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)

function nextCapacity(required: number): number {
    let capacity = 1
    while (capacity < required) capacity *= 2
    return capacity
}

interface MeshBatch {
    prototype: GeometryPrototype
    mesh: THREE.InstancedMesh
    capacity: number
    slotByKey: Map<string, number>
    hitBySlot: Array<InstanceHit<unknown> | undefined>
    freeSlots: number[]
    nextSlot: number
}

interface LineEntry {
    line: THREE.Line
    material: THREE.LineBasicMaterial
    recordColor: THREE.Color
}

export class GeometryRealizer {
    private readonly batches = new Map<string, MeshBatch>()
    private readonly batchByObject = new WeakMap<THREE.Object3D, MeshBatch>()
    private readonly lines = new Map<string, LineEntry>()

    constructor(
        readonly group: THREE.Group,
        readonly material: THREE.MeshStandardMaterial,
        private readonly shadowsEnabled: () => boolean,
    ) {}

    realize(set: GeometrySet): void {
        const meshRecords = new Map<string, GeometryRecord[]>()
        const lineRecords = new Map<string, GeometryRecord>()
        for (const record of set.records) {
            if (record.prototype.topology === 'mesh') {
                const records = meshRecords.get(record.prototype.signature) ?? []
                records.push(record)
                meshRecords.set(record.prototype.signature, records)
            } else {
                lineRecords.set(`${record.prototype.signature}\u0000${record.key}`, record)
            }
        }

        for (const [signature, batch] of [...this.batches]) {
            if (meshRecords.has(signature)) continue
            this.removeBatch(batch)
            this.batches.delete(signature)
        }
        for (const [signature, records] of meshRecords) this.writeBatch(signature, records)

        for (const [key, entry] of [...this.lines]) {
            if (lineRecords.has(key)) continue
            entry.line.removeFromParent()
            entry.material.dispose()
            this.lines.delete(key)
        }
        for (const [key, record] of lineRecords) this.writeLine(key, record)
    }

    updateIdentity(element: Element3d, id: string, disabled: boolean): void {
        this.group.name = `el-${id}`
        this.group.userData.el = element
        this.group.userData.vxDisabled = disabled
        this.group.traverse(object => {
            object.userData.el = element
            object.userData.vxDisabled = disabled
            if (object !== this.group && (object as THREE.Mesh).geometry) object.name = `el-${id}`
        })
    }

    updateLineMaterials(): void {
        for (const entry of this.lines.values()) {
            entry.material.color.copy(this.material.color).multiply(entry.recordColor)
            entry.material.opacity = this.material.opacity
            entry.material.transparent = this.material.transparent
            entry.material.needsUpdate = true
        }
    }

    instanceHitAt(instanceIndex: number, object?: THREE.Object3D): InstanceHit<unknown> | undefined {
        if (object) return this.batchByObject.get(object)?.hitBySlot[instanceIndex]
        if (this.batches.size === 1) return this.batches.values().next().value?.hitBySlot[instanceIndex]
        return undefined
    }

    dispose(): void {
        for (const batch of this.batches.values()) this.removeBatch(batch)
        this.batches.clear()
        for (const entry of this.lines.values()) {
            entry.line.removeFromParent()
            entry.material.dispose()
        }
        this.lines.clear()
    }

    get batchCount(): number {
        return this.batches.size
    }

    private makeBatch(prototype: GeometryPrototype, capacity: number): MeshBatch {
        const mesh = new THREE.InstancedMesh(prototype.geometry, this.material, capacity)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.castShadow = this.shadowsEnabled()
        mesh.receiveShadow = this.shadowsEnabled()
        this.group.add(mesh)
        const batch: MeshBatch = {
            prototype,
            mesh,
            capacity,
            slotByKey: new Map(),
            hitBySlot: [],
            freeSlots: [],
            nextSlot: 0,
        }
        this.batchByObject.set(mesh, batch)
        return batch
    }

    private ensureCapacity(batch: MeshBatch, required: number): MeshBatch {
        if (required <= batch.capacity) return batch
        const replacement = this.makeBatch(batch.prototype, nextCapacity(required))
        replacement.slotByKey = batch.slotByKey
        replacement.hitBySlot = batch.hitBySlot
        replacement.freeSlots = batch.freeSlots
        replacement.nextSlot = batch.nextSlot
        this.removeBatch(batch)
        return replacement
    }

    private writeBatch(signature: string, records: readonly GeometryRecord[]): void {
        let batch = this.batches.get(signature) ?? this.makeBatch(records[0].prototype, nextCapacity(records.length))
        const activeKeys = new Set(records.map(record => record.key))
        for (const [key, slot] of [...batch.slotByKey]) {
            if (activeKeys.has(key)) continue
            batch.slotByKey.delete(key)
            batch.hitBySlot[slot] = undefined
            batch.freeSlots.push(slot)
        }
        batch.freeSlots.sort((a, b) => a - b)

        for (const record of records) {
            if (batch.slotByKey.has(record.key)) continue
            const slot = batch.freeSlots.shift() ?? batch.nextSlot++
            batch.slotByKey.set(record.key, slot)
        }
        batch = this.ensureCapacity(batch, Math.max(1, batch.nextSlot))
        this.batches.set(signature, batch)

        const highestSlot = records.reduce((highest, record) => Math.max(highest, batch.slotByKey.get(record.key) ?? -1), -1)
        for (let slot = 0; slot <= highestSlot; slot++) {
            batch.mesh.setMatrixAt(slot, hiddenMatrix)
            batch.mesh.setColorAt(slot, new THREE.Color(0xffffff))
        }
        for (const record of records) {
            const slot = batch.slotByKey.get(record.key)!
            batch.mesh.setMatrixAt(slot, record.visible ? record.matrix : hiddenMatrix)
            batch.mesh.setColorAt(slot, record.color)
            batch.hitBySlot[slot] = {
                id: record.key,
                item: record.context.item,
                instanceIndex: slot,
            }
        }
        batch.mesh.count = highestSlot + 1
        batch.mesh.instanceMatrix.needsUpdate = true
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true
        batch.mesh.computeBoundingBox()
        batch.mesh.computeBoundingSphere()
    }

    private writeLine(key: string, record: GeometryRecord): void {
        let entry = this.lines.get(key)
        if (!entry) {
            const material = new THREE.LineBasicMaterial({ color: 0xffffff })
            const line = new THREE.Line(record.prototype.geometry, material)
            line.matrixAutoUpdate = false
            this.group.add(line)
            entry = { line, material, recordColor: record.color.clone() }
            this.lines.set(key, entry)
        }
        entry.recordColor.copy(record.color)
        entry.line.matrix.copy(record.matrix)
        entry.line.matrixWorldNeedsUpdate = true
        entry.line.visible = record.visible
        this.updateLineMaterial(entry)
    }

    private updateLineMaterial(entry: LineEntry): void {
        entry.material.color.copy(this.material.color).multiply(entry.recordColor)
        entry.material.opacity = this.material.opacity
        entry.material.transparent = this.material.transparent
    }

    private removeBatch(batch: MeshBatch): void {
        batch.mesh.removeFromParent()
        batch.mesh.dispose()
    }
}


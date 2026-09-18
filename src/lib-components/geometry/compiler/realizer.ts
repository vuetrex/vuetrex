import * as THREE from 'three'
import type { Element3d } from '@/lib-components/three/element3d.js'
import type {
    GeometryHit,
    GeometryPrototype,
    GeometryRecord,
    GeometrySet,
} from '@/lib-components/geometry/types.js'
import { applyMaterialProps, type VxMaterialProps } from '@/lib-components/nodes/material.js'

const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)

function nextCapacity(required: number): number {
    let capacity = 1
    while (capacity < required) capacity *= 2
    return capacity
}

interface MeshBatch {
    prototype: GeometryPrototype
    materialKey: string
    mesh: THREE.InstancedMesh
    capacity: number
    slotByKey: Map<string, number>
    hitBySlot: Array<GeometryHit<unknown> | undefined>
    freeSlots: number[]
    nextSlot: number
}

interface LineEntry {
    line: THREE.Line
    material: THREE.LineBasicMaterial
    materialKey: string
    recordColor: THREE.Color
}

export class GeometryRealizer {
    private readonly batches = new Map<string, MeshBatch>()
    private readonly batchByObject = new WeakMap<THREE.Object3D, MeshBatch>()
    private readonly lines = new Map<string, LineEntry>()
    private readonly lineHitByObject = new WeakMap<THREE.Object3D, GeometryHit<unknown>>()
    private readonly channelMaterials = new Map<string, THREE.MeshStandardMaterial>()
    private materialChannels: Readonly<Record<string, VxMaterialProps>> = {}

    constructor(
        readonly group: THREE.Group,
        readonly material: THREE.MeshStandardMaterial,
        private readonly shadowsEnabled: () => boolean,
    ) {}

    realize(set: GeometrySet): void {
        const meshRecords = new Map<string, GeometryRecord[]>()
        const lineRecords = new Map<string, GeometryRecord>()
        const activeMaterialKeys = new Set<string>()
        for (const record of set.records) {
            activeMaterialKeys.add(record.materialKey)
            if (record.prototype.topology === 'mesh') {
                const batchKey = `${record.prototype.signature}\u0000${record.materialKey}`
                const records = meshRecords.get(batchKey) ?? []
                records.push(record)
                meshRecords.set(batchKey, records)
            } else {
                lineRecords.set(`${record.prototype.signature}\u0000${record.materialKey}\u0000${record.key}`, record)
            }
        }

        for (const [batchKey, batch] of [...this.batches]) {
            if (meshRecords.has(batchKey)) continue
            this.removeBatch(batch)
            this.batches.delete(batchKey)
        }
        for (const [batchKey, records] of meshRecords) this.writeBatch(batchKey, records)

        for (const [key, entry] of [...this.lines]) {
            if (lineRecords.has(key)) continue
            entry.line.removeFromParent()
            entry.material.dispose()
            this.lines.delete(key)
        }
        for (const [key, record] of lineRecords) this.writeLine(key, record)
        for (const [key, material] of this.channelMaterials) {
            if (activeMaterialKeys.has(key)) continue
            material.dispose()
            this.channelMaterials.delete(key)
        }
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
            const channel = this.materialFor(entry.materialKey)
            entry.material.color.copy(channel.color).multiply(entry.recordColor)
            entry.material.opacity = channel.opacity
            entry.material.transparent = channel.transparent
            entry.material.needsUpdate = true
        }
    }

    instanceHitAt(instanceIndex: number, object?: THREE.Object3D): GeometryHit<unknown> | undefined {
        if (object) return this.batchByObject.get(object)?.hitBySlot[instanceIndex]
        if (this.batches.size === 1) return this.batches.values().next().value?.hitBySlot[instanceIndex]
        return undefined
    }

    geometryHitAt(object: THREE.Object3D, instanceIndex?: number): GeometryHit<unknown> | undefined {
        return instanceIndex === undefined
            ? this.lineHitByObject.get(object)
            : this.instanceHitAt(instanceIndex, object)
    }

    dispose(): void {
        for (const batch of this.batches.values()) this.removeBatch(batch)
        this.batches.clear()
        for (const entry of this.lines.values()) {
            entry.line.removeFromParent()
            entry.material.dispose()
        }
        this.lines.clear()
        for (const material of this.channelMaterials.values()) material.dispose()
        this.channelMaterials.clear()
    }

    updateMaterials(channels: Readonly<Record<string, VxMaterialProps>> = {}): void {
        this.materialChannels = channels
        for (const [key, material] of this.channelMaterials) {
            material.copy(this.material)
            const props = channels[key]
            if (props) applyMaterialProps(material, props)
        }
        for (const batch of this.batches.values()) batch.mesh.material = this.materialFor(batch.materialKey)
        this.updateLineMaterials()
    }

    get batchCount(): number {
        return this.batches.size
    }

    private makeBatch(prototype: GeometryPrototype, materialKey: string, capacity: number): MeshBatch {
        const mesh = new THREE.InstancedMesh(prototype.geometry, this.materialFor(materialKey), capacity)
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        mesh.castShadow = this.shadowsEnabled()
        mesh.receiveShadow = this.shadowsEnabled()
        this.group.add(mesh)
        const batch: MeshBatch = {
            prototype,
            materialKey,
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
        const replacement = this.makeBatch(batch.prototype, batch.materialKey, nextCapacity(required))
        replacement.slotByKey = batch.slotByKey
        replacement.hitBySlot = batch.hitBySlot
        replacement.freeSlots = batch.freeSlots
        replacement.nextSlot = batch.nextSlot
        this.removeBatch(batch)
        return replacement
    }

    private writeBatch(batchKey: string, records: readonly GeometryRecord[]): void {
        let batch = this.batches.get(batchKey)
            ?? this.makeBatch(records[0].prototype, records[0].materialKey, nextCapacity(records.length))
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
        this.batches.set(batchKey, batch)

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
                id: semanticId(record),
                item: record.context.item,
                instanceIndex: slot,
                recordKey: record.key,
                materialKey: record.materialKey,
                groups: record.groups,
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
            entry = { line, material, materialKey: record.materialKey, recordColor: record.color.clone() }
            this.lines.set(key, entry)
        }
        this.lineHitByObject.set(entry.line, {
            id: semanticId(record),
            item: record.context.item,
            instanceIndex: 0,
            recordKey: record.key,
            materialKey: record.materialKey,
            groups: record.groups,
        })
        entry.recordColor.copy(record.color)
        entry.materialKey = record.materialKey
        entry.line.matrix.copy(record.matrix)
        entry.line.matrixWorldNeedsUpdate = true
        entry.line.visible = record.visible
        this.updateLineMaterial(entry)
    }

    private updateLineMaterial(entry: LineEntry): void {
        const channel = this.materialFor(entry.materialKey)
        entry.material.color.copy(channel.color).multiply(entry.recordColor)
        entry.material.opacity = channel.opacity
        entry.material.transparent = channel.transparent
    }

    private removeBatch(batch: MeshBatch): void {
        batch.mesh.removeFromParent()
        batch.mesh.dispose()
    }

    private materialFor(key: string): THREE.MeshStandardMaterial {
        if (key === 'default') return this.material
        let material = this.channelMaterials.get(key)
        if (!material) {
            material = this.material.clone()
            const props = this.materialChannels[key]
            if (props) applyMaterialProps(material, props)
            this.channelMaterials.set(key, material)
        }
        return material
    }
}

function semanticId(record: GeometryRecord): string {
    const item = record.context.item
    if (item && typeof item === 'object' && 'id' in item) {
        const id = (item as Record<string, unknown>).id
        if (id !== undefined && id !== null && id !== '') return String(id)
    }
    return record.context.domainKey ?? record.key
}

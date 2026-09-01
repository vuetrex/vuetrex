import * as THREE from 'three'
import { markRaw, shallowReactive, watchEffect, type WatchStopHandle } from 'vue'
import { applyMaterialProps, type VxMaterialProps } from '@/lib-components/nodes/material.js'
import { Node } from '@/lib-components/nodes/Node.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type { VxEventMap } from '@/lib-components/three/element3d.js'
import * as THREEx from '@/lib-components/three/three.imports.js'

/** A canonical keyed item for callers that do not already have domain objects with IDs. */
export interface InstanceItem<T> {
    id: string
    data: T
}

/** Maps a semantic item to the GPU attributes supported by the first instancing draft. */
export interface InstanceEncoding<T> {
    transform(item: T, index: number): THREE.Matrix4
    color(item: T, index: number): THREE.ColorRepresentation | THREE.Color
    visible?(item: T, index: number): boolean
}

/** Added to VxMouseEvent when a raycast hits one member of an instance batch. */
export interface InstanceHit<T> {
    id: string
    item: T
    instanceIndex: number
}

export type InstanceKey<T> = keyof T | string | ((item: T, index: number) => string)
export type InstanceGeometry = THREE.BufferGeometry | (() => THREE.BufferGeometry)
export type InstanceAnchor = 'base' | 'center' | 'origin'

interface InstanceState<T> {
    text: string
    items: readonly T[]
    keyBy: InstanceKey<T>
    encoding?: InstanceEncoding<T>
    geometry?: InstanceGeometry
    material?: VxMaterialProps
    anchor: InstanceAnchor
}

interface EncodedInstance<T> {
    id: string
    item: T
    sourceIndex: number
    slot: number
    matrix: THREE.Matrix4
    color: THREE.Color
    visible: boolean
}

const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)

function nextCapacity(required: number): number {
    let capacity = 1
    while (capacity < required) capacity *= 2
    return capacity
}

/**
 * Experimental semantic repeater backed by one THREE.InstancedMesh.
 *
 * It deliberately remains one logical Vuetrex node. Per-item identity is kept
 * in keyed GPU slots and exposed through VxMouseEvent.vxInstance.
 */
export class InstanceNode<T = unknown> extends Node {
    declare protected state: InstanceState<T>

    readonly material: THREE.MeshStandardMaterial

    private stopHandle?: WatchStopHandle
    private mesh?: THREE.InstancedMesh
    private capacity = 0
    private geometry?: THREE.BufferGeometry
    private geometrySource?: InstanceGeometry
    private ownsGeometry = false

    private readonly slotById = new Map<string, number>()
    private readonly hitBySlot: Array<InstanceHit<T> | undefined> = []
    private freeSlots: number[] = []
    private nextSlot = 0

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({
            text: '',
            items: [],
            keyBy: 'id',
            encoding: undefined,
            geometry: undefined,
            material: undefined,
            anchor: 'base',
        })
        this.material = stage.createElementMaterial()
    }

    override setStateValue(key: string, value: unknown): void {
        if (key === 'geometry' && value && (typeof value === 'object' || typeof value === 'function')) {
            this.state.geometry = markRaw(value as InstanceGeometry)
            return
        }
        if (key === 'encoding' && value && typeof value === 'object') {
            this.state.encoding = markRaw(value as InstanceEncoding<T>)
            return
        }
        super.setStateValue(key, value)
    }

    /** Resolve a GPU instance index back to its current semantic item. */
    instanceHitAt(instanceIndex: number): InstanceHit<T> | undefined {
        return this.hitBySlot[instanceIndex]
    }

    protected override intrinsicSize(): THREE.Vector3 {
        const bounds = this.encodedBounds()
        return bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3())
    }

    override renderOffset(): THREE.Vector3 {
        if (this.state.anchor === 'origin') return new THREE.Vector3()

        const bounds = this.encodedBounds()
        if (bounds.isEmpty()) return new THREE.Vector3()

        const center = bounds.getCenter(new THREE.Vector3())
        if (this.state.anchor === 'center') return center.multiplyScalar(-1)
        return new THREE.Vector3(-center.x, -bounds.min.y, -center.z)
    }

    syncWithThree(): void {
        if (this.stopHandle) return

        this.stopHandle = watchEffect(() => {
            const records = this.encodeItems()
            const geometry = this.resolveGeometry()
            const highestSlot = records.reduce((highest, record) => Math.max(highest, record.slot), -1)
            this.ensureMesh(geometry, nextCapacity(highestSlot + 1))

            if (this.state.material) applyMaterialProps(this.material, this.state.material)
            this.writeInstances(records, highestSlot + 1)

            const parent = this.nearestAncestorObject()
            if (this.mesh!.parent !== parent) parent.add(this.mesh!)
            this.mesh!.name = `el-${this.name}`
            this.mesh!.userData.el = this.element
            this.mesh!.position.copy(this.element.getPosition())
            this.stage.connectors.update(this.element)
            this.stage.invalidateContentBounds?.()
        }, { flush: 'post' })
    }

    onRemoved(): void {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.clearMesh()
        if (this.ownsGeometry) this.geometry?.dispose()
        this.geometry = undefined
        this.material.dispose()
        this.stage.invalidateContentBounds?.()
    }

    private semanticId(item: T, index: number): string {
        const key = this.state.keyBy
        const value = typeof key === 'function'
            ? key(item, index)
            : item && typeof item === 'object'
                ? (item as Record<PropertyKey, unknown>)[key as PropertyKey]
                : undefined
        return value === undefined || value === null || value === '' ? String(index) : String(value)
    }

    private defaultMatrix(index: number): THREE.Matrix4 {
        return new THREE.Matrix4().makeTranslation(0, index + 0.5, 0)
    }

    private encodeItems(): EncodedInstance<T>[] {
        const items = this.state.items ?? []
        const encoding = this.state.encoding
        const ids = items.map((item, index) => this.semanticId(item, index))
        const activeIds = new Set(ids)

        for (const [id, slot] of [...this.slotById]) {
            if (!activeIds.has(id)) {
                this.slotById.delete(id)
                this.hitBySlot[slot] = undefined
                this.freeSlots.push(slot)
            }
        }
        this.freeSlots.sort((a, b) => a - b)

        const seen = new Set<string>()
        return items.map((item, sourceIndex) => {
            const id = ids[sourceIndex]
            if (seen.has(id)) throw new Error(`vx-instances requires unique keys; duplicate key: ${id}`)
            seen.add(id)

            let slot = this.slotById.get(id)
            if (slot === undefined) {
                slot = this.freeSlots.shift() ?? this.nextSlot++
                this.slotById.set(id, slot)
            }

            const hit = { id, item, instanceIndex: slot }
            this.hitBySlot[slot] = hit
            return {
                id,
                item,
                sourceIndex,
                slot,
                matrix: encoding?.transform(item, sourceIndex) ?? this.defaultMatrix(sourceIndex),
                color: new THREE.Color(encoding?.color(item, sourceIndex) ?? 0xffffff),
                visible: encoding?.visible?.(item, sourceIndex) ?? true,
            }
        })
    }

    private resolveGeometry(): THREE.BufferGeometry {
        const source = this.state.geometry
        if (this.geometry && source === this.geometrySource) return this.geometry

        if (this.ownsGeometry) this.geometry?.dispose()
        this.geometrySource = source
        if (typeof source === 'function') {
            this.geometry = markRaw(source())
            this.ownsGeometry = true
        } else if (source) {
            this.geometry = source
            this.ownsGeometry = false
        } else {
            this.geometry = markRaw(new THREEx.RoundedBoxGeometry(1, 1, 1, 4, 0.08))
            this.ownsGeometry = true
        }
        this.geometry.computeBoundingBox()
        return this.geometry
    }

    private ensureMesh(geometry: THREE.BufferGeometry, capacity: number): void {
        if (this.mesh && this.mesh.geometry === geometry && this.capacity >= capacity) return

        this.clearMesh()
        this.capacity = capacity
        this.mesh = new THREE.InstancedMesh(geometry, this.material, capacity)
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
        this.element.mesh = this.mesh
        this.subscribeEvents()
    }

    private writeInstances(records: EncodedInstance<T>[], count: number): void {
        for (let slot = 0; slot < count; slot++) {
            this.mesh!.setMatrixAt(slot, hiddenMatrix)
            this.mesh!.setColorAt(slot, new THREE.Color(0xffffff))
        }
        for (const record of records) {
            this.mesh!.setMatrixAt(record.slot, record.visible ? record.matrix : hiddenMatrix)
            this.mesh!.setColorAt(record.slot, record.color)
        }
        this.mesh!.count = count
        this.mesh!.instanceMatrix.needsUpdate = true
        this.mesh!.computeBoundingBox()
        this.mesh!.computeBoundingSphere()
        if (this.mesh!.instanceColor) this.mesh!.instanceColor.needsUpdate = true
        this.mesh!.computeBoundingSphere()
    }

    private encodedBounds(): THREE.Box3 {
        const geometry = this.resolveGeometry()
        const localBounds = geometry.boundingBox ?? new THREE.Box3()
        const result = new THREE.Box3()
        for (const record of this.encodeItems()) {
            if (!record.visible) continue
            result.union(localBounds.clone().applyMatrix4(record.matrix))
        }
        return result
    }

    private clearMesh(): void {
        if (!this.mesh) return
        this.stage.connectors.remove(this.element)
        if (this.subscribed) {
            const eventMesh = this.mesh as unknown as THREE.Object3D<VxEventMap>
            eventMesh.removeEventListener(Node.CLICK, this.clickListener)
            eventMesh.removeEventListener(Node.DBLCLICK, this.dblclickListener)
            eventMesh.removeEventListener(Node.MOUSE_OVER, this.mouseOverListener)
            eventMesh.removeEventListener(Node.MOUSE_OUT, this.mouseOutListener)
            this.subscribed = false
        }
        this.mesh.removeFromParent()
        this.mesh.dispose()
        this.mesh = undefined
        this.element.mesh = null
    }
}

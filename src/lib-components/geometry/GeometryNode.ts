import * as THREE from 'three'
import { markRaw, shallowReactive, shallowRef, watchEffect, type WatchStopHandle } from 'vue'
import { GeometryEvaluator } from '@/lib-components/geometry/compiler/evaluator.js'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import {
    GeometryPrototypeRegistry,
    geometryPrototypePoolFor,
} from '@/lib-components/geometry/compiler/prototypes.js'
import { GeometryRealizer } from '@/lib-components/geometry/compiler/realizer.js'
import {
    boundsDescription,
    describeGeometryGraph,
    geometryWarnings,
    type GeometryRuntimeDiagnostics,
    type GeometryUpdateKind,
} from '@/lib-components/geometry/diagnostics.js'
import type {
    GeometryHit,
    GeometryParameterValues,
    GeometryRecord,
    GeometryRecordSelector,
    GeometrySet,
    GeometrySource,
} from '@/lib-components/geometry/types.js'
import { isGeometrySource } from '@/lib-components/geometry/graph.js'
import { Node } from '@/lib-components/nodes/Node.js'
import { applyMaterialProps, type VxMaterialProps } from '@/lib-components/nodes/material.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

export type GeometryAnchor = 'base' | 'center' | 'origin'
export type GeometryMaterialChannels = Readonly<Record<string, VxMaterialProps>>

interface ProceduralGeometryState {
    graph?: GeometrySource
    parameters: GeometryParameterValues
    material?: VxMaterialProps
    materials: GeometryMaterialChannels
    anchor: GeometryAnchor
    text: string
}

export class GeometryNode extends Node {
    declare protected state: ProceduralGeometryState

    readonly group = new THREE.Group()
    readonly material: THREE.MeshStandardMaterial

    private readonly prototypes: GeometryPrototypeRegistry
    private readonly realizer: GeometryRealizer
    private readonly compiledBounds = shallowRef(new THREE.Box3())
    private readonly compiledSet = shallowRef<GeometrySet>({ records: [] })
    private readonly realizationRevision = shallowRef(0)
    private compileStopHandle?: WatchStopHandle
    private placementStopHandle?: WatchStopHandle
    private materialStopHandle?: WatchStopHandle
    private evaluationCount = 0
    private evaluationMs = 0
    private updateKind: GeometryUpdateKind = 'empty'
    private topologyBuildCount = 0
    private previousTopologySignature?: string
    private previousStructureSignature?: string
    private previousAttributeSignature?: string

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({
            graph: undefined,
            parameters: {},
            material: undefined,
            materials: {},
            anchor: 'base',
            text: '',
        })
        this.prototypes = new GeometryPrototypeRegistry(geometryPrototypePoolFor(stage))
        this.material = stage.createElementMaterial()
        this.realizer = new GeometryRealizer(
            this.group,
            this.material,
            () => this.stage.shadowsEnabled?.() ?? true,
        )
        this.element.mesh = this.group
    }

    override setStateValue(key: string, value: unknown): void {
        const normalized = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
            : key
        if (normalized === 'graph') {
            if (value !== undefined && value !== null && !isGeometrySource(value)) {
                throw new TypeError('vx-geometry requires its graph prop to be a GeometrySource.')
            }
            this.state.graph = value ? markRaw(value as GeometrySource) : undefined
            return
        }
        if (normalized === 'parameters' || normalized === 'materials') {
            if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
                throw new TypeError(`vx-geometry ${normalized} must be an object.`)
            }
            if (normalized === 'parameters') {
                this.state.parameters = (value ?? {}) as GeometryParameterValues
            } else {
                this.state.materials = (value ?? {}) as GeometryMaterialChannels
            }
            return
        }
        if (normalized === 'anchor') {
            if (value !== 'base' && value !== 'center' && value !== 'origin') {
                throw new TypeError(`vx-geometry anchor must be 'base', 'center', or 'origin'; received '${String(value)}'.`)
            }
            this.state.anchor = value
            return
        }
        super.setStateValue(key, value)
    }

    protected override intrinsicSize(): THREE.Vector3 {
        const bounds = this.compiledBounds.value
        return bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3())
    }

    override renderOffset(): THREE.Vector3 {
        if (this.state.anchor === 'origin' || this.compiledBounds.value.isEmpty()) return new THREE.Vector3()
        const bounds = this.compiledBounds.value
        const center = bounds.getCenter(new THREE.Vector3())
        if (this.state.anchor === 'center') return center.multiplyScalar(-1)
        return new THREE.Vector3(-center.x, -bounds.min.y, -center.z)
    }

    instanceHitAt(instanceIndex: number, object?: THREE.Object3D): GeometryHit<unknown> | undefined {
        return this.realizer.instanceHitAt(instanceIndex, object)
    }

    recordsOf(selector: GeometryRecordSelector): readonly GeometryRecord[] {
        return this.compiledSet.value.records.filter(record => recordMatches(record, selector))
    }

    localBoundsOf(selector: GeometryRecordSelector, target = new THREE.Box3()): THREE.Box3 | undefined {
        const records = this.recordsOf(selector)
        if (records.length === 0) return undefined
        return geometrySetBounds({ records }, target)
    }

    worldBoundsOf(selector: GeometryRecordSelector, target = new THREE.Box3()): THREE.Box3 | undefined {
        if (!this.localBoundsOf(selector, target)) return undefined
        this.group.updateWorldMatrix(true, false)
        return target.applyMatrix4(this.group.matrixWorld)
    }

    instanceWorldBounds(id: string, target = new THREE.Box3()): THREE.Box3 | undefined {
        return this.worldBoundsOf({ item: id }, target)
            ?? this.worldBoundsOf(id, target)
    }

    syncWithThree(): void {
        if (this.compileStopHandle) return

        this.compileStopHandle = watchEffect(() => {
            if (this.parent.value === null) return
            const graph = this.state.graph
            const parameters = this.state.parameters
            const start = currentTime()
            const priorCreations = this.prototypes.sharedCreationCount
            this.prototypes.beginCompilation()
            try {
                const set = graph
                    ? new GeometryEvaluator(this.prototypes, parameters).evaluate(graph)
                    : { records: [] }
                this.realizer.realize(set)
                this.compiledSet.value = markRaw(set)
                this.compiledBounds.value = geometrySetBounds(set)
                this.captureDiagnostics(set)
                this.topologyBuildCount += this.prototypes.sharedCreationCount - priorCreations
                this.evaluationCount++
                this.evaluationMs = currentTime() - start
                this.realizationRevision.value++
            } catch (error) {
                this.realizer.realize({ records: [] })
                this.compiledSet.value = { records: [] }
                this.compiledBounds.value = new THREE.Box3()
                this.realizationRevision.value++
                throw error
            } finally {
                this.prototypes.endCompilation()
            }
            this.stage.invalidateContentBounds?.()
        }, { flush: 'post' })

        this.materialStopHandle = watchEffect(() => {
            const material = this.state.material
            if (material) applyMaterialProps(this.material, material)
            this.realizer.updateMaterials(this.state.materials)
        }, { flush: 'post' })

        this.placementStopHandle = watchEffect(() => {
            void this.realizationRevision.value
            if (this.parent.value === null) return
            const parent = this.nearestAncestorObject()
            if (this.group.parent !== parent) parent.add(this.group)
            this.group.position.copy(this.element.getPosition())
            this.realizer.updateIdentity(this.element, this.id, this.disabled)
            this.applyObjectState(this.group)
            this.subscribeEvents()
            this.stage.connectors.update(this.element)
            this.stage.reconcileConnections?.()
            this.stage.invalidateContentBounds?.()
        }, { flush: 'post' })
    }

    onRemoved(): void {
        this.compileStopHandle?.()
        this.placementStopHandle?.()
        this.materialStopHandle?.()
        this.compileStopHandle = undefined
        this.placementStopHandle = undefined
        this.materialStopHandle = undefined
        if (this.subscribed && this.element.mesh) {
            this.element.mesh.removeEventListener(Node.CLICK, this.clickListener)
            this.element.mesh.removeEventListener(Node.DBLCLICK, this.dblclickListener)
            this.element.mesh.removeEventListener(Node.MOUSE_OVER, this.mouseOverListener)
            this.element.mesh.removeEventListener(Node.MOUSE_OUT, this.mouseOutListener)
            this.subscribed = false
        }
        this.stage.connectors.remove(this.element)
        this.realizer.dispose()
        this.prototypes.dispose()
        this.compiledSet.value = { records: [] }
        this.compiledBounds.value = new THREE.Box3()
        this.group.removeFromParent()
        this.material.dispose()
        this.element.mesh = null
        this.stage.invalidateContentBounds?.()
    }

    /** Exposed for diagnostics and focused tests; callers should use measuredSize for layout. */
    localBounds(target = new THREE.Box3()): THREE.Box3 {
        return target.copy(this.compiledBounds.value)
    }

    /** Number of compatible mesh prototype batches in the current realization. */
    get instanceBatchCount(): number {
        return this.realizer.batchCount
    }

    /** Number of generated topology prototypes retained by this node. */
    get prototypeCount(): number {
        return this.prototypes.size
    }

    /** Number of topology buffers shared by all procedural nodes on this stage. */
    get sharedPrototypeCount(): number {
        return this.prototypes.sharedSize
    }

    geometryDiagnostics(): GeometryRuntimeDiagnostics | null {
        const graph = this.state.graph
        if (!graph) return null
        const set = this.compiledSet.value
        return Object.freeze({
            graph: describeGeometryGraph(graph),
            recordCount: set.records.length,
            prototypeCount: new Set(set.records.map(record => record.prototype.signature)).size,
            materialKeys: Object.freeze([...new Set(set.records.map(record => record.materialKey))].sort()),
            groups: Object.freeze([...new Set(set.records.flatMap(record => record.groups))].sort()),
            bounds: boundsDescription(this.compiledBounds.value),
            warnings: geometryWarnings(graph, set),
            evaluationCount: this.evaluationCount,
            evaluationMs: this.evaluationMs,
            updateKind: this.updateKind,
            batchCount: this.realizer.batchCount,
            localPrototypeCount: this.prototypes.size,
            sharedPrototypeCount: this.prototypes.sharedSize,
            topologyBuildCount: this.topologyBuildCount,
        })
    }

    private captureDiagnostics(set: GeometrySet): void {
        const topology = [...new Set(set.records.map(record => record.prototype.signature))].sort().join('|')
        const structure = set.records.map(record => [
            record.key,
            record.prototype.signature,
            record.materialKey,
            record.groups.join(','),
        ].join(':')).join('|')
        const attributes = set.records.map(record => [
            record.matrix.elements.join(','),
            record.color.getHexString(),
            record.visible ? '1' : '0',
        ].join(':')).join('|')

        this.updateKind = set.records.length === 0
            ? 'empty'
            : this.previousTopologySignature === undefined
                ? 'initial'
                : topology !== this.previousTopologySignature
                    ? 'topology'
                    : structure !== this.previousStructureSignature
                        ? 'structure'
                        : attributes !== this.previousAttributeSignature
                            ? 'attributes'
                            : 'unchanged'
        this.previousTopologySignature = topology
        this.previousStructureSignature = structure
        this.previousAttributeSignature = attributes
    }
}

function itemId(item: unknown): string | undefined {
    if (!item || typeof item !== 'object' || !('id' in item)) return undefined
    const value = (item as Record<string, unknown>).id
    return value === undefined || value === null || value === '' ? undefined : String(value)
}

function recordMatches(record: GeometryRecord, selector: GeometryRecordSelector): boolean {
    if (typeof selector === 'string') {
        return record.key === selector
            || record.groups.includes(selector)
            || itemId(record.context.item) === selector
            || record.context.domainKey === selector
    }
    return (selector.group === undefined || record.groups.includes(selector.group))
        && (selector.material === undefined || record.materialKey === selector.material)
        && (selector.item === undefined || itemId(record.context.item) === String(selector.item))
}

function currentTime(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now()
}

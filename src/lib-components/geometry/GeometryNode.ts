import * as THREE from 'three'
import { markRaw, shallowReactive, shallowRef, watchEffect, type WatchStopHandle } from 'vue'
import { GeometryEvaluator } from '@/lib-components/geometry/compiler/evaluator.js'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { GeometryRealizer } from '@/lib-components/geometry/compiler/realizer.js'
import type { GeometrySource } from '@/lib-components/geometry/types.js'
import { isGeometrySource } from '@/lib-components/geometry/graph.js'
import { Node } from '@/lib-components/nodes/Node.js'
import { applyMaterialProps, type VxMaterialProps } from '@/lib-components/nodes/material.js'
import type { InstanceHit } from '@/lib-components/nodes/InstanceNode.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

export type GeometryAnchor = 'base' | 'center' | 'origin'

interface ProceduralGeometryState {
    graph?: GeometrySource
    material?: VxMaterialProps
    anchor: GeometryAnchor
    text: string
}

export class GeometryNode extends Node {
    declare protected state: ProceduralGeometryState

    readonly group = new THREE.Group()
    readonly material: THREE.MeshStandardMaterial

    private readonly prototypes = new GeometryPrototypeRegistry()
    private readonly realizer: GeometryRealizer
    private readonly compiledBounds = shallowRef(new THREE.Box3())
    private readonly realizationRevision = shallowRef(0)
    private compileStopHandle?: WatchStopHandle
    private placementStopHandle?: WatchStopHandle
    private materialStopHandle?: WatchStopHandle

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({
            graph: undefined,
            material: undefined,
            anchor: 'base',
            text: '',
        })
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

    instanceHitAt(instanceIndex: number, object?: THREE.Object3D): InstanceHit<unknown> | undefined {
        return this.realizer.instanceHitAt(instanceIndex, object)
    }

    syncWithThree(): void {
        if (this.compileStopHandle) return

        this.compileStopHandle = watchEffect(() => {
            if (this.parent.value === null) return
            const graph = this.state.graph
            this.prototypes.beginCompilation()
            try {
                const set = graph
                    ? new GeometryEvaluator(this.prototypes).evaluate(graph)
                    : { records: [] }
                this.realizer.realize(set)
                this.compiledBounds.value = geometrySetBounds(set)
                this.realizationRevision.value++
            } catch (error) {
                this.realizer.realize({ records: [] })
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
            this.realizer.updateLineMaterials()
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
}

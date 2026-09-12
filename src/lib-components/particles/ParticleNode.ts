import * as THREE from 'three'
import { markRaw, shallowReactive, shallowRef, watchEffect, type WatchStopHandle } from 'vue'
import { createParticleBackend, type ParticleBackend } from '@/lib-components/particles/backend.js'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { isParticleSource } from '@/lib-components/particles/graph.js'
import type {
    ParticleHit,
    ParticleParameterValues,
    ParticleSource,
    ParticleTarget,
    ParticleVector3Like,
} from '@/lib-components/particles/types.js'
import { Node } from '@/lib-components/nodes/Node.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

export type ParticleAnchor = 'base' | 'center' | 'origin'

interface ParticleNodeState {
    graph?: ParticleSource
    parameters: ParticleParameterValues
    anchor: ParticleAnchor
    paused: boolean
    timeScale: number
    interactive: boolean
    text: string
}

export interface ParticleDiagnostics {
    readonly particleCount: number
    readonly emitterCount: number
    readonly backend: string
    readonly bounds: readonly [number, number, number] | null
}

/** One logical Vuetrex node that executes an immutable particle graph. */
export class ParticleNode extends Node {
    declare protected state: ParticleNodeState

    readonly group = new THREE.Group()

    private backend?: ParticleBackend
    private readonly compiledBounds = shallowRef(new THREE.Box3())
    private readonly realizationRevision = shallowRef(0)
    private compileStopHandle?: WatchStopHandle
    private placementStopHandle?: WatchStopHandle
    private stopAnimation?: () => void
    private elapsedSeconds = 0
    private lastFrameTime?: number
    private emitterCount = 0

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({
            graph: undefined,
            parameters: {},
            anchor: 'origin',
            paused: false,
            timeScale: 1,
            interactive: false,
            text: '',
        })
        this.group.name = 'vx-particles'
        this.element.mesh = this.group
    }

    override setStateValue(key: string, value: unknown): void {
        const normalized = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
            : key
        if (normalized === 'graph') {
            if (value !== undefined && value !== null && !isParticleSource(value)) {
                throw new TypeError('vx-particles requires its graph prop to be a ParticleSource.')
            }
            this.state.graph = value ? markRaw(value as ParticleSource) : undefined
            return
        }
        if (normalized === 'parameters') {
            if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
                throw new TypeError('vx-particles parameters must be an object.')
            }
            this.state.parameters = (value ?? {}) as ParticleParameterValues
            return
        }
        if (normalized === 'anchor') {
            if (value !== 'base' && value !== 'center' && value !== 'origin') {
                throw new TypeError(`vx-particles anchor must be 'base', 'center', or 'origin'; received '${String(value)}'.`)
            }
            this.state.anchor = value
            return
        }
        if (normalized === 'paused' || normalized === 'interactive') {
            this.state[normalized] = value === true || value === '' || value === 'true'
            return
        }
        if (normalized === 'timeScale') {
            const timeScale = Number(value)
            if (!Number.isFinite(timeScale) || timeScale < 0) {
                throw new TypeError(`vx-particles time-scale must be a non-negative number; received '${String(value)}'.`)
            }
            this.state.timeScale = timeScale
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
        const center = this.compiledBounds.value.getCenter(new THREE.Vector3())
        if (this.state.anchor === 'center') return center.multiplyScalar(-1)
        return new THREE.Vector3(-center.x, -this.compiledBounds.value.min.y, -center.z)
    }

    instanceHitAt(instanceIndex: number, object?: THREE.Object3D): ParticleHit | undefined {
        return this.backend?.particleHitAt(instanceIndex, object)
    }

    localBounds(target = new THREE.Box3()): THREE.Box3 {
        return target.copy(this.compiledBounds.value)
    }

    particlesDiagnostics(): ParticleDiagnostics | null {
        if (!this.backend) return null
        const size = this.compiledBounds.value.isEmpty()
            ? null
            : this.compiledBounds.value.getSize(new THREE.Vector3()).toArray() as [number, number, number]
        return Object.freeze({
            particleCount: this.backend.particleCount,
            emitterCount: this.emitterCount,
            backend: this.backend.object.name.replace('vx-particle-backend-', '') || 'custom',
            bounds: size,
        })
    }

    syncWithThree(): void {
        if (this.compileStopHandle || this.placementStopHandle) return

        // Establish the group's coordinate space before compiling named-target
        // clouds, whose target bounds must be converted from world to local.
        this.placementStopHandle = watchEffect(() => {
            void this.realizationRevision.value
            if (this.parent.value === null) return
            const parent = this.nearestAncestorObject()
            if (this.group.parent !== parent) parent.add(this.group)
            this.group.position.copy(this.element.getPosition())
            this.applyObjectState(this.group)
            this.applyParticleIdentity()
            this.subscribeEvents()
            this.stage.connectors.update(this.element)
            this.stage.reconcileConnections?.()
            this.stage.invalidateContentBounds?.()
        }, { flush: 'post' })

        this.compileStopHandle = watchEffect(() => {
            if (this.parent.value === null) return
            const graph = this.state.graph
            const parameters = this.state.parameters
            const parent = this.nearestAncestorObject()
            if (this.group.parent !== parent) parent.add(this.group)
            this.disposeBackend()
            if (!graph) {
                this.compiledBounds.value = new THREE.Box3()
                this.emitterCount = 0
                this.realizationRevision.value++
                this.stage.invalidateContentBounds?.()
                return
            }

            const program = compileParticles(graph, parameters)
            this.emitterCount = program.emitters.length
            this.backend = createParticleBackend(program, {
                parameters,
                pixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
                resolveTarget: target => this.resolveTarget(target),
            })
            this.group.add(this.backend.object)
            this.compiledBounds.value = this.backend.localBounds()
            this.realizationRevision.value++
            this.stage.invalidateContentBounds?.()
        }, { flush: 'post' })

        this.stopAnimation = this.stage.onEachFrame((timer) => {
            if (this.state.paused) {
                this.lastFrameTime = timer
                return
            }
            const delta = this.lastFrameTime === undefined ? 0 : Math.max(0, (timer - this.lastFrameTime) / 1000)
            this.lastFrameTime = timer
            const scaledDelta = delta * Math.max(0, this.state.timeScale)
            this.elapsedSeconds += scaledDelta
            this.backend?.update(this.elapsedSeconds, scaledDelta)
        })
    }

    onRemoved(): void {
        this.compileStopHandle?.()
        this.placementStopHandle?.()
        this.stopAnimation?.()
        this.compileStopHandle = undefined
        this.placementStopHandle = undefined
        this.stopAnimation = undefined
        if (this.subscribed && this.element.mesh) {
            this.element.mesh.removeEventListener(Node.CLICK, this.clickListener)
            this.element.mesh.removeEventListener(Node.DBLCLICK, this.dblclickListener)
            this.element.mesh.removeEventListener(Node.MOUSE_OVER, this.mouseOverListener)
            this.element.mesh.removeEventListener(Node.MOUSE_OUT, this.mouseOutListener)
            this.subscribed = false
        }
        this.stage.connectors.remove(this.element)
        this.disposeBackend()
        this.group.removeFromParent()
        this.element.mesh = null
        this.stage.invalidateContentBounds?.()
    }

    private applyParticleIdentity(): void {
        this.group.name = `el-${this.id}`
        this.group.userData.el = this.element
        this.group.traverse(object => {
            if (object === this.group) return
            object.name = this.state.interactive ? `el-${this.id}` : `vx-particle-${this.id}`
            object.userData.el = this.state.interactive ? this.element : undefined
            object.userData.vxParticles = this.state.interactive
            object.userData.vxDisabled = this.disabled
        })
    }

    private disposeBackend(): void {
        if (!this.backend) return
        this.backend.object.removeFromParent()
        this.backend.dispose()
        this.backend = undefined
    }

    private resolveTarget(target: ParticleTarget): { center: THREE.Vector3, radius: THREE.Vector3 } {
        if (typeof target !== 'string') {
            return { center: vectorFrom(target), radius: new THREE.Vector3(1, 1, 1) }
        }
        const object = this.stage.getById(target)?.mesh
        if (!object) return { center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }

        object.updateWorldMatrix(true, true)
        this.group.updateWorldMatrix(true, false)
        const worldBounds = new THREE.Box3().setFromObject(object)
        if (worldBounds.isEmpty()) {
            const center = object.getWorldPosition(new THREE.Vector3())
            return { center: this.group.worldToLocal(center), radius: new THREE.Vector3(1, 1, 1) }
        }
        const inverse = this.group.matrixWorld.clone().invert()
        const localBounds = transformBounds(worldBounds, inverse)
        return {
            center: localBounds.getCenter(new THREE.Vector3()),
            radius: localBounds.getSize(new THREE.Vector3()).multiplyScalar(0.5),
        }
    }
}

function vectorFrom(value: ParticleVector3Like): THREE.Vector3 {
    if (value instanceof THREE.Vector3) return value.clone()
    if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2])
    const point = value as { x: number, y: number, z: number }
    return new THREE.Vector3(point.x, point.y, point.z)
}

function transformBounds(bounds: THREE.Box3, matrix: THREE.Matrix4): THREE.Box3 {
    const result = new THREE.Box3()
    for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
                result.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix))
            }
        }
    }
    return result
}

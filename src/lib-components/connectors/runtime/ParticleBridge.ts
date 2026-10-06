import * as THREE from 'three'
import { gpuParticlePosition } from '@/lib-components/particles/compiler/gpuPathMotion.js'
import { createParticleBackend, type ParticleBackend } from '@/lib-components/particles/backend.js'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { isParticleSource, particleGraphSignature } from '@/lib-components/particles/graph.js'
import type { ParticleTarget } from '@/lib-components/particles/types.js'
import type { ConnectorFlowRecord } from '@/lib-components/connectors/compiler/types.js'
import type { ConnectorEdgeHit, ConnectorHit, ConnectorParameterValues } from '@/lib-components/connectors/types.js'
import { stableValue } from '@/lib-components/connectors/compiler/evaluator.js'
import { connectorPathPosition } from '@/lib-components/connectors/runtime/hit.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

interface FlowEntry {
    readonly signature: string
    readonly record: ConnectorFlowRecord
    readonly backend: ParticleBackend
    readonly emitterCount: number
}

interface OwnerFlowState {
    readonly group: THREE.Group
    readonly entries: Map<string, FlowEntry>
}

interface ObjectEntry {
    readonly ownerId: string
    readonly entryId: string
}

/** Keyed bridge from resolved connector flow records to registered particle backends. */
export class ParticleBridge {
    private readonly owners = new Map<string, OwnerFlowState>()
    private readonly entryByObject = new WeakMap<THREE.Object3D, ObjectEntry>()
    private stopAnimation?: () => void
    private lastFrameTime?: number
    private elapsedSeconds = 0
    private rebuilds = 0

    constructor(private readonly stage: VuetrexStage) {}

    reconcile(ownerId: string, records: readonly ConnectorFlowRecord[], parameters: ConnectorParameterValues = {}): void {
        if (!records.length) {
            this.removeOwner(ownerId)
            return
        }
        let owner = this.owners.get(ownerId)
        if (!owner) {
            const group = new THREE.Group()
            group.name = `vx-connector-particles-${ownerId}`
            group.userData.vxConnectorOutput = true
            stageScene(this.stage).add(group)
            owner = { group, entries: new Map() }
            this.owners.set(ownerId, owner)
        }

        const nextIds = new Set(records.map(record => record.id))
        for (const [entryId, entry] of owner.entries) {
            if (nextIds.has(entryId)) continue
            this.removeEntry(entry)
            owner.entries.delete(entryId)
        }
        for (const record of [...records].sort((a, b) => a.id.localeCompare(b.id))) {
            if (!isParticleSource(record.source)) {
                throw new TypeError(`Connector flow '${record.key}' must return a ParticleSource.`)
            }
            const signature = `${record.signature}:${particleGraphSignature(record.source)}:${stableValue(parameters)}:${record.interactive}`
            const current = owner.entries.get(record.id)
            if (current?.signature === signature) continue
            if (current) this.removeEntry(current)

            const compiled = compileParticles(record.source)
            // Routes have already been shaped by the connector resolver. Do
            // not smooth their corners again unless the author requests it.
            const program = Object.freeze({
                emitters: Object.freeze(compiled.emitters.map(emitter => emitter.kind === 'path'
                    && emitter.options.interpolation === undefined
                    ? Object.freeze({
                        ...emitter,
                        options: Object.freeze({ ...emitter.options, interpolation: 'linear' as const }),
                    })
                    : emitter)),
            })
            const backend = createParticleBackend(program, {
                parameters,
                pixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
                resolveTarget: target => this.resolveTarget(target),
            }, { gpuPaths: true })
            backend.object.name = `vx-connector-particles-${ownerId}-${record.key}`
            backend.object.userData.vxConnectorOutput = true
            backend.object.traverse(object => {
                object.userData.vxConnectorOutput = true
                object.userData.vxConnectorOwner = record.interactive ? ownerId : undefined
                object.userData.vxParticles = true
                this.entryByObject.set(object, { ownerId, entryId: record.id })
            })
            owner.group.add(backend.object)
            owner.entries.set(record.id, { signature, record, backend, emitterCount: program.emitters.length })
            this.rebuilds++
        }
        this.syncAnimation()
    }

    removeOwner(ownerId: string): void {
        const owner = this.owners.get(ownerId)
        if (!owner) return
        for (const entry of owner.entries.values()) this.removeEntry(entry)
        owner.entries.clear()
        owner.group.removeFromParent()
        this.owners.delete(ownerId)
        this.syncAnimation()
    }

    hitAt(object: THREE.Object3D, instanceId?: number, intersection?: THREE.Intersection): ConnectorHit | undefined {
        if (instanceId === undefined) return undefined
        const objectEntry = this.entryByObject.get(object)
        const entry = objectEntry ? this.owners.get(objectEntry.ownerId)?.entries.get(objectEntry.entryId) : undefined
        if (!entry?.record.interactive) return undefined
        const particle = entry.backend.particleHitAt(instanceId, object)
        if (!particle) return undefined
        const point = intersection?.point.clone() ?? particlePoint(object, instanceId)
        const hit: ConnectorEdgeHit = Object.freeze({
            kind: 'edge',
            key: entry.record.key,
            item: entry.record.item,
            part: 'particle',
            point: Object.freeze(point.toArray() as [number, number, number]),
            pathPosition: connectorPathPosition(entry.record.network, point),
            sourceName: entry.record.sourceName,
        })
        return hit
    }

    diagnostics(): { readonly owners: number; readonly emitters: number; readonly particles: number; readonly rebuilds: number } {
        let emitters = 0
        let particleCount = 0
        for (const owner of this.owners.values()) {
            for (const entry of owner.entries.values()) {
                emitters += entry.emitterCount
                particleCount += entry.backend.particleCount
            }
        }
        return Object.freeze({ owners: this.owners.size, emitters, particles: particleCount, rebuilds: this.rebuilds })
    }

    dispose(): void {
        for (const ownerId of [...this.owners.keys()]) this.removeOwner(ownerId)
    }

    private removeEntry(entry: FlowEntry): void {
        entry.backend.object.removeFromParent()
        entry.backend.dispose()
    }

    private syncAnimation(): void {
        const hasEntries = [...this.owners.values()].some(owner => owner.entries.size > 0)
        if (hasEntries && !this.stopAnimation) {
            const subscribe = typeof this.stage.onEachFrame === 'function'
                ? this.stage.onEachFrame.bind(this.stage)
                : this.stage.registerAnimation.bind(this.stage)
            this.stopAnimation = subscribe((timer) => {
                const delta = this.lastFrameTime === undefined ? 0 : Math.max(0, (timer - this.lastFrameTime) / 1000)
                this.lastFrameTime = timer
                this.elapsedSeconds += delta
                for (const owner of this.owners.values()) {
                    for (const entry of owner.entries.values()) entry.backend.update(this.elapsedSeconds, delta)
                }
            }) ?? (() => {})
        } else if (!hasEntries && this.stopAnimation) {
            this.stopAnimation()
            this.stopAnimation = undefined
            this.lastFrameTime = undefined
            this.elapsedSeconds = 0
        }
    }

    private resolveTarget(target: ParticleTarget): { center: THREE.Vector3; radius: THREE.Vector3 } {
        if (typeof target !== 'string') return { center: vectorFrom(target), radius: new THREE.Vector3(1, 1, 1) }
        const object = this.stage.getById(target)?.mesh
        if (!object) return { center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }
        object.updateWorldMatrix(true, true)
        const bounds = new THREE.Box3().setFromObject(object)
        if (bounds.isEmpty()) {
            return { center: object.getWorldPosition(new THREE.Vector3()), radius: new THREE.Vector3(1, 1, 1) }
        }
        return {
            center: bounds.getCenter(new THREE.Vector3()),
            radius: bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5),
        }
    }
}

function stageScene(stage: VuetrexStage): THREE.Scene {
    return typeof stage.getScene === 'function' ? stage.getScene() : stage.scene
}

function particlePoint(object: THREE.Object3D, instanceId: number): THREE.Vector3 {
    const animated = gpuParticlePosition(object, instanceId)
    if (animated) return animated.applyMatrix4(object.matrixWorld)
    const position = (object as THREE.Points).geometry?.getAttribute?.('position')
    if (!position || instanceId >= position.count) return new THREE.Vector3()
    return new THREE.Vector3(position.getX(instanceId), position.getY(instanceId), position.getZ(instanceId))
        .applyMatrix4(object.matrixWorld)
}

function vectorFrom(value: Exclude<ParticleTarget, string>): THREE.Vector3 {
    if ((value as THREE.Vector3).isVector3) return (value as THREE.Vector3).clone()
    if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2])
    const point = value as { x: number; y: number; z: number }
    return new THREE.Vector3(point.x, point.y, point.z)
}

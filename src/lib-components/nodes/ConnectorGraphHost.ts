import { markRaw, shallowReactive, watch, type WatchStopHandle } from 'vue'
import { compileConnectors } from '@/lib-components/connectors/compiler/evaluator.js'
import { isConnectorSource } from '@/lib-components/connectors/graph.js'
import type {
    ConnectorHit,
    ConnectorParameterValues,
    ConnectorSource,
} from '@/lib-components/connectors/types.js'
import { Node } from './Node.js'
import { Base } from './Base.js'
import { compileEdge, mergePresentation, namedPresentation, presentationKeys, presentPlan, type ConnectorPresentation, type ConnectorEdgeDeclarationRecord } from '../connectors/declarations.js'
import type { AuthoredConnectorPlan } from '../connectors/compiler/types.js'
import { StageDeclaration } from '@/lib-components/nodes/StageDeclaration.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

type ConnectorEventListener = (hit: ConnectorHit, event: MouseEvent) => void

interface ConnectorGraphHostState extends ConnectorPresentation {
    scope?: string
    from?: string
    to?: string
    fromPort?: string
    toPort?: string
    graph?: ConnectorSource
    parameters: ConnectorParameterValues
    interactive: boolean
}

export interface ConnectorGraphHostEvents {
    onClick?: ConnectorEventListener
    onDblclick?: ConnectorEventListener
    onPointerenter?: ConnectorEventListener
    onPointerleave?: ConnectorEventListener
}

let connectorOwnerSequence = 0

/** One non-spatial renderer host that owns an arbitrary immutable connector graph. */
export class ConnectorGraphHost extends StageDeclaration {
    declare protected state: ConnectorGraphHostState
    readonly ownerId = `connector-owner:${++connectorOwnerSequence}`
    private stopHandle?: WatchStopHandle
    readonly isEdgeDeclaration: boolean = false
    declarationKey?: string
    private events: ConnectorGraphHostEvents = {}

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({ graph: undefined, parameters: {}, interactive: false })
    }

    override setStateValue(key: string, value: unknown): void {
        const normalized = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
            : key
        if ([...presentationKeys, 'scope', 'from', 'to', 'fromPort', 'toPort'].includes(normalized as any)) {
            if (value != null && ['clearance', 'elevation', 'strokeWidth', 'strokeOpacity'].includes(normalized)) {
                value = Number(value)
                if (!Number.isFinite(value) || (value as number) < 0 || (normalized === 'strokeOpacity' && (value as number) > 1)) throw new Error(`Invalid connector ${key}.`)
            }
            (this.state as any)[normalized] = value ?? undefined
            return
        }
        if (normalized === 'graph') {
            if (value !== undefined && value !== null && !isConnectorSource(value)) {
                throw new TypeError('vx-connectors requires its graph prop to be a ConnectorSource.')
            }
            this.state.graph = value ? markRaw(value as ConnectorSource) : undefined
            return
        }
        if (normalized === 'parameters') {
            if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
                throw new TypeError('vx-connectors parameters must be an object.')
            }
            this.state.parameters = (value ?? {}) as ConnectorParameterValues
            return
        }
        if (normalized === 'interactive') {
            this.state.interactive = value === true || value === '' || value === 'true'
            return
        }
        super.setStateValue(key, value)
    }

    set onClick(listener: ConnectorEventListener | undefined) { this.setEvent('onClick', listener) }
    set onDblclick(listener: ConnectorEventListener | undefined) { this.setEvent('onDblclick', listener) }
    set onPointerenter(listener: ConnectorEventListener | undefined) { this.setEvent('onPointerenter', listener) }
    set onPointerleave(listener: ConnectorEventListener | undefined) { this.setEvent('onPointerleave', listener) }

    protected override validateChild(child: Base): void {
        if (child.isRenderableNode() || (child instanceof StageDeclaration && !(child instanceof ConnectorGraphHost && child.isEdgeDeclaration))) {
            throw new Error('vx-connectors accepts only direct vx-edge declarations.')
        }
        if (this.isEdgeDeclaration && child instanceof StageDeclaration) throw new Error('vx-edge does not accept declaration children.')
    }

    private presentation(defaults: ConnectorPresentation = {}): ConnectorPresentation {
        return mergePresentation(defaults, namedPresentation(this.stage.connectorAppearances?.value ?? {}, this.state.appearance), this.state)
    }

    edgePlan(ownerId?: string, defaults: ConnectorPresentation = {}): AuthoredConnectorPlan {
        if (this.state.graph) throw new Error('vx-edge cannot take a graph; use vx-connectors.')
        return compileEdge({ ...this.state, key: this.declarationKey, ...this.presentation(defaults) } as ConnectorEdgeDeclarationRecord, ownerId)
    }

    syncWithThree(): void {
        if (this.stopHandle) return
        this.stopHandle = watch(() => {
            const parent = this.parent.value
            if (!parent) return undefined
            const parameters = this.state.parameters
            if (this.isEdgeDeclaration) {
                if (parent instanceof ConnectorGraphHost && !parent.isEdgeDeclaration) return undefined
                if (!(parent instanceof Node) || !parent.hasExplicitId) throw new Error('Local vx-edge requires a direct spatial parent with an explicit semantic id.')
                return { plan: this.edgePlan(parent.id), scope: parent.id, parameters, interactive: this.state.interactive }
            }
            const children = this.getHostChildren().filter((child): child is ConnectorGraphHost => child instanceof ConnectorGraphHost && child.isEdgeDeclaration)
            if (this.state.graph && children.length) throw new Error('vx-connectors accepts either graph or vx-edge children, never both.')
            let plan: AuthoredConnectorPlan
            const defaults = this.presentation()
            if (this.state.graph) plan = presentPlan(compileConnectors(this.state.graph, parameters), defaults)
            else {
                const records = children.flatMap(child => child.edgePlan(undefined, defaults).records)
                if (new Set(records.map(record => record.key)).size !== records.length) throw new Error('Duplicate vx-edge key within connector scope.')
                plan = Object.freeze({ records: Object.freeze(records), warnings: Object.freeze([]) })
            }
            return { plan, scope: this.state.scope ?? this.ownerId, parameters,
                interactive: this.state.interactive || children.some(child => child.state.interactive) }
        }, result => {
            if (!result) { this.stage.connectors.removeOwner(this.ownerId); return }
            this.stage.connectors.reconcile(this.ownerId, result.plan, {
                interactive: result.interactive,
                dispatch: (type, hit, event) => {
                    this.dispatch(type, hit, event)
                    if (!this.isEdgeDeclaration) {
                        const child = this.getHostChildren().find(child => child instanceof ConnectorGraphHost && child.declarationKey === hit.key) as ConnectorGraphHost | undefined
                        child?.dispatch(type, hit, event)
                    }
                },
            }, result.parameters, result.scope)
        }, { immediate: true, flush: 'post' })
    }

    onRemoved(): void {
        this.stopHandle?.()
        this.stopHandle = undefined
        this.stage.connectors.removeOwner(this.ownerId)
    }

    private dispatch(type: keyof ConnectorGraphHostEvents, hit: ConnectorHit, event: MouseEvent): void {
        this.events[type]?.(hit, event)
    }

    private setEvent(type: keyof ConnectorGraphHostEvents, listener: ConnectorEventListener | undefined): void {
        this.events[type] = listener
        if (listener) this.state.interactive = true
    }
}

/** Lifecycle-only relationship; a central host collects it or its spatial parent supplies from. */
export class EdgeDeclaration extends ConnectorGraphHost {
    override readonly isEdgeDeclaration = true
}

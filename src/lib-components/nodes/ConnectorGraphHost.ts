import { markRaw, shallowReactive, watchEffect, type WatchStopHandle } from 'vue'
import { compileConnectors } from '@/lib-components/connectors/compiler/evaluator.js'
import { isConnectorSource } from '@/lib-components/connectors/graph.js'
import type {
    ConnectorHit,
    ConnectorParameterValues,
    ConnectorSource,
} from '@/lib-components/connectors/types.js'
import { StageDeclaration } from '@/lib-components/nodes/StageDeclaration.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

type ConnectorEventListener = (hit: ConnectorHit, event: MouseEvent) => void

interface ConnectorGraphHostState {
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
    private events: ConnectorGraphHostEvents = {}

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = shallowReactive({ graph: undefined, parameters: {}, interactive: false })
    }

    override setStateValue(key: string, value: unknown): void {
        const normalized = key.indexOf('-') >= 0
            ? key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
            : key
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

    syncWithThree(): void {
        if (this.stopHandle) return
        this.stopHandle = watchEffect(() => {
            if (this.parent.value === null) return
            const graph = this.state.graph
            const parameters = this.state.parameters
            const interactive = this.state.interactive
            if (!graph) {
                this.stage.connectors.removeOwner(this.ownerId)
                return
            }
            const plan = compileConnectors(graph, parameters)
            this.stage.connectors.reconcile(this.ownerId, plan, {
                interactive,
                dispatch: (type, hit, event) => this.dispatch(type, hit, event),
            }, parameters)
        }, { flush: 'post' })
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

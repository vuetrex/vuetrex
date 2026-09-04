import { reactive, watchEffect, type WatchStopHandle } from 'vue'
import { Node } from '@/lib-components/nodes/Node.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import type {
    BusRouteOptions,
    ConnectorLane,
    ConnectorPort,
    ConnectorPortName,
} from '@/lib-components/three/connectors/types.js'

let busRegistrationSequence = 0

/** Declarative one-to-many connector with one shared trunk. */
export class BusConnectorNode extends Node {
    public readonly type = 'BusConnector'
    public state: {
        from: string
        to: string[]
        text: string
        type: string
        side: ConnectorPortName | undefined
        fromPort: ConnectorPort
        toPort: ConnectorPort
        elevation: number
        lane: ConnectorLane
        avoid: boolean | number
    } = reactive({
        from: '',
        to: [],
        text: '',
        type: 'line',
        side: undefined,
        fromPort: 'auto',
        toPort: 'auto',
        elevation: 0,
        lane: 'auto',
        avoid: true,
    })

    private stopHandle?: WatchStopHandle
    private readonly registrationId = `bus:${++busRegistrationSequence}`

    constructor(stage: VuetrexStage) {
        super(stage)
    }

    isRenderableNode(): boolean { return true }
    participatesInLayout(): boolean { return false }

    syncWithThree(): void {
        if (this.stopHandle) return
        this.stopHandle = watchEffect(() => {
            const { from, to, type, side, fromPort, toPort, elevation, lane, avoid } = this.state
            const options: BusRouteOptions = { side, fromPort, toPort, elevation, lane, avoid }
            if (from && to.length) {
                this.stage.connectBus(from, to, type, this.registrationId, options)
                this.stage.reconcileConnections()
            } else {
                this.stage.unregisterConnection(this.registrationId)
            }
        }, { flush: 'post' })
    }

    override setStateValue(key: string, value: unknown): void {
        const normalized = key.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
        if (normalized === 'to') {
            this.state.to = Array.isArray(value)
                ? value.map(String)
                : String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)
            return
        }
        if (normalized === 'lane') {
            const lane = Number(value)
            this.state.lane = value === 'auto' || value == null || !Number.isFinite(lane) ? 'auto' : lane
            return
        }
        if (normalized === 'avoid') {
            if (typeof value === 'number') this.state.avoid = value
            else this.state.avoid = value !== false && value !== 'false'
            return
        }
        super.setStateValue(key, value)
    }

    onRemoved(): void {
        this.stopHandle?.()
        this.stopHandle = undefined
        this.stage.unregisterConnection(this.registrationId)
    }
}

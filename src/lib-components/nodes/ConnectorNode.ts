import { Node } from '@/lib-components/nodes/Node.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import {watchEffect, WatchStopHandle, reactive} from 'vue'

let connectorRegistrationSequence = 0

export class ConnectorNode extends Node {
    public readonly type: string = 'Connector'

    public state: { from: string, to: string, text: string, type: string, layout: string } = reactive({
        from: '',
        to: '',
        text: '',
        type: 'particles',
        layout: 'orthogonal'
    })

    private stopHandle?: WatchStopHandle
    private readonly registrationId = `connector:${++connectorRegistrationSequence}`

    constructor(stage: VuetrexStage) {
        super(stage)
    }

    isRenderableNode(): boolean {
        return true
    }

    participatesInLayout(): boolean {
        return false
    }

    syncWithThree() {
        if (this.stopHandle) return
        this.stopHandle = watchEffect(() => {
            const { from, to, layout, type } = this.state
            if (from && to) {
                this.stage.connect(from, to, layout, type, this.registrationId)
                this.stage.reconcileConnections()
            } else {
                this.stage.unregisterConnection(this.registrationId)
            }
        }, { flush: 'post' })
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        this.stage.unregisterConnection(this.registrationId)
    }
}

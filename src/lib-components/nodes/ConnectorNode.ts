import { Node } from '@/lib-components/nodes/Node.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'
import {watchEffect, WatchStopHandle, reactive} from 'vue'

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
    private registeredConnection?: string

    constructor(stage: VuetrexStage) {
        super(stage)
    }

    isRenderableNode(): boolean {
        return true
    }

    syncWithThree() {
        if (this.stopHandle) return
        this.stopHandle = watchEffect(() => {
            const { from, to, layout, type } = this.state
            if (from && to) {
                const key = `${from}->${to}:${layout}:${type}`
                if (key !== this.registeredConnection) {
                    this.stage.connect(from, to, layout, type)
                    this.registeredConnection = key
                }
                this.stage.reconcileConnections()
            } else {
                this.registeredConnection = undefined
            }
        }, { flush: 'post' })
    }

    onRemoved() {
        if (this.stopHandle) {
            this.stopHandle()
            this.stopHandle = undefined
        }
        const { from, to } = this.state
        this.registeredConnection = undefined

        if (from && to) {
            this.stage.disconnect(this.stage.getById(from), this.stage.getById(to));
        }
    }
}

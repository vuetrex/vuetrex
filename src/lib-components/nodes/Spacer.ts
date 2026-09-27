import { watchSceneEffect } from '../diagnostics/sceneErrors.js'
import { reactive, watchEffect, type WatchStopHandle } from 'vue'
import { Group, Vector3 } from 'three'
import { Node } from '@/lib-components/nodes/Node.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

interface SpacerState {
    text: string
    width: number
    height: number
    depth: number
}

/** A non-visual node that reserves an explicit measured slot in its parent layout. */
export class Spacer extends Node {
    public readonly type = 'Spacer'
    declare protected state: SpacerState
    private readonly anchor = new Group()
    private stopHandle?: WatchStopHandle

    constructor(stage: VuetrexStage) {
        super(stage)
        this.state = reactive({ text: '', width: 1, height: 0, depth: 1 })
        this.element.mesh = this.anchor as any
    }

    protected override intrinsicSize(): Vector3 {
        return new Vector3(this.state.width, this.state.height, this.state.depth)
    }

    override setStateValue(key: string, value: unknown): void {
        if (key === 'size') {
            if (value instanceof Vector3) {
                this.state.width = value.x
                this.state.height = value.y
                this.state.depth = value.z
                return
            }
            if (value && typeof value === 'object') {
                const size = value as { x?: number, y?: number, z?: number }
                if (typeof size.x === 'number') this.state.width = size.x
                if (typeof size.y === 'number') this.state.height = size.y
                if (typeof size.z === 'number') this.state.depth = size.z
                return
            }
            const size = Number(value)
            if (Number.isFinite(size)) {
                this.state.width = size
                this.state.depth = size
            }
            return
        }
        super.setStateValue(key, value)
    }

    syncWithThree(): void {
        if (this.stopHandle) return
        this.stopHandle = watchSceneEffect(this, () => {
            const parent = this.nearestAncestorObject()
            if (this.anchor.parent !== parent) parent.add(this.anchor)
            this.anchor.name = `el-${this.id}`
            this.anchor.userData.el = this.element
            this.anchor.position.copy(this.element.getPosition())
            this.applyObjectState(this.anchor)
            this.stage.invalidateContentBounds?.()
        })
    }

    override onRemoved(): void {
        this.stopHandle?.()
        this.stopHandle = undefined
        this.anchor.removeFromParent()
        this.stage.invalidateContentBounds?.()
    }
}

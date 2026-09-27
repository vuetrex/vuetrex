import { sceneElements } from './elements.config.js'
import { MeshNode, type MeshNodeStage } from '@exceeder/vuetrex'
import { BoxGeometry, Mesh } from 'three'

/** A consumer-owned fixed shape using only supported package imports. */
export class CustomBrick extends MeshNode {
    protected override readonly supportsDepth = true
    constructor(stage: MeshNodeStage) { super(stage) }

    modelGen() {
        const depth = this.state.depth
        return (height: number, size: number) => {
            const scale = this.getScale()
            return new Mesh(new BoxGeometry(size * scale, height, (depth || size) * scale), this.material)
        }
    }
}

export const elements = sceneElements.defineElements({ 'vx-custom-brick': CustomBrick })

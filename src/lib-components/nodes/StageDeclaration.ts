import { reactive } from 'vue'
import { Base } from '@/lib-components/nodes/Base.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

/** Renderer-host lifecycle anchor for stage-owned declarations without spatial identity. */
export abstract class StageDeclaration extends Base {
    public readonly stage: VuetrexStage
    protected state: any = reactive({})

    protected constructor(stage: VuetrexStage) {
        super()
        this.stage = stage
    }

    override isRenderableNode(): boolean { return false }
    override participatesInLayout(): boolean { return false }
}

(StageDeclaration.prototype as any).__v_skip = true

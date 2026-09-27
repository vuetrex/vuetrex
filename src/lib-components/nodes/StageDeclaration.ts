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

    /** Normalize before subclass validation, including calls made outside patchProp. */
    override setStateValue(key: string, value: unknown): void {
        this.setDeclarationProp(key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value)
    }

    protected setDeclarationProp(key: string, _value: unknown): void {
        throw new Error(`Unknown ${this.constructor.name} property: ${key}`)
    }

    protected numberProp(key: string, value: unknown): number {
        if ((typeof value !== 'number' && typeof value !== 'string')
            || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) {
            throw new TypeError(`${this.constructor.name}.${key} must be finite numeric data`)
        }
        return Number(value)
    }

    protected booleanProp(key: string, value: unknown): boolean {
        if (value === true || value === '' || value === 'true') return true
        if (value === false || value === 'false') return false
        throw new TypeError(`${this.constructor.name}.${key} must be a boolean`)
    }

    override isRenderableNode(): boolean { return false }
    override participatesInLayout(): boolean { return false }
}

(StageDeclaration.prototype as any).__v_skip = true

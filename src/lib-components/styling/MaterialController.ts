import gsap from 'gsap'
import type { MeshStandardMaterial, Object3D } from 'three'
import { Vector3 } from 'three'
import { applyResolvedMaterial, materialNumberFields, readMaterial } from '../nodes/material.js'
import { resolveMaterial } from './resolveMaterial.js'
import type { VxHoverProps, VxMaterialProps, VxResolvedMaterial } from './types.js'

/**
 * Takes exclusive ownership of one freshly created material, never of its textures.
 * Resolution is independent of Vue, scene graphs, and style lookup; callers supply ordered layers.
 */
export class MaterialController {
    private readonly defaults: VxMaterialProps
    private base: VxResolvedMaterial
    private active: VxResolvedMaterial
    private hover?: VxHoverProps
    private hovered = false
    private scaleControlled = false
    private disposed = false
    private target?: Object3D
    private readonly baseScale = new Vector3(1, 1, 1)
    private tweens: gsap.core.Tween[] = []

    constructor(readonly material: MeshStandardMaterial, defaults = readMaterial(material)) {
        this.defaults = { ...defaults }
        // Stage-created opaque materials supply appearance defaults, not an explicit alpha policy.
        if (this.defaults.alphaMode === 'opaque' && !this.defaults.alphaTest) this.defaults.alphaMode = undefined
        this.base = this.active = resolveMaterial(this.defaults)
    }

    /** Re-resolve from defaults on every update, including removal and updates during a transition. */
    update(layers: readonly (VxMaterialProps | undefined)[], hover?: VxHoverProps): void {
        if (this.disposed) return
        this.hover = hover ? { ...hover } : undefined
        this.base = resolveMaterial(this.defaults, ...layers)
        this.active = resolveMaterial(this.defaults, ...layers, hover)
        this.apply(0)
    }

    /** Bind the current geometry's transform; replacement cancels tweens on the detached object. */
    setTarget(target?: Object3D): void {
        if (this.disposed || this.target === target) return
        this.cancel()
        if (this.target && this.scaleControlled) this.target.scale.copy(this.baseScale)
        this.scaleControlled = false
        this.target = target
        if (target) this.baseScale.copy(target.scale)
        this.apply(0)
    }

    setHovered(hovered: boolean): void {
        if (this.disposed || this.hovered === hovered) return
        this.hovered = hovered
        this.apply(this.hover ? this.hover.transition ?? 0.18 : 0)
    }

    private cancel(): void {
        this.tweens.forEach(tween => tween.kill())
        this.tweens = []
    }

    private apply(duration: number): void {
        this.cancel()
        const next = this.hovered ? this.active : this.base
        const scale = this.hovered ? this.hover?.scale ?? 1 : 1
        const applyScale = this.target && (this.scaleControlled || (this.hovered && this.hover?.scale !== undefined))
        if (applyScale && !this.scaleControlled) this.baseScale.copy(this.target!.scale)
        if (duration <= 0) {
            applyResolvedMaterial(this.material, next)
            if (applyScale) this.target!.scale.copy(this.baseScale).multiplyScalar(scale)
            this.scaleControlled = !!applyScale && scale !== 1
            return
        }

        const previous = resolveMaterial(readMaterial(this.material))
        // Discrete state changes happen immediately, except blending stays enabled until a fade out finishes.
        const blending = next.alphaMode === 'blend'
            || (previous.alphaMode === 'blend' && previous.opacity !== next.opacity)
        applyResolvedMaterial(this.material, {
            ...next,
            ...Object.fromEntries(materialNumberFields.map(key => [key, previous[key]])),
            color: previous.color, emissive: previous.emissive,
            alphaMode: blending ? 'blend' : next.alphaMode,
        })
        const numbers = Object.fromEntries(materialNumberFields.map(key => [key, next[key]]))
        this.tweens.push(gsap.to(this.material, {
            ...numbers, duration,
            onComplete: () => applyResolvedMaterial(this.material, next),
        }))
        for (const key of ['color', 'emissive'] as const) {
            const [r, g, b] = next[key]
            this.tweens.push(gsap.to(this.material[key], { r, g, b, duration }))
        }
        if (applyScale) {
            this.scaleControlled = true
            this.tweens.push(gsap.to(this.target!.scale, {
                x: this.baseScale.x * scale, y: this.baseScale.y * scale, z: this.baseScale.z * scale,
                duration, ease: this.hovered ? 'sine.out' : 'sine.inOut',
                onComplete: () => { this.scaleControlled = scale !== 1 },
            }))
        }
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.cancel()
        this.target = undefined
        this.material.dispose()
    }
}

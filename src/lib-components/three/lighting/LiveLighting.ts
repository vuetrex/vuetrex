import * as THREE from 'three'

export type VxShadowQuality = 'off' | 'low' | 'medium' | 'high'
export interface VxLightingProps {
    keyIntensity?: number
    fillIntensity?: number
    shadowQuality?: VxShadowQuality
}
export const lightingDefaults: Required<VxLightingProps> = {
    keyIntensity: 5.5, fillIntensity: 2, shadowQuality: 'medium',
}
const budgets = { off: [512, 16], low: [256, 8], medium: [512, 16], high: [1024, 32] } as const

/** Owns only the stage's live directional rig and its shadow targets. */
export class LiveLighting {
    readonly key: THREE.DirectionalLight
    readonly fill: THREE.DirectionalLight
    private style = { ...lightingDefaults }
    private disposed = false

    constructor(scene: THREE.Scene, colors: { lightColor1?: number; lightColor2?: number },
        private readonly shadows: boolean, private readonly maxTextureSize: number) {
        this.fill = new THREE.DirectionalLight(colors.lightColor1 ?? 0xccffff, 2)
        this.fill.position.set(20, 3, -25)
        this.fill.target.position.set(-5, -0.5, 0)
        this.key = new THREE.DirectionalLight(colors.lightColor2 ?? 0xffffff, 5.5)
        this.key.position.set(-7, 25, 13)
        this.key.shadow.camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.5, 55)
        this.key.shadow.radius = 7
        this.key.shadow.bias = -0.004
        this.key.shadow.normalBias = 0
        scene.add(this.fill, this.key)
        this.apply(lightingDefaults)
    }

    capture(): Required<VxLightingProps> {
        return { keyIntensity: this.key.intensity, fillIntensity: this.fill.intensity, shadowQuality: this.style.shadowQuality }
    }

    apply(props: VxLightingProps): void {
        const style = { ...lightingDefaults, ...props }
        for (const name of ['keyIntensity', 'fillIntensity'] as const) {
            if (!Number.isFinite(style[name]) || style[name] < 0) throw new RangeError(`vx-lighting.${name} must be finite and nonnegative`)
        }
        if (!Object.hasOwn(budgets, style.shadowQuality)) throw new TypeError('vx-lighting.shadowQuality must be off, low, medium, or high')
        if (this.disposed) return
        const [resolution, samples] = budgets[style.shadowQuality]
        const size = Math.min(resolution, this.maxTextureSize)
        const shadow = this.key.shadow
        const enabled = this.shadows && style.shadowQuality !== 'off'
        if (!enabled || shadow.mapSize.x !== size || shadow.mapSize.y !== size) this.disposeTargets()
        shadow.mapSize.set(size, size)
        shadow.blurSamples = samples
        shadow.needsUpdate = true
        this.key.castShadow = enabled
        this.key.intensity = style.keyIntensity
        this.fill.intensity = style.fillIntensity
        this.style = style
    }

    private disposeTargets(): void {
        const shadow = this.key.shadow
        shadow.map?.dispose()
        shadow.mapPass?.dispose()
        shadow.map = null
        shadow.mapPass = null
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.disposeTargets()
        this.key.removeFromParent()
        this.fill.removeFromParent()
    }
}

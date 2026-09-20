import { CanvasTexture, NoColorSpace, SRGBColorSpace } from 'three'
import { onMounted, onUnmounted, shallowReadonly, shallowRef, watchEffect, type WatchStopHandle } from 'vue'

export type VxTexturePurpose = 'color' | 'emissive' | 'roughness' | 'metalness' | 'normal' | 'bump' | 'alpha'
export interface VxCanvasTextureOptions { width?: number; height?: number; purpose: VxTexturePurpose }

/** Create in component setup. Paint reads are reactive; redraws preserve texture identity. */
export function useCanvasTexture(paint: (context: CanvasRenderingContext2D) => void, options: VxCanvasTextureOptions) {
    const texture = shallowRef<CanvasTexture | null>(null)
    let stop: WatchStopHandle | undefined
    onMounted(() => {
        const width = options.width ?? 256, height = options.height ?? 256
        if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)) {
            throw new RangeError('Canvas texture dimensions must be integers between 1 and 8192.')
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas textures require a 2D canvas context.')
        const created = new CanvasTexture(canvas)
        created.colorSpace = options.purpose === 'color' || options.purpose === 'emissive' ? SRGBColorSpace : NoColorSpace
        texture.value = created
        stop = watchEffect(() => {
            context.save()
            try {
                context.resetTransform()
                context.clearRect(0, 0, width, height)
                paint(context)
                created.needsUpdate = true
            } finally { context.restore() }
        })
    })
    // Dispose after child consumers have unmounted, not before their final render.
    onUnmounted(() => { stop?.(); texture.value?.dispose(); texture.value = null })
    return shallowReadonly(texture)
}

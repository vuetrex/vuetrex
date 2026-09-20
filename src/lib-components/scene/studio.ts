import { DataTexture, EquirectangularReflectionMapping, FloatType, LinearFilter, RGBAFormat } from 'three'

/** Deterministic linear HDR softboxes. The caller owns the returned texture. */
export function createStudioEnvironment(): DataTexture {
    const width = 256, height = 256
    const pixels = new Float32Array(width * height * 4)
    const softbox = (u: number, v: number, x: number, y: number, w: number, h: number) => {
        const dx = Math.min(Math.abs(u - x), 1 - Math.abs(u - x)) / w
        const dy = Math.abs(v - y) / h
        const edge = Math.max(0, Math.min(1, (1 - Math.max(dx, dy)) * 8))
        return edge * edge * (3 - 2 * edge)
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const u = x / width, v = y / height, i = (y * width + x) * 4
        const fill = 0.1 + 0.18 * Math.sin(v * Math.PI)
        const key = softbox(u, v, 0.2, 0.72, 0.13, 0.12) * 4
        const strip = softbox(u, v, 0.68, 0.58, 0.035, 0.24) * 2.5
        const ceiling = softbox(u, v, 0.45, 0.9, 0.22, 0.07) * 2
        pixels[i] = fill + key + strip * 0.82 + ceiling
        pixels[i + 1] = fill + key * 0.95 + strip * 0.92 + ceiling
        pixels[i + 2] = fill + key * 0.88 + strip + ceiling
        pixels[i + 3] = 1
    }
    const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType)
    texture.mapping = EquirectangularReflectionMapping
    texture.minFilter = texture.magFilter = LinearFilter
    texture.needsUpdate = true
    return texture
}

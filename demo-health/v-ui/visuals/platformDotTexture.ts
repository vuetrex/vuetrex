import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from 'three'
import { PLATFORM_RADIUS } from '../sceneGeometry.js'
import type { ThemeMode } from '../types.js'

const TEXTURE_SIZE = 1024
const DOT_SPACING = 38

/** A quiet, illustration-scale dot matrix for the platform's top UVs. */
export function createPlatformDotTexture(
  theme: ThemeMode,
  maxAnisotropy = 1,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const context = canvas.getContext('2d')!
  const center = TEXTURE_SIZE / 2
  const rows = Math.ceil(TEXTURE_SIZE / DOT_SPACING)

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  context.fillStyle = theme === 'light' ? '#356f88' : '#071b22'

  for (let row = -1; row <= rows; row++) {
    const y = row * DOT_SPACING + DOT_SPACING / 2
    const offset = Math.abs(row) % 2 === 1 ? DOT_SPACING / 2 : 0
    for (let column = -1; column <= rows; column++) {
      const x = column * DOT_SPACING + DOT_SPACING / 2 + offset
      const radial = Math.hypot(x - center, y - center) / center
      if (radial > 0.94) continue

      const edgeFade = smoothstep(0.94, 0.82, radial)
      const centerCalm = 0.56 + 0.44 * smoothstep(0.16, 0.66, radial)
      const isNode = positiveModulo(column * 3 + row * 5, 17) === 0
      const opacity = (theme === 'light' ? 0.30 : 0.46)
        * edgeFade
        * centerCalm
        * (isNode ? 1.5 : 1)

      context.globalAlpha = Math.min(opacity, 0.5)
      context.beginPath()
      context.arc(x, y, isNode ? 4.8 : 3.2, 0, Math.PI * 2)
      context.fill()

      if (isNode) {
        context.globalAlpha = Math.min(opacity * 0.38, 0.18)
        context.lineWidth = 1.25
        context.beginPath()
        context.arc(x, y, 8, 0, Math.PI * 2)
        context.strokeStyle = context.fillStyle
        context.stroke()
      }
    }
  }
  context.globalAlpha = 1

  const texture = new CanvasTexture(canvas)
  texture.name = `health-platform-dots-${theme}`
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  // ExtrudeGeometry's top UVs are expressed in local world units.
  const uvScale = 1 / (PLATFORM_RADIUS * 2)
  texture.repeat.set(uvScale, uvScale)
  texture.offset.set(0.5, 0.5)
  texture.anisotropy = Math.min(8, Math.max(1, maxAnisotropy))
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return progress * progress * (3 - 2 * progress)
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

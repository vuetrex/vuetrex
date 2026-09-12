import { defineGeometry, geo, type GeometrySource } from '@/lib-components/index.js'

export interface QuadsParameters {
    size: number
    shrink?: number
    spacing?: number
}

const LEVELS = 5

// Local -Y is attached to the parent; the other five cube faces grow outward.
const FACE_DIRECTIONS = [
    [0, 1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
] as const

function quad(size: number, levels: number, shrink: number, spacing: number): GeometrySource {
    const cube = geo.box({ width: size, height: size, depth: size }).material('cube');
    if (levels === 1) return cube

    const childSize = size * shrink
    const pipeLength = size * spacing
    const pipe = geo.line({
            length: pipeLength,
            thickness: size * 0.055,
            radialSegments: 6,
        })
        .transform({ translate: [0, size / 2, 0] })
        .material('pipe')

    // Build once along +Y, then rotate the whole pipe-and-child arm onto each face.
    const child = quad(childSize, levels - 1, shrink, spacing)
        .transform({translate: [0, size / 2 + pipeLength + childSize / 2, 0]})

    const arm = geo.join([pipe, child])

    return geo.join([
        cube,
        geo.distribute(arm, FACE_DIRECTIONS.map((direction, index) => ({
            key: `face-${index}`,
            position: [0, 0, 0] as const,
            direction,
        }))),
    ]);
}

export const quads = defineGeometry<QuadsParameters>('quads',
        parameters => quad(
            parameters.size,
            LEVELS,
            parameters.shrink ?? 0.32,
            parameters.spacing ?? 0.25)
        .transform({translate: [0, parameters.size, 0]})
)

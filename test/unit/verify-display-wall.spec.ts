import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
    createDisplayWallGeometry,
    DisplayWall,
    type VxDisplaySurface,
} from '@/lib-components/nodes/DisplayWall.js'
import { types } from '@/lib-components/nodes/types.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function makeStage(): VuetrexStage {
    const scene = new THREE.Scene()
    return {
        getScene: () => scene,
        connectors: {
            update: () => {},
            remove: () => [],
        },
        invalidateContentBounds: () => {},
    } as unknown as VuetrexStage
}

function mockCanvasContext() {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: '',
    } as unknown as CanvasRenderingContext2D
}

afterEach(() => vi.restoreAllMocks())

describe('DisplayWall', () => {
    it('is registered as a built-in display surface', () => {
        expect(types['vx-display-wall']).toBe(DisplayWall)
    })

    it('uses twice the original curved-wall tessellation by default', () => {
        const geometry = createDisplayWallGeometry(7, 4.8, Math.PI * 0.6)

        expect(geometry.parameters.radialSegments).toBe(128)
        expect(geometry.getAttribute('position').count).toBeGreaterThan(64 * 2)
    })

    it('reactively realizes one canvas or a set of independent canvases', async () => {
        const context = mockCanvasContext()
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
        const wall = new DisplayWall(makeStage())
        const painted: string[] = []
        const surface = (id: string): VxDisplaySurface => ({
            id,
            paint: () => painted.push(id),
        })

        wall.setStateValue('surface', surface('overview'))
        wall.syncWithThree()
        await nextTick()

        let screens = (wall.element.mesh as THREE.Group).getObjectsByProperty('type', 'Mesh')
            .filter(object => object.name.includes('-display-'))
        expect(screens).toHaveLength(1)
        expect(painted).toContain('overview')

        wall.setStateValue('mode', 'displays')
        wall.setStateValue('surfaces', [surface('traffic'), surface('latency'), surface('readiness')])
        await nextTick()

        screens = (wall.element.mesh as THREE.Group).getObjectsByProperty('type', 'Mesh')
            .filter(object => object.name.includes('-display-'))
        expect(screens).toHaveLength(3)
        expect(painted).toEqual(expect.arrayContaining(['traffic', 'latency', 'readiness']))
        wall.onRemoved()
    })
})

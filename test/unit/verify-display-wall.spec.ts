import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
    createDisplayWallEndCaps,
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

    it('creates UV-mapped side caps for both open ends of a curved wall', () => {
        const geometry = createDisplayWallEndCaps(7, 7.2, 4, Math.PI * 0.6)
        geometry.computeBoundingBox()

        expect(geometry.getAttribute('position').count).toBe(8)
        expect(geometry.getAttribute('normal').count).toBe(8)
        expect(geometry.getAttribute('uv').count).toBe(8)
        expect(geometry.index?.count).toBe(12)
        expect(geometry.boundingBox?.min.y).toBeCloseTo(-2)
        expect(geometry.boundingBox?.max.y).toBeCloseTo(2)
    })

    it('reactively paints one canvas-backed surface', async () => {
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

        const screens = (wall.element.mesh as THREE.Group).getObjectsByProperty('type', 'Mesh')
            .filter(object => object.name.endsWith('-screen'))
        expect(screens).toHaveLength(1)
        expect(painted).toContain('overview')

        wall.setStateValue('surface', surface('traffic'))
        await nextTick()

        expect(screens).toHaveLength(1)
        expect(painted).toContain('traffic')
        wall.onRemoved()
    })

    it('updates screen radiance and bloom metadata without rebuilding or owning the mask', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext())
        const wall = new DisplayWall(makeStage())
        wall.syncWithThree()
        await nextTick()
        const screen = (wall.element.mesh as THREE.Group).children.find(object => object.name.endsWith('-screen')) as THREE.Mesh
        const geometry = screen.geometry
        expect(screen.userData.vxBloomEffects).toEqual({ bloom: 'exclude', bloomGain: 1 })

        const mask = new THREE.Texture(), dispose = vi.spyOn(mask, 'dispose')
        wall.setStateValue('screen-style', { brightness: 2, effects: { bloom: 'include', bloomGain: 0.08 }, bloomMask: mask })
        await nextTick()
        expect(screen.geometry).toBe(geometry)
        expect((screen.material as THREE.MeshBasicMaterial).color.r).toBe(2)
        expect(screen.userData.vxBloomEffects).toEqual({ bloom: 'include', bloomGain: 0.08 })
        expect(screen.userData.vxScreenStyle.bloomMask).toBe(mask)

        wall.onRemoved()
        expect(dispose).not.toHaveBeenCalled()
    })

    it('dispatches picked screen clicks through the logical display node', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext())
        const wall = new DisplayWall(makeStage())
        const onClick = vi.fn()
        wall.onClick = onClick
        wall.syncWithThree()
        await nextTick()

        const root = wall.element.mesh as THREE.Group
        const screen = root.children.find(object => object.name.endsWith('-screen')) as THREE.Mesh
        expect(screen.userData.el).toBe(wall.element)
        expect(root.children.every(object => object.userData.el === wall.element)).toBe(true)

        root.dispatchEvent({ type: 'click', originalEvent: new MouseEvent('click') })

        expect(onClick).toHaveBeenCalledOnce()
        wall.onRemoved()
    })
})

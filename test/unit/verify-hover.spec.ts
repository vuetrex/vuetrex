/**
 * Spec: MeshNode hover animation — correct restore targets.
 *
 * The bug: hoverSnapshot was taken from the live (GSAP-animated) material at
 * pointer-enter time.  Rapid in/out caused restoreHover to target a partially-
 * animated intermediate, not the design-time value.
 *
 * The fix: baseProps captures the intended material state from state.material,
 * not from the live Three.js material.  restoreHover reads from baseProps.
 * Both enter and leave also kill in-flight tweens before starting new ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { Box } from '@/lib-components/nodes/shapes/Box.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'
import { flushPromises } from '@vue/test-utils'

// ── GSAP mock ─────────────────────────────────────────────────────────────────

type TweenCall = { target: object; vars: Record<string, unknown> }
const tweenCalls: TweenCall[] = []
const killCalls: object[] = []

vi.mock('gsap', () => ({
    default: {
        to: (target: object, vars: Record<string, unknown>) => tweenCalls.push({ target, vars }),
        killTweensOf: (target: object) => killCalls.push(target),
    },
}))

// ── Mock stage ─────────────────────────────────────────────────────────────────

function makeMockStage() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.1 })
    const mesh = new THREE.Mesh()
    const scene = new THREE.Scene()

    const stage = {
        boxRadius: 1.3,
        boxDistance: 1.5,
        createElementMaterial: () => mat,
        renderMesh: vi.fn(),
        removeObject: vi.fn(),
        getScene: vi.fn(() => scene),
        getById: vi.fn(),
        connect: vi.fn(),
        reconcileConnections: vi.fn(),
        connectors: {
            update: vi.fn(),
            remove: vi.fn(() => []),
        },
    } as unknown as VuetrexStage

    return { stage, mat, mesh }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a Box, inject a mock mesh so hover dispatch works without renderMesh. */
function makeBox(stage: VuetrexStage, mesh: THREE.Mesh) {
    const box = new Box(stage)
    ;(box as any).element.mesh = mesh
    box.syncWithThree()
    return box
}

/** Find the last gsap.to call whose target is `obj` and vars include `key`. */
function lastTweenFor(obj: object, key: string): TweenCall | undefined {
    return [...tweenCalls].reverse().find(c => c.target === obj && key in c.vars)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MeshNode hover: restoreHover targets design-time values', () => {

    beforeEach(() => {
        tweenCalls.length = 0
        killCalls.length = 0
    })

    it('restores to state.material color even when material is mid-animation', async () => {
        const { stage, mat, mesh } = makeMockStage()
        const box = makeBox(stage, mesh)

        // Set design-time color to red via reactive prop
        ;(box as any).state.material = { color: 0xff0000 }
        await flushPromises()

        // Simulate GSAP having partially animated the material (mid-tween state)
        mat.color.setRGB(0.5, 0, 0.5);

        // Hover in then immediately out
        (box as any).state.hover = { color: 0x0000ff, transition: 0 }
        box.dispatchPointerenter(new MouseEvent('mouseenter'))
        box.dispatchPointerleave(new MouseEvent('mouseleave'))

        // Restore tween must target original red (1, 0, 0), not the mid-animation (0.5, 0, 0.5)
        const restore = lastTweenFor(mat.color, 'r')
        expect(restore?.vars.r).toBeCloseTo(1, 5)
        expect(restore?.vars.g).toBeCloseTo(0, 5)
        expect(restore?.vars.b).toBeCloseTo(0, 5)
    })

    it('restores to updated state.material when prop changes while hovering', async () => {
        const { stage, mat, mesh } = makeMockStage()
        const box = makeBox(stage, mesh)

        // First design-time color: green
        ;(box as any).state.material = { color: 0x00ff00 }
        await flushPromises()

        // Prop changes to blue before hovering
        ;(box as any).state.material = { color: 0x0000ff }
        await flushPromises()

        // Simulate mid-animation on the live material
        mat.color.setRGB(0, 0.5, 0)

        ;(box as any).state.hover = { color: 0xffffff, transition: 0 }
        box.dispatchPointerenter(new MouseEvent('mouseenter'))
        box.dispatchPointerleave(new MouseEvent('mouseleave'))

        // Should restore to blue (last design-time value), not mid-animation green
        const restore = lastTweenFor(mat.color, 'r')
        expect(restore?.vars.r).toBeCloseTo(0, 5)
        expect(restore?.vars.g).toBeCloseTo(0, 5)
        expect(restore?.vars.b).toBeCloseTo(1, 5)
    })

    it('restores scale to 1 regardless of mid-animation scale value', () => {
        const { stage, mat, mesh } = makeMockStage()
        const box = makeBox(stage, mesh)

        // Simulate mid-animation scale
        mesh.scale.set(1.1, 1.1, 1.1)

        ;(box as any).state.hover = { scale: 1.3, transition: 0 }
        box.dispatchPointerenter(new MouseEvent('mouseenter'))
        box.dispatchPointerleave(new MouseEvent('mouseleave'))

        const restore = lastTweenFor(mesh.scale, 'x')
        expect(restore?.vars.x).toBe(1)
        expect(restore?.vars.y).toBe(1)
        expect(restore?.vars.z).toBe(1)
    })

    it('kills in-flight tweens on both hover enter and hover leave', () => {
        const { stage, mat, mesh } = makeMockStage()
        const box = makeBox(stage, mesh)

        ;(box as any).state.hover = { color: 0x0000ff, scale: 1.2, transition: 0 }

        box.dispatchPointerenter(new MouseEvent('mouseenter'))
        expect(killCalls).toContain(mat.color)
        expect(killCalls).toContain(mat)
        expect(killCalls).toContain(mesh.scale)

        killCalls.length = 0

        box.dispatchPointerleave(new MouseEvent('mouseleave'))
        expect(killCalls).toContain(mat.color)
        expect(killCalls).toContain(mat)
        expect(killCalls).toContain(mesh.scale)
    })

    it('baseProps seeds from material creation defaults when no state.material is set', () => {
        const { stage, mat, mesh } = makeMockStage()
        // mat has roughness 0.3, metalness 0.1 from makeMockStage()
        const box = makeBox(stage, mesh)

        // Simulate GSAP having tweened roughness mid-animation
        mat.roughness = 0.7

        ;(box as any).state.hover = { roughness: 0.9, transition: 0 }
        box.dispatchPointerenter(new MouseEvent('mouseenter'))
        box.dispatchPointerleave(new MouseEvent('mouseleave'))

        // Should restore to creation-default roughness (0.3), not mid-animation (0.7)
        const restore = lastTweenFor(mat, 'roughness')
        expect(restore?.vars.roughness).toBeCloseTo(0.3, 5)
    })
})

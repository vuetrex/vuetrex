import * as THREE from 'three'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { ParticleNode } from '@/lib-components/particles/ParticleNode.js'
import { particles } from '@/lib-components/particles/index.js'
import { GroupNode } from '@/lib-components/nodes/GroupNode.js'
import { types } from '@/lib-components/nodes/types.js'
import type { VuetrexStage } from '@/lib-components/three/stage.js'

function fixture() {
    const scene = new THREE.Scene()
    let animation: ((timer: number, tick: number) => void) | undefined
    const removeAnimation = vi.fn()
    const stage = {
        boxRadius: 1,
        boxDistance: 1,
        gap: 1,
        getScene: () => scene,
        getById: () => undefined,
        onEachFrame: vi.fn((callback) => {
            animation = callback
            return removeAnimation
        }),
        connectors: { update: vi.fn(), remove: vi.fn(() => []) },
        reconcileConnections: vi.fn(),
        invalidateContentBounds: vi.fn(),
    } as unknown as VuetrexStage
    const parent = new GroupNode(stage)
    scene.add(parent.group)
    const node = new ParticleNode(stage)
    parent.appendChild(node)
    return { node, parent, stage, animation: () => animation, removeAnimation }
}

async function flush() {
    await nextTick()
    await nextTick()
}

function pointObject(node: ParticleNode): THREE.Points {
    let result: THREE.Points | undefined
    node.group.traverse(object => {
        if ((object as THREE.Points).isPoints) result = object as THREE.Points
    })
    if (!result) throw new Error('Expected a particle Points object.')
    return result
}

describe('ParticleNode', () => {
    it('is registered as one procedural renderer element', () => {
        expect(types['vx-particles']).toBe(ParticleNode)
        expect(types['vx-particle-motion']).toBeUndefined()
    })

    it('renders soft path particles and advances them on the stage clock', async () => {
        const { node, animation } = fixture()
        node.setStateValue('graph', particles.path([[0, 0, 0], [4, 0, 0]], {
            count: 4,
        }).motion({ speed: 1 }))
        node.syncWithThree()
        await flush()

        const points = pointObject(node)
        expect(points.geometry.attributes.position.count).toBe(4)
        expect(points.material).toBeInstanceOf(THREE.ShaderMaterial)
        expect(points.name.startsWith('el-')).toBe(false)
        node.setStateValue('interactive', true)
        await flush()
        expect(points.name.startsWith('el-')).toBe(true)
        expect(node.instanceHitAt(0, points)?.id).toContain(':0')
        const before = [...points.geometry.attributes.position.array]
        animation()?.(1000, 1)
        animation()?.(2000, 2)
        const after = [...points.geometry.attributes.position.array]

        expect(after).not.toEqual(before)
        expect(node.particlesDiagnostics()?.particleCount).toBe(4)
        expect(node.measuredSize.value.x).toBeGreaterThan(2)
    })

    it('derives a cloud radius and center from a named object', async () => {
        const { node, stage } = fixture()
        const target = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2))
        target.position.set(3, 1, 0)
        stage.getScene().add(target)
        ;(stage as any).getById = () => ({ mesh: target })
        node.setStateValue('graph', particles.cloud('pod-a', {
            count: 256,
            radius: 'bounds',
        }))
        node.syncWithThree()
        await flush()

        const bounds = node.localBounds()
        expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(3, 0)
        expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(4)
    })

    it('integrates basic CPU forces', async () => {
        const { node, animation } = fixture()
        node.setStateValue('graph', particles.cloud([0, 0, 0], {
            count: 1,
            radius: 0,
        }).simulate({
            maxDelta: 1,
            forces: [{ type: 'gravity', acceleration: [0, -1, 0] }],
        }))
        node.syncWithThree()
        await flush()
        const points = pointObject(node)
        animation()?.(1000, 1)
        animation()?.(2000, 2)

        expect(points.geometry.attributes.position.getY(0)).toBeLessThan(-0.9)
    })

    it('disposes buffers and unregisters its animation when removed', async () => {
        const { node, parent, removeAnimation } = fixture()
        node.setStateValue('graph', particles.cloud([0, 0, 0], { count: 8 }))
        node.syncWithThree()
        await flush()
        const points = pointObject(node)
        const disposeGeometry = vi.fn()
        const disposeMaterial = vi.fn()
        points.geometry.addEventListener('dispose', disposeGeometry)
        points.material.addEventListener('dispose', disposeMaterial)

        parent.removeChild(node)

        expect(disposeGeometry).toHaveBeenCalledOnce()
        expect(disposeMaterial).toHaveBeenCalledOnce()
        expect(removeAnimation).toHaveBeenCalledOnce()
        expect(node.group.parent).toBeNull()
    })
})

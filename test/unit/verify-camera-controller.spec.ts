import { describe, expect, it, vi } from 'vitest'
import { VxCameraController, type VxCameraOrbit } from '@/lib-components/three/cameraController.js'
import { VuetrexStage } from '@/lib-components/three/stage.js'

function fixture() {
    let now = 0
    let pose: VxCameraOrbit = { target: [0, 0, 0], height: 9, radius: 24, azimuth: -30 }
    let reducedMotion = false
    const callbacks = new Set<(time: number) => void>()
    const unsubscribe = vi.fn()
    const camera = new VxCameraController({
        now: () => now,
        read: () => ({ ...pose, target: [...pose.target] }),
        apply: value => { pose = { target: [...value.target], height: value.height, radius: value.radius, azimuth: value.azimuth } },
        onFrame: fn => { callbacks.add(fn); return () => { unsubscribe(); callbacks.delete(fn) } },
        prefersReducedMotion: () => reducedMotion,
    })
    return { camera, callbacks, unsubscribe, pose: () => pose,
        setPose: (value: VxCameraOrbit) => { pose = { ...value, target: [...value.target] } },
        setReducedMotion: (value: boolean) => { reducedMotion = value },
        tick: (milliseconds: number) => { now += milliseconds; callbacks.forEach(fn => fn(now)) },
        advance: (milliseconds: number) => {
            for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
                const step = Math.min(100, milliseconds - elapsed)
                now += step; callbacks.forEach(fn => fn(now))
            }
        } }
}

describe('camera controller', () => {
    it('keeps the initial pose and sweeps one degree per second with yoyo', () => {
        const f = fixture()
        f.camera.orbit(f.pose()).timeline({ repeat: -1, yoyo: true })
            .to({ azimuth: 30 }, { duration: 60, ease: 'none' })
        expect(f.pose().azimuth).toBe(-30)
        f.tick(1000); expect(f.pose().azimuth).toBeCloseTo(-29)
        f.tick(59000); expect(f.pose().azimuth).toBeCloseTo(30)
        f.tick(1000); expect(f.pose().azimuth).toBeCloseTo(29)
        expect(f.pose().height).toBe(9)
        f.camera.dispose()
    })
    it('supports pause, resume, labels and seeking without sharing state', () => {
        const a = fixture(), b = fixture()
        const timeline = a.camera.timeline({ paused: true })
            .addLabel('start', 0).to({ azimuth: 30 }, { duration: 60, ease: 'none' }, 'start')
        a.tick(10000); expect(a.pose().azimuth).toBe(-30)
        timeline.seek(30); expect(a.pose().azimuth).toBeCloseTo(0)
        timeline.resume(); a.tick(1000); expect(a.pose().azimuth).toBeCloseTo(1)
        timeline.pause(); a.tick(10000); expect(a.pose().azimuth).toBeCloseTo(1)
        expect(b.pose().azimuth).toBe(-30)
        a.camera.dispose(); b.camera.dispose()
    })
    it('preserves authored headings beyond 180 degrees and copies caller input', () => {
        const f = fixture()
        const orbit = { ...f.pose(), azimuth: 270 }
        f.camera.orbit(orbit)
        orbit.azimuth = 0
        f.camera.timeline().to({ azimuth: 300 }, { duration: 30, ease: 'none' })
        f.tick(1000); expect(f.pose().azimuth).toBeCloseTo(271)
        f.camera.dispose()
    })
    it('pauses on interaction and disposes replaced timelines exactly once', () => {
        const f = fixture()
        const first = f.camera.timeline().to({ azimuth: 30 }, { duration: 60, ease: 'none' })
        f.tick(1000); f.camera.interrupt(); f.tick(1000)
        expect(f.pose().azimuth).toBeCloseTo(-29)
        f.camera.timeline().to({ azimuth: 0 }, { duration: 10 })
        expect(f.unsubscribe).toHaveBeenCalledTimes(1)
        expect(() => first.resume()).toThrow('replaced or disposed')
        f.camera.dispose(); f.camera.dispose(); first.kill()
        expect(f.unsubscribe).toHaveBeenCalledTimes(2)
        expect(f.callbacks.size).toBe(0)
        expect(() => f.camera.timeline()).toThrow('disposed')
    })
    it('rejects invalid poses before taking control', () => {
        const f = fixture()
        expect(() => f.camera.orbit({ ...f.pose(), radius: 0 })).toThrow()
        expect(() => f.camera.orbit({ ...f.pose(), target: [0, NaN, 0] })).toThrow()
        expect(f.camera.isExplicit).toBe(false)
        f.camera.dispose()
    })
    it('runs ambient presets additively, rebases after interaction, and resumes from the user pose', () => {
        const f = fixture()
        f.camera.setMotion({ preset: 'sway', amount: 10, duration: 10, resumeAfter: 1, fadeDuration: 0 })
        f.advance(2000)
        expect(f.pose().azimuth).not.toBeCloseTo(-30)

        f.camera.interrupt()
        const userPose = { target: [2, 1, 0] as const, height: 7, radius: 15, azimuth: 40 }
        f.setPose(userPose)
        f.advance(900)
        expect(f.pose()).toEqual(userPose)
        f.advance(500)
        expect(f.pose().target).toEqual(userPose.target)
        expect(f.pose().azimuth).not.toBeCloseTo(-30)
        expect(f.pose().radius).toBe(userPose.radius)
        f.camera.dispose()
        expect(f.callbacks.size).toBe(0)
    })
    it('supports all presets, validates options, and honors reduced motion', () => {
        const f = fixture()
        for (const preset of ['sway', 'figure-eight', 'orbit'] as const) {
            f.camera.setMotion({ preset, resumeAfter: 0, fadeDuration: 0 })
            f.advance(500)
            expect(f.pose().target).toEqual([0, 0, 0])
        }
        f.setReducedMotion(true)
        const still = f.pose()
        f.advance(2000)
        expect(f.pose()).toEqual(still)
        expect(() => f.camera.setMotion('invalid' as any)).toThrow('preset')
        expect(() => f.camera.setMotion({ preset: 'sway', duration: 0 })).toThrow('duration')
        expect(() => f.camera.setMotion({ preset: 'sway', resumeAfter: -1 })).toThrow('resumeAfter')
        f.camera.dispose()
    })
    it('keeps automatic layout refits from taking over an explicit orbit', () => {
        const f = fixture()
        const queued: FrameRequestCallback[] = []
        vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { queued.push(fn); return 1 })
        try {
            const stage = Object.create(VuetrexStage.prototype) as VuetrexStage
            const refitContent = vi.fn()
            Object.assign(stage, { camera: f.camera, refreshDiagnostics: vi.fn(), refitContent,
                activeCameraTarget: 'scene', destroyed: false, refitQueued: false })
            stage.setCamera({ orbit: f.pose() })
            stage.invalidateContentBounds(); queued.shift()!(0)
            expect(refitContent).not.toHaveBeenCalled()
            f.camera.release()
            stage.invalidateContentBounds(); queued.shift()!(0)
            expect(refitContent).toHaveBeenCalledOnce()
        } finally { vi.unstubAllGlobals(); f.camera.dispose() }
    })
})

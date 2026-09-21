import gsap from 'gsap'

/** Orbit around a world-space target. Zero azimuth is +Z; positive angles turn toward +X. */
export interface VxCameraOrbit {
    target: readonly [number, number, number]
    /** Absolute world Y, not height above target. */
    height: number
    /** Horizontal distance from target, in world units. */
    radius: number
    /** Heading in degrees. */
    azimuth: number
}

export type VxCameraView = string | { orbit: VxCameraOrbit }
export type VxCameraOrbitUpdate = Partial<Pick<VxCameraOrbit, 'height' | 'radius' | 'azimuth'>>
export interface VxCameraTweenOptions { duration?: number; ease?: string; delay?: number }
export interface VxCameraTimelineOptions {
    repeat?: number
    yoyo?: boolean
    paused?: boolean
    defaults?: VxCameraTweenOptions
}

export interface CameraHost {
    now(): number
    read(): VxCameraOrbit
    apply(orbit: VxCameraOrbit): void
    onFrame(fn: (time: number) => void): () => void
}

function validate(update: VxCameraOrbitUpdate): void {
    for (const [key, value] of Object.entries(update)) {
        if (!['height', 'radius', 'azimuth'].includes(key) || !Number.isFinite(value)) {
            throw new TypeError('Camera orbit values must be finite height, radius, or azimuth numbers')
        }
        if ((key === 'height' && value < 0) || (key === 'radius' && value <= 0)) {
            throw new RangeError('Camera height must be nonnegative and radius must be positive')
        }
    }
}

/** A GSAP timeline advanced by the stage clock, so stopped scenes do not jump on resume. */
export class VxCameraTimeline {
    private readonly animation: gsap.core.Timeline
    private readonly unsubscribe: () => void
    private paused: boolean
    private killed = false
    private previous: number

    constructor(private readonly host: CameraHost, private readonly state: VxCameraOrbit,
        options: VxCameraTimelineOptions = {}) {
        this.paused = options.paused ?? false
        this.previous = host.now()
        this.animation = gsap.timeline({ ...options, paused: true, onUpdate: () => host.apply(state) })
        this.unsubscribe = host.onFrame(time => {
            const delta = Math.max(0, time - this.previous) / 1000
            this.previous = time
            if (!this.paused && !this.killed) this.animation.totalTime(this.animation.totalTime() + delta)
        })
    }

    to(values: VxCameraOrbitUpdate, options: VxCameraTweenOptions = {}, position?: number | string): this {
        this.assertAlive(); validate(values)
        this.animation.to(this.state, { ...options, ...values }, position)
        return this
    }
    set(values: VxCameraOrbitUpdate, position?: number | string): this {
        this.assertAlive(); validate(values)
        this.animation.set(this.state, values, position)
        return this
    }
    addLabel(label: string, position?: number | string): this {
        this.assertAlive(); this.animation.addLabel(label, position); return this
    }
    pause(): this { this.paused = true; return this }
    resume(): this { this.assertAlive(); this.previous = this.host.now(); this.paused = false; return this }
    /** Seek in seconds or to a label within the timeline's first cycle. */
    seek(position: number | string): this {
        this.assertAlive(); this.animation.seek(position, false); this.host.apply(this.state); return this
    }
    kill(): void {
        if (this.killed) return
        this.killed = true
        this.animation.kill()
        this.unsubscribe()
    }
    private assertAlive(): void {
        if (this.killed) throw new Error('This camera timeline has been replaced or disposed')
    }
}

/** Owns the explicit orbit and at most one camera timeline. */
export class VxCameraController {
    private active?: VxCameraTimeline
    private orbitState?: VxCameraOrbit
    private explicit = false
    private disposed = false
    constructor(private readonly host: CameraHost) {}
    get isExplicit(): boolean { return this.explicit }

    orbit(orbit: VxCameraOrbit): this {
        this.assertAlive()
        validate({ height: orbit.height, radius: orbit.radius, azimuth: orbit.azimuth })
        if (orbit.target.length !== 3 || !orbit.target.every(Number.isFinite)) throw new TypeError('Camera target requires three finite coordinates')
        this.active?.kill()
        this.explicit = true
        this.orbitState = { target: [...orbit.target], height: orbit.height, radius: orbit.radius, azimuth: orbit.azimuth }
        this.host.apply(this.orbitState)
        return this
    }
    timeline(options: VxCameraTimelineOptions = {}): VxCameraTimeline {
        this.assertAlive()
        this.active?.kill()
        this.explicit = true
        const current = this.orbitState ?? this.host.read()
        const state = { target: [...current.target] as [number, number, number], height: current.height,
            radius: current.radius, azimuth: current.azimuth }
        this.orbitState = state
        this.host.apply(state)
        return this.active = new VxCameraTimeline(this.host, state, options)
    }
    /** Pause when the user takes control. Resume continues the authored trajectory. */
    interrupt(): void { this.active?.pause(); this.orbitState = undefined }
    /** Release explicit control before switching back to content fitting or node focus. */
    release(): void { this.active?.kill(); this.active = undefined; this.orbitState = undefined; this.explicit = false }
    dispose(): void { if (this.disposed) return; this.release(); this.disposed = true }
    private assertAlive(): void { if (this.disposed) throw new Error('The camera controller is disposed') }
}

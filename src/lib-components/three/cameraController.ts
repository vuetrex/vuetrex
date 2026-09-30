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

export type VxCameraMotionPreset = 'sway' | 'figure-eight' | 'orbit'
export interface VxCameraMotionOptions {
    preset: VxCameraMotionPreset
    /** Horizontal amplitude in degrees. Ignored by the continuous orbit preset. */
    amount?: number
    /** Seconds per complete motion cycle. */
    duration?: number
    /** Idle seconds after camera input before ambient motion returns. */
    resumeAfter?: number
    /** Seconds used to fade the ambient motion back in. */
    fadeDuration?: number
}
export type VxCameraMotion = VxCameraMotionPreset | VxCameraMotionOptions

export interface CameraHost {
    now(): number
    read(): VxCameraOrbit
    apply(orbit: VxCameraOrbit): void
    onFrame(fn: (time: number) => void): () => void
    prefersReducedMotion?(): boolean
}

interface ResolvedCameraMotion {
    preset: VxCameraMotionPreset
    amount: number
    duration: number
    resumeAfter: number
    fadeDuration: number
}

const motionDefaults: Readonly<Record<VxCameraMotionPreset, Pick<ResolvedCameraMotion, 'amount' | 'duration'>>> = {
    sway: { amount: 10, duration: 22 },
    'figure-eight': { amount: 6, duration: 26 },
    orbit: { amount: 0, duration: 72 },
}

function resolveCameraMotion(motion: VxCameraMotion): ResolvedCameraMotion {
    const options = typeof motion === 'string' ? { preset: motion } : motion
    if (!options || !['sway', 'figure-eight', 'orbit'].includes(options.preset)) {
        throw new TypeError('Camera motion preset must be sway, figure-eight, or orbit')
    }
    const defaults = motionDefaults[options.preset]
    const resolved = {
        preset: options.preset,
        amount: options.amount ?? defaults.amount,
        duration: options.duration ?? defaults.duration,
        resumeAfter: options.resumeAfter ?? 2.5,
        fadeDuration: options.fadeDuration ?? 1.5,
    }
    if (!Number.isFinite(resolved.amount) || resolved.amount < 0) throw new RangeError('Camera motion amount must be a nonnegative finite number')
    if (!Number.isFinite(resolved.duration) || resolved.duration <= 0) throw new RangeError('Camera motion duration must be a positive finite number')
    if (!Number.isFinite(resolved.resumeAfter) || resolved.resumeAfter < 0) throw new RangeError('Camera motion resumeAfter must be a nonnegative finite number')
    if (!Number.isFinite(resolved.fadeDuration) || resolved.fadeDuration < 0) throw new RangeError('Camera motion fadeDuration must be a nonnegative finite number')
    return resolved
}

class VxAmbientCameraMotion {
    private readonly unsubscribe: () => void
    private base: VxCameraOrbit
    private phase = 0
    private strength = 0
    private previous: number
    private interruptedAt: number
    private killed = false

    constructor(private readonly host: CameraHost, private readonly options: ResolvedCameraMotion) {
        this.previous = host.now()
        this.interruptedAt = this.previous
        this.base = this.copy(host.read())
        this.unsubscribe = host.onFrame(time => this.tick(time))
    }

    interrupt(): void {
        if (this.killed) return
        this.interruptedAt = this.host.now()
        this.base = this.copy(this.host.read())
        this.phase = 0
        this.strength = 0
    }

    kill(): void {
        if (this.killed) return
        this.killed = true
        this.unsubscribe()
    }

    private tick(time: number): void {
        if (this.killed) return
        const delta = Math.max(0, Math.min(100, time - this.previous)) / 1000
        this.previous = time
        const reduced = this.host.prefersReducedMotion?.() === true
        const idle = !reduced && time - this.interruptedAt >= this.options.resumeAfter * 1000
        if (!idle) {
            this.base = this.copy(this.host.read())
            this.strength = 0
            return
        }

        this.phase = (this.phase + delta * Math.PI * 2 / this.options.duration) % (Math.PI * 2)
        this.strength = this.options.fadeDuration === 0
            ? 1
            : Math.min(1, this.strength + delta / this.options.fadeDuration)
        this.host.apply(this.pose())
    }

    private pose(): VxCameraOrbit {
        const phase = this.phase
        const strength = this.strength
        if (this.options.preset === 'orbit') {
            return { ...this.base, target: [...this.base.target], azimuth: this.base.azimuth + phase * 180 / Math.PI * strength }
        }
        if (this.options.preset === 'figure-eight') {
            return {
                ...this.base,
                target: [...this.base.target],
                azimuth: this.base.azimuth + Math.sin(phase) * this.options.amount * strength,
                height: this.base.height + Math.sin(phase * 2) * this.base.radius * 0.025 * strength,
                radius: this.base.radius * (1 + Math.cos(phase) * 0.012 * strength),
            }
        }
        return {
            ...this.base,
            target: [...this.base.target],
            azimuth: this.base.azimuth + Math.sin(phase) * this.options.amount * strength,
            height: this.base.height + Math.sin(phase * 2) * this.base.radius * 0.012 * strength,
        }
    }

    private copy(orbit: VxCameraOrbit): VxCameraOrbit {
        return { ...orbit, target: [...orbit.target] }
    }
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
    private ambient?: VxAmbientCameraMotion
    private configuredMotion?: VxCameraMotion
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
    setMotion(motion?: VxCameraMotion): this {
        this.assertAlive()
        const resolved = motion === undefined ? undefined : resolveCameraMotion(motion)
        this.ambient?.kill()
        this.ambient = undefined
        this.configuredMotion = typeof motion === 'object' ? { ...motion } : motion
        if (resolved !== undefined) this.ambient = new VxAmbientCameraMotion(this.host, resolved)
        return this
    }
    get motion(): VxCameraMotion | undefined { return this.configuredMotion }
    /** Pause when the user takes control. Resume continues the authored trajectory. */
    interrupt(): void { this.active?.pause(); this.orbitState = undefined; this.ambient?.interrupt() }
    /** Release explicit control before switching back to content fitting or node focus. */
    release(): void { this.active?.kill(); this.active = undefined; this.orbitState = undefined; this.explicit = false; this.ambient?.interrupt() }
    dispose(): void {
        if (this.disposed) return
        this.release()
        this.ambient?.kill(); this.ambient = undefined; this.configuredMotion = undefined
        this.disposed = true
    }
    private assertAlive(): void { if (this.disposed) throw new Error('The camera controller is disposed') }
}

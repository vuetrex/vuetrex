import gsap from 'gsap'

export default class LifeCycle {

    private readonly animations: ((timer: number, tick: number) => void)[] = []
    private readonly tickerFn: (time: number, deltaTime: number) => void

    // Exposed so Scene can read timer.current for camera animation timing
    readonly lifecycle = {
        paused: true,
        tick: 0,
        timer: { current: 0 }
    }

    constructor() {
        this.tickerFn = (_time, deltaTime) => {
            if (this.lifecycle.paused) return
            this.lifecycle.timer.current += deltaTime
            this.lifecycle.tick++
            this.animations.forEach(fn => fn(this.lifecycle.timer.current, this.lifecycle.tick))
            this.render()
        }
        gsap.ticker.fps(25)
        gsap.ticker.add(this.tickerFn)
    }

    render() {}

    start() {
        this.lifecycle.paused = false
    }

    pause() {
        this.lifecycle.paused = true
    }

    unpause() {
        this.lifecycle.paused = false
    }

    registerAnimation(fn: (timer: number, tick: number) => void): () => void {
        this.animations.push(fn)
        return () => {
            const index = this.animations.indexOf(fn)
            if (index >= 0) this.animations.splice(index, 1)
        }
    }

    stopRenderLoop() {
        gsap.ticker.remove(this.tickerFn)
    }
}

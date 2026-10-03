import { resolveComposerOptions } from './composer.js'
import type { VxComposerOptions, VxComposerPass } from './composer-api.js'

export interface VxComposerBuilder {
    bloom(value?: VxComposerOptions['bloom']): VxComposerBuilder
    grading(value?: VxComposerOptions['grading']): VxComposerBuilder
    ambientOcclusion(value?: VxComposerOptions['ambientOcclusion']): VxComposerBuilder
    vignette(value?: VxComposerOptions['vignette']): VxComposerBuilder
    /** Order is preserved within each phase. Factories create fresh composer-owned passes. */
    pass(key: string, create: VxComposerPass['create'], phase?: VxComposerPass['phase']): VxComposerBuilder
    build(): Readonly<VxComposerOptions>
}

/** Immutable composer authoring; build() works with vx-composer or stage.setComposer(). */
export function composer(options: Readonly<VxComposerOptions> = {}): VxComposerBuilder {
    // Resolve once to validate and snapshot caller-owned nested objects.
    const snapshot = resolveComposerOptions(options)!
    const withOption = (patch: VxComposerOptions): VxComposerBuilder => composer({ ...snapshot, ...patch })
    return Object.freeze({
        bloom: (value: VxComposerOptions['bloom'] = true) => withOption({ bloom: value }),
        grading: (value: VxComposerOptions['grading'] = true) => withOption({ grading: value }),
        ambientOcclusion: (value: VxComposerOptions['ambientOcclusion'] = true) => withOption({ ambientOcclusion: value }),
        vignette: (value: VxComposerOptions['vignette'] = true) => withOption({ vignette: value }),
        pass: (key: string, create: VxComposerPass['create'], phase: VxComposerPass['phase'] = 'linear') =>
            withOption({ passes: [...snapshot.passes, { key, create, phase }] }),
        build: (): Readonly<VxComposerOptions> => snapshot,
    })
}

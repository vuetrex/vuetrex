import type { ClassComponent, FunctionalComponent } from './nodes/types.js'

/** Exact built-in renderer tags; Vue components such as vx-stylesheet are excluded. */
export const builtinElementTags = Object.freeze([
    'vx-lighting', 'vx-environment', 'vx-camera', 'vx-floor', 'vx-group', 'vx-layer',
    'vx-row', 'vx-stack', 'vx-ring', 'vx-connectors', 'vx-edge', 'vx-port', 'vx-panel',
    'vx-instances', 'vx-display-wall', 'vx-spacer', 'vx-geometry', 'vx-particles',
    'vx-box', 'vx-cylinder', 'vx-wedge',
] as const)

/** Share this configuration between the Vue compiler and runtime registration.
 * This module has no runtime dependencies on Vue, Three.js, or renderer classes.
 */
export function createElementConfig<const Tags extends readonly string[]>(customTags: Tags) {
    const custom = new Set(customTags)
    if (custom.size !== customTags.length) throw new Error('Duplicate custom element tag')
    for (const tag of custom) {
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(tag)) {
            throw new Error(`Invalid custom element tag: ${tag}; use lowercase kebab-case`)
        }
    }
    const recognized = new Set<string>([...builtinElementTags, ...custom])
    return Object.freeze({
        isCustomElement: (tag: string): boolean => recognized.has(tag),
        /** Bind exactly the declared custom tags. Pass the result to Vuetrex's elements prop. */
        defineElements<T extends Record<Tags[number], ClassComponent | FunctionalComponent>>(
            elements: T & Record<Exclude<keyof T, Tags[number]>, never>,
        ): T {
            for (const tag of custom) {
                if (!Object.hasOwn(elements, tag)) throw new Error(`Missing implementation for custom element: ${tag}`)
            }
            for (const tag of Object.keys(elements)) {
                if (!custom.has(tag)) throw new Error(`Undeclared custom element: ${tag}`)
                const impl = (elements as Record<string, ClassComponent | FunctionalComponent>)[tag]
                if (typeof impl !== 'function' && (!impl || typeof impl.setup !== 'function')) {
                    throw new TypeError(`Invalid implementation for custom element: ${tag}`)
                }
            }
            return elements
        },
    })
}

/** Compiler predicate for applications that use only built-in scene elements. */
export const isVuetrexElement = createElementConfig([]).isCustomElement

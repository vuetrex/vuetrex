import { toRaw, watch, watchEffect, type WatchEffect, type WatchEffectOptions, type WatchOptions, type WatchCallback } from 'vue'

export interface VxSceneError {
    tag: string
    nodeId?: string
    property?: string
    phase: 'create' | 'prop' | 'insert' | 'sync' | 'effect' | 'mount' | 'render'
    message: string
    correction: string
    cause: unknown
}
export type SceneErrorHandler = (error: VxSceneError) => void
interface Context {
    tag: string
    nodeId?: string
    properties: Set<string>
    knownProperties: string[]
    report: SceneErrorHandler
    last: Map<unknown, string>
}
const contexts = new WeakMap<object, Context>()
export function bindSceneErrors(node: object, tag: string, report: SceneErrorHandler, nodeId?: string) {
    contexts.set(node, { tag, report, nodeId, properties: new Set(), knownProperties: Object.keys(toRaw((node as { state?: object }).state ?? {})), last: new Map() })
}
export function recordSceneProp(node: object, key: string, value: unknown) {
    const context = contexts.get(node)
    if (!context) return
    context.properties.add(key)
    if (key === 'id' || key === 'name') context.nodeId = value == null ? undefined : String(value)
}
export function sceneError(cause: unknown, tag: string, phase: VxSceneError['phase'], property?: string, nodeId?: string): VxSceneError {
    const message = cause instanceof Error ? cause.message : String(cause)
    let correction = 'Check this declaration and its inputs. Correct the value, then update the binding or remount the scene.'
    if (/Unknown.*property/i.test(message)) correction = 'Remove or rename this property using the tag’s documented props; camelCase and kebab-case are both supported.'
    else if (/finite|numeric/i.test(message)) correction = 'Provide a finite number; avoid NaN, Infinity, empty strings, booleans, arrays, and objects.'
    else if (/negative|between|must be|requires|supports|set together|fadeStart|cannot|never both/i.test(message)) correction = `Use values satisfying this constraint: ${message}`
    else if (/Only one|Duplicate/i.test(message)) correction = 'Remove the duplicate declaration or give nodes/records distinct IDs or keys.'
    else if (phase === 'create') correction = 'Register this tag through elements or registerElement(), and include it in the shared compiler configuration. Check the constructor if it is already registered.'
    return { tag, nodeId, property, phase, message, correction, cause }
}
export function runSceneOperation<T>(node: object, phase: VxSceneError['phase'], operation: () => T, property?: string, identity?: object): T | undefined {
    const context = contexts.get(node)
    if (!context) return operation() // Direct low-level callers retain throwing semantics.
    const slot = identity ?? `${phase}:${property ?? ''}`
    try {
        const result = operation()
        context.last.delete(slot)
        return result
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        const normalized = message.replace(/[-_]/g, '').toLowerCase()
        const inferred = property ?? [...context.properties].filter(key => !['id', 'name', 'key'].includes(key) && normalized.includes(key.replace(/[-_]/g, '').toLowerCase())).join(', ')
        const error = sceneError(cause, context.tag, phase, inferred || undefined, context.nodeId)
        if (/Unknown.*property/i.test(message) && context.knownProperties.length) {
            error.correction = `Use a supported property: ${context.knownProperties.join(', ')}. Kebab-case spellings are also accepted.`
        }
        if (context.last.get(slot) !== message) {
            context.last.set(slot, message)
            context.report(error)
        }
        return undefined
    }
}
export function watchSceneEffect(node: object, effect: WatchEffect, options?: WatchEffectOptions) {
    return watchEffect(cleanup => { runSceneOperation(node, 'effect', () => effect(cleanup), undefined, effect) }, options)
}
export function watchScene<T>(node: object, source: () => T, callback: WatchCallback<T>, options?: WatchOptions) {
    let valid = false
    return watch(() => {
        valid = false
        return runSceneOperation(node, 'effect', () => { const value = source(); valid = true; return value }, undefined, source)
    }, (value, oldValue, cleanup) => {
        if (valid) runSceneOperation(node, 'effect', () => callback(value as T, oldValue, cleanup), undefined, callback)
    }, options)
}

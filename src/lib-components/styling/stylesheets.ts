import { mergePresentation, type ConnectorAppearances } from '../connectors/declarations.js'
import { computed, defineComponent, Fragment, h, onMounted, onUnmounted, provide, ref, watch, type InjectionKey, type ComputedRef, type PropType } from 'vue'
import type { VxHoverProps, VxMaterialProps } from './types.js'

export type VxMaterialBinding = string | (VxMaterialProps & { preset?: string })
export interface VxMaterialStyle { extends?: string; base?: VxMaterialProps; hover?: VxHoverProps }
export interface VxStyleScheme { connectors?: ConnectorAppearances; materials?: Readonly<Record<string, VxMaterialStyle>> }
export interface VxStyleSheetDefinition { common?: VxStyleScheme; light?: VxStyleScheme; dark?: VxStyleScheme }
export type VxColorScheme = 'light' | 'dark' | 'system'
export type MaterialStyles = Readonly<Record<string, VxMaterialStyle>>
export interface VxStyleSheetContext {
    sheets: ComputedRef<readonly VxStyleSheetDefinition[]>
    resolvedScheme: ComputedRef<'light' | 'dark'>
}
export const styleSheetContextKey: InjectionKey<VxStyleSheetContext> = Symbol('Vuetrex stylesheet inputs')
export const connectorAppearancesKey: InjectionKey<ComputedRef<ConnectorAppearances>> = Symbol('Vuetrex connector appearances')
export const materialStylesKey: InjectionKey<ComputedRef<MaterialStyles>> = Symbol('Vuetrex material styles')

/** Freeze the authored structure, never the caller's textures or color objects. */
export function defineVxStyleSheet(definition: VxStyleSheetDefinition): VxStyleSheetDefinition {
    const result: VxStyleSheetDefinition = {}
    for (const scheme of ['common', 'light', 'dark'] as const) {
        const value = definition[scheme]
        if (!value) continue
        const materials: Record<string, VxMaterialStyle> = Object.create(null)
        for (const [name, style] of Object.entries(value.materials ?? {})) {
            materials[name] = Object.freeze({ ...style,
                base: style.base && Object.freeze({ ...style.base }),
                hover: style.hover && Object.freeze({ ...style.hover }) })
        }
        result[scheme] = Object.freeze({ materials: Object.freeze(materials), connectors: Object.freeze(Object.fromEntries(Object.entries(value.connectors ?? {}).map(([name, style]) => [name, Object.freeze({ ...style })]))) })
    }
    return Object.freeze(result)
}

export function mergeStyleSheets(sheets: readonly VxStyleSheetDefinition[], scheme: 'light' | 'dark'): MaterialStyles {
    const styles: Record<string, VxMaterialStyle> = Object.create(null)
    for (const sheet of sheets) for (const layer of [sheet.common, sheet[scheme]]) {
        for (const [name, style] of Object.entries(layer?.materials ?? {})) {
            const prior = styles[name]
            styles[name] = { extends: style.extends ?? prior?.extends,
                base: mergeDefined(prior?.base, style.base), hover: mergeDefined(prior?.hover, style.hover) }
        }
    }
    // Validate eagerly, including unused styles, so broken sheets never fail only on interaction.
    for (const name of Object.keys(styles)) resolveMaterialBinding(styles, name)
    return styles
}

function mergeDefined<T extends object>(...values: (T | undefined)[]): T | undefined {
    const present = values.filter((value): value is T => value !== undefined)
    if (!present.length) return undefined
    return Object.assign({}, ...present.map(value => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))))
}

/** Named styles supply ordered descriptors; the pure material resolver still owns defaults. */
export function resolveMaterialBinding(styles: MaterialStyles = {}, binding?: VxMaterialBinding, hover?: VxHoverProps): { layers: VxMaterialProps[]; hover?: VxHoverProps } {
    const layers: VxMaterialProps[] = []
    let inheritedHover: VxHoverProps | undefined
    const visiting = new Set<string>()
    const visit = (name: string) => {
        if (visiting.has(name)) throw new Error(`Vuetrex material inheritance cycle: ${[...visiting, name].join(' → ')}`)
        const style = Object.hasOwn(styles, name) ? styles[name] : undefined
        if (!style) throw new Error(`Unknown Vuetrex material style: ${name}`)
        visiting.add(name)
        if (style.extends) visit(style.extends)
        if (style.base) layers.push(style.base)
        inheritedHover = mergeDefined(inheritedHover, style.hover)
        visiting.delete(name)
    }
    if (typeof binding === 'string') visit(binding)
    else if (binding) {
        if (binding.preset) visit(binding.preset)
        const { preset: _, ...inline } = binding
        layers.push(inline)
    }
    return { layers, hover: mergeDefined(inheritedHover, hover) }
}

export function mergeConnectorAppearances(sheets: readonly VxStyleSheetDefinition[], scheme: 'light' | 'dark'): ConnectorAppearances {
    const styles: Record<string, import('../connectors/declarations.js').ConnectorPresentation> = Object.create(null)
    for (const sheet of sheets) for (const layer of [sheet.common, sheet[scheme]]) {
        for (const [name, style] of Object.entries(layer?.connectors ?? {})) styles[name] = Object.freeze(mergePresentation(styles[name], style))
    }
    return Object.freeze(styles)
}

/** Resolve a reactive scheme, following the browser preference only for `system`. */
export function useResolvedColorScheme(scheme: ComputedRef<VxColorScheme>): ComputedRef<'light' | 'dark'> {
    const systemDark = ref(false)
    let media: MediaQueryList | undefined
    let stopWatching: (() => void) | undefined
    const update = () => { systemDark.value = media?.matches ?? false }
    onMounted(() => {
        stopWatching = watch(() => scheme.value === 'system', enabled => {
            media?.removeEventListener('change', update)
            media = enabled ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined
            update()
            media?.addEventListener('change', update)
        }, { immediate: true })
    })
    onUnmounted(() => {
        stopWatching?.()
        media?.removeEventListener('change', update)
    })
    return computed(() => scheme.value === 'system' ? systemDark.value ? 'dark' : 'light' : scheme.value)
}

export const VxStylesheet = defineComponent({
    name: 'VxStylesheet',
    props: {
        sheets: { type: Array as PropType<readonly VxStyleSheetDefinition[]>, default: () => [] },
        scheme: { type: String as PropType<VxColorScheme>, default: 'light' },
    },
    setup(props, { slots }) {
        const sheets = computed(() => props.sheets)
        const scheme = computed(() => props.scheme)
        const resolvedScheme = useResolvedColorScheme(scheme)
        provide(styleSheetContextKey, { sheets, resolvedScheme })
        provide(connectorAppearancesKey, computed(() => mergeConnectorAppearances(sheets.value, resolvedScheme.value)))
        provide(materialStylesKey, computed(() => mergeStyleSheets(sheets.value, resolvedScheme.value)))
        return () => h(Fragment, slots.default?.())
    },
})

/** @deprecated Use VxStylesheet (`<vx-stylesheet>`) for the shared provider. */
export const VxStyleSheet = VxStylesheet

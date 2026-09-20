import { computed, defineComponent, Fragment, h, onMounted, onUnmounted, provide, ref, type InjectionKey, type ComputedRef, type PropType } from 'vue'
import type { VxHoverProps, VxMaterialProps } from './types.js'

export type VxMaterialBinding = string | (VxMaterialProps & { preset?: string })
export interface VxMaterialStyle { extends?: string; base?: VxMaterialProps; hover?: VxHoverProps }
export interface VxStyleScheme { materials?: Readonly<Record<string, VxMaterialStyle>> }
export interface VxStyleSheetDefinition { common?: VxStyleScheme; light?: VxStyleScheme; dark?: VxStyleScheme }
export type VxColorScheme = 'light' | 'dark' | 'system'
export type MaterialStyles = Readonly<Record<string, VxMaterialStyle>>
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
        result[scheme] = Object.freeze({ materials: Object.freeze(materials) })
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

export const VxStyleSheet = defineComponent({
    name: 'VxStyleSheet',
    props: {
        sheets: { type: Array as PropType<readonly VxStyleSheetDefinition[]>, default: () => [] },
        scheme: { type: String as PropType<VxColorScheme>, default: 'light' },
    },
    setup(props, { slots }) {
        const systemDark = ref(false)
        let media: MediaQueryList | undefined
        const update = () => { systemDark.value = media?.matches ?? false }
        onMounted(() => {
            media = window.matchMedia?.('(prefers-color-scheme: dark)')
            update()
            media?.addEventListener('change', update)
        })
        onUnmounted(() => media?.removeEventListener('change', update))
        provide(materialStylesKey, computed(() => mergeStyleSheets(props.sheets,
            props.scheme === 'system' ? systemDark.value ? 'dark' : 'light' : props.scheme)))
        return () => h(Fragment, slots.default?.())
    },
})

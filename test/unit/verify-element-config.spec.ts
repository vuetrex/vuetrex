import { describe, expect, it } from 'vitest'
import { builtinElementTags, createElementConfig, isVuetrexElement } from '@/lib-components/compiler.js'
import { types } from '@/lib-components/nodes/types.js'
import { Box } from '@/lib-components/nodes/shapes/Box.js'

describe('shared element configuration', () => {
    it('recognizes exactly the built-in registry, not Vue components or unknown tags', () => {
        expect([...builtinElementTags].sort()).toEqual(Object.keys(types).sort())
        for (const tag of builtinElementTags) expect(isVuetrexElement(tag)).toBe(true)
        for (const tag of ['vx-stylesheet', 'Vuetrex', 'vx-typo', 'div', 'toString']) expect(isVuetrexElement(tag)).toBe(false)
    })
    it('shares explicit tag names with class and functional runtime bindings', () => {
        const config = createElementConfig(['vx-custom', 'custom-shape'])
        const functional = { setup: (stage: ConstructorParameters<typeof Box>[0]) => new Box(stage) }
        const registry = { 'vx-custom': Box, 'custom-shape': functional }
        expect(config.defineElements(registry)).toBe(registry)
        expect(config.isCustomElement('vx-custom')).toBe(true)
        expect(config.isCustomElement('vx-lighting')).toBe(true)
        expect(isVuetrexElement('vx-custom')).toBe(false)
    })
    it('rejects compiler/runtime mismatches and invalid manifests', () => {
        const config = createElementConfig(['vx-custom'])
        expect(() => config.defineElements({} as any)).toThrow('Missing implementation')
        expect(() => config.defineElements({ 'vx-custom': Box, 'vx-extra': Box } as any)).toThrow('Undeclared')
        expect(() => config.defineElements({ 'vx-custom': null } as any)).toThrow('Invalid implementation')
        expect(() => createElementConfig(['vx-custom', 'vx-custom'])).toThrow('Duplicate')
        expect(() => createElementConfig(['MyShape'])).toThrow('kebab-case')
    })
    it('snapshots tag lists and isolates different application configurations', () => {
        const tags = ['vx-a']
        const first = createElementConfig(tags), second = createElementConfig(['vx-b'])
        tags.push('vx-b')
        expect(first.isCustomElement('vx-b')).toBe(false)
        expect(second.isCustomElement('vx-a')).toBe(false)
        expect(first.defineElements({ 'vx-a': Box })).toEqual({ 'vx-a': Box })
    })
})

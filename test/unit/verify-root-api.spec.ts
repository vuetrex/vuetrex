import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import Vuetrex from '@/lib-components/vuetrex.js'

describe('root component editor contract', () => {
    it('keeps generated documentation and metadata current', () => {
        expect(() => execFileSync(process.execPath, ['scripts/generate-root-api.mjs', '--check'])).not.toThrow()
    })

    it('describes every runtime prop with the same default and a navigable source', () => {
        const metadata = JSON.parse(readFileSync('web-types.json', 'utf8'))
        const [root] = metadata.contributions.html.elements
        expect(metadata.contributions.html.elements.map((element: { name: string }) => element.name)).toEqual(['Vuetrex', 'vx-connectors', 'vx-edge', 'vx-port'])
        expect(root.name).toBe('Vuetrex')
        const props = Vuetrex.props as Record<string, { default: unknown }>
        expect(root.attributes.map((attr: { name: string }) => attr.name).sort()).toEqual(Object.keys(props).sort())
        for (const attr of root.attributes) {
            const value = props[attr.name].default
            expect(attr.default === undefined ? undefined : JSON.parse(attr.default)).toEqual(typeof value === 'function' ? value() : value)
            const contract = readFileSync(attr.source.file.replace(/^dist_types\//, ''), 'utf8')
            expect(contract.slice(attr.source.offset)).toMatch(new RegExp(`^${attr.name}\\?`))
            expect(attr.description).not.toBe('')
        }
        expect(root.events.map((event: { name: string }) => event.name)).toEqual(Object.keys(Vuetrex.emits!))
    })
})

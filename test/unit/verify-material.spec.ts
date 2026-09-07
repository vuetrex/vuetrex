import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { applyMaterialProps } from '@/lib-components/nodes/material.js'

describe('mesh material props', () => {
    it('applies and removes texture maps reactively', () => {
        const material = new THREE.MeshStandardMaterial()
        const texture = new THREE.Texture()
        const initialVersion = material.version

        applyMaterialProps(material, { map: texture })
        expect(material.map).toBe(texture)
        expect(material.version).toBeGreaterThan(initialVersion)

        applyMaterialProps(material, { map: null })
        expect(material.map).toBeNull()
    })
})

import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { compileParticles } from '@/lib-components/particles/compiler/evaluator.js'
import { createParticleBackend } from '@/lib-components/particles/backend.js'
import { registerWorkshopGpuOrbits, workshopOrbitGraph } from '../../workshops/workshop1/gpuOrbits.js'

const context = {
  parameters: {}, pixelRatio: 1,
  resolveTarget: () => ({ center: new THREE.Vector3(), radius: new THREE.Vector3(1, 1, 1) }),
}

describe('workshop1 massive GPU orbits', () => {
  it('renders one million particles in one static batch and animates only its clock', () => {
    const unregister = registerWorkshopGpuOrbits()
    const program = compileParticles(workshopOrbitGraph(1000000))
    const backend = createParticleBackend(program, context)
    try {
      expect(backend.particleCount).toBe(1000000)
      expect(backend.object.children).toHaveLength(1)
      const points = backend.object.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
      const position = points.geometry.getAttribute('position') as THREE.BufferAttribute
      const original = position.array
      const first = [...original.slice(0, 3)]
      const version = position.version
      const bounds = backend.localBounds()
      const recompute = vi.spyOn(points.geometry, 'computeBoundingSphere')
      for (let frame = 0; frame < 100; frame++) backend.update(frame / 25, 1 / 25)
      expect(position.count).toBe(1000000)
      expect(position.array).toBe(original)
      expect([...original.slice(0, 3)]).toEqual(first)
      expect(position.version).toBe(version)
      expect(recompute).not.toHaveBeenCalled()
      expect(points.material.uniforms.orbitTime.value).toBe(99 / 25)
      expect(backend.localBounds().equals(bounds)).toBe(true)
      const orbitData = points.geometry.getAttribute('orbitData')
      expect(orbitData.getZ(0)).toBeGreaterThan(0)
      expect(orbitData.getZ(333334)).toBeLessThan(0)
      expect(bounds.containsPoint(new THREE.Vector3().fromBufferAttribute(position, 0))).toBe(true)
      expect(new THREE.Raycaster().intersectObject(points)).toHaveLength(0)
    } finally {
      backend.dispose()
      unregister()
    }
  })

  it('disposes geometry/material exactly once and unregisters the workshop backend', () => {
    const unregister = registerWorkshopGpuOrbits()
    const program = compileParticles(workshopOrbitGraph(100))
    const backend = createParticleBackend(program, context)
    const points = backend.object.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    const disposeGeometry = vi.spyOn(points.geometry, 'dispose')
    const disposeMaterial = vi.spyOn(points.material, 'dispose')
    backend.dispose()
    backend.dispose()
    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
    expect(backend.object.children).toHaveLength(0)
    unregister()
    expect(() => createParticleBackend(program, context)).toThrow('not registered')
  })
})

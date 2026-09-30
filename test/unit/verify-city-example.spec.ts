import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Vector3 } from 'three'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { carPose, createCityBlock, roadLength, trafficParameters } from '../../docs/examples/src/cityBlock.js'
import CityBlockScene from '../../docs/examples/src/CityBlockScene.vue'

// Test the example against current source; the documentation build tests the package artifact.
vi.mock('@exceeder/vuetrex', async () => ({
  ...await import('@/lib-components/geometry/index.js'),
  Vuetrex: { template: '<div><slot /></div>' },
}))

afterEach(() => vi.unstubAllGlobals())

describe('city notebook example', () => {
  it('wraps travel distance and turns the car to face each street', () => {
    expect(carPose(0)).toEqual(carPose(roadLength))
    expect(carPose(-1)).toEqual(carPose(roadLength - 1))
    expect(carPose(1).position).toEqual([-2.35, 0.16, -2.75])
    expect(carPose(7).rotation[1]).toBe(-Math.PI / 2)
    expect(carPose(13).rotation[1]).toBe(-Math.PI)
    expect(carPose(20).rotation[1]).toBeCloseTo(Math.PI / 2)
    expect(trafficParameters(0, 3)).toEqual({})
    expect(Object.keys(trafficParameters(12, 3))).toHaveLength(24)
  })

  it('keeps ground bounds, keys, and prototypes stable across animation and skyline updates', () => {
    const prototypes = new GeometryPrototypeRegistry()
    try {
      const graph = createCityBlock(1, 12)
      prototypes.beginCompilation()
      const before = evaluateGeometry(graph as any, prototypes, { skyline: [1, 1, 1], ...trafficParameters(12, 0) })
      prototypes.endCompilation()
      prototypes.beginCompilation()
      const after = evaluateGeometry(graph as any, prototypes, { skyline: [1, 1.5, 1], ...trafficParameters(12, 3) })
      prototypes.endCompilation()
      expect(after.records.map(record => record.key)).toEqual(before.records.map(record => record.key))
      expect(new Set(before.records.map(record => record.prototype)).size).toBe(1)
      expect(after.records[0].prototype).toBe(before.records[0].prototype)
      expect(geometrySetBounds(before).min.y).toBeCloseTo(0)
      expect(geometrySetBounds(after).min.y).toBeCloseTo(0)
      expect(geometrySetBounds(after).max.y).toBeGreaterThan(geometrySetBounds(before).max.y)
      const carsBefore = before.records.filter(record => record.materialKey === 'car')
      const carsAfter = after.records.filter(record => record.materialKey === 'car')
      expect(carsBefore).toHaveLength(12)
      expect(carsBefore[0].matrix.equals(carsAfter[0].matrix)).toBe(false)
      for (const record of after.records.filter(record => record.materialKey === 'facade')) {
        expect(geometrySetBounds({ records: [record] }).min.y).toBeCloseTo(0.24)
      }
      expect(geometrySetBounds(after).getSize(new Vector3()).x).toBeCloseTo(8.4)
    } finally {
      prototypes.dispose()
    }
  })

  it('supports empty traffic and reproducible skyline variations', () => {
    const prototypes = new GeometryPrototypeRegistry()
    try {
      const a = evaluateGeometry(createCityBlock(1, 0) as any, prototypes)
      const b = evaluateGeometry(createCityBlock(1, 0)  as any, prototypes)
      const c = evaluateGeometry(createCityBlock(2, 24)  as any, prototypes)
      expect(a.records.some(record => record.materialKey === 'car')).toBe(false)
      expect(c.records.filter(record => record.materialKey === 'car')).toHaveLength(24)
      const facades = (set: typeof a) => set.records.filter(record => record.materialKey === 'facade')
        .map(record => ({ matrix: record.matrix.toArray(), color: record.color.getHex() }))
      expect(facades(a)).toEqual(facades(b))
      expect(facades(a)).not.toEqual(facades(c))
      expect(new Set(c.records.map(record => record.key)).size).toBe(c.records.length)
    } finally {
      prototypes.dispose()
    }
  })

  it('honors reduced motion, reacts to controls, pauses, and releases animation resources', async () => {
    let callback: FrameRequestCallback = () => {}
    const cancel = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal('requestAnimationFrame', vi.fn((fn: FrameRequestCallback) => { callback = fn; return 42 }))
    vi.stubGlobal('cancelAnimationFrame', cancel)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect = disconnect })
    const wrapper = mount(CityBlockScene)
    try {
      await nextTick()
      const state = wrapper.vm as unknown as { distance: number; city: object }
      const initialGraph = state.city
      expect(wrapper.text()).toContain('Resume traffic')
      const now = performance.now()
      callback(now + 100)
      expect(state.distance).toBe(0)
      await wrapper.get('button').trigger('click')
      callback(now + 200)
      await nextTick()
      expect(state.distance).toBeGreaterThan(0)
      expect(state.city).toBe(initialGraph)
      await wrapper.get('button').trigger('click')
      const pausedDistance = state.distance
      callback(now + 300)
      expect(state.distance).toBe(pausedDistance)
      await wrapper.get('input[aria-label="Number of cars"]').setValue('0')
      expect(wrapper.text()).toContain('0 cars')
      expect(state.city).not.toBe(initialGraph)
      await wrapper.get('input[aria-label="Skyline height"]').setValue('1.5')
      expect(wrapper.text()).toContain('1.5×')
      await wrapper.get('button').trigger('click')
      expect(wrapper.text()).toContain('Pause traffic')
      callback(now + 400)
      await nextTick()
      await wrapper.get('button').trigger('click')
      expect(wrapper.text()).toContain('Resume traffic')
    } finally {
      wrapper.unmount()
    }
    expect(cancel).toHaveBeenCalledWith(42)
    expect(disconnect).toHaveBeenCalledOnce()
  })
})

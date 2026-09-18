import { geo, type GeometrySource } from '@exceeder/vuetrex'

// X/Z describe the map; Y is height. The whole model starts at Y = 0.
const halfWidth = 3.35
const halfDepth = 2.75
export const roadLength = 4 * (halfWidth + halfDepth)
const palette = [0xd78262, 0x629fa4, 0xdfba76, 0x8e91b4, 0xa3ae88, 0xcc9588]

function box(size: readonly [number, number, number], position: readonly [number, number, number], material: string) {
  return geo.box().transform({ scale: size, translate: position }).material(material)
}

/** Travel in world units, wrapping around four straight streets. No physics engine. */
export function carPose(distance: number) {
  let remaining = distance % roadLength
  if (remaining < 0) remaining += roadLength
  const corners = [
    [-halfWidth, -halfDepth], [halfWidth, -halfDepth],
    [halfWidth, halfDepth], [-halfWidth, halfDepth], [-halfWidth, -halfDepth],
  ]
  for (let side = 0; side < 4; side++) {
    const [x, z] = corners[side]
    const dx = corners[side + 1][0] - x
    const dz = corners[side + 1][1] - z
    const length = Math.hypot(dx, dz)
    if (remaining < length || side === 3) {
      return {
        position: [x + dx * remaining / length, 0.16, z + dz * remaining / length] as const,
        rotation: [0, -Math.atan2(dz, dx), 0] as const,
      }
    }
    remaining -= length
  }
  throw new Error('A closed street must have a segment')
}

export function trafficParameters(count: number, distance: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => {
    const pose = carPose(distance + index * roadLength / count)
    return [[`car-${index}-position`, pose.position], [`car-${index}-rotation`, pose.rotation]]
  }).flat())
}

/** A repeatable little skyline: the seed changes sizes, never the six lot IDs. */
export function createCityBlock(seed: number, carCount: number) {
  const lots = Array.from({ length: 6 }, (_, index) => ({
    id: `lot-${index}`,
    x: (index % 3 - 1) * 1.7,
    z: index < 3 ? -1.05 : 1.05,
    height: 0.75 + ((index * 7 + seed * 11) % 17) / 11,
    color: palette[(index + seed) % palette.length],
  }))
  const onLots = (source: GeometrySource) => source.distribute({
    items: lots,
    keyBy: 'id',
    position: ({ item }) => [item.x, 0.24, item.z],
    scale: ({ item }) => [1.2, item.height, 1.3],
  }).parameterMap({ scale: geo.param('skyline', [1, 1, 1]) })

  const facades = onLots(box([1, 1, 1], [0, 0.5, 0], 'facade'))
    .parameterMap({ color: ({ item }) => item.color })
  const roofs = onLots(box([1.06, 0.05, 1.06], [0, 1.025, 0], 'roof'))
  const windows = onLots(geo.join([-1, 1].map(side =>
    box([0.14, 0.02, 0.1], [0, 0, 0], 'glass')
      .distribute({
        pattern: 'grid', count: [3, 3], spacing: [0.28, 0.27],
      })
      // A grid starts on XZ; stand it upright, then lift it onto the facade.
      .transform({ rotate: [Math.PI / 2, 0, 0], translate: [0, 0.5, side * 0.51] }),
  )))

  const cars = Array.from({ length: carCount }, (_, index) => ({
    id: `car-${index}`, index, color: palette[(index + 2) % palette.length],
  }))
  const onRoad = (source: GeometrySource) => source.distribute({
    items: cars,
    keyBy: 'id',
    position: ({ item }) => geo.param(`${item.id}-position`, carPose(item.index * roadLength / carCount).position),
    rotation: ({ item }) => geo.param(`${item.id}-rotation`, carPose(item.index * roadLength / carCount).rotation),
  })
  const bodies = onRoad(box([0.46, 0.13, 0.24], [0, 0.1, 0], 'car'))
    .parameterMap({ color: ({ item }) => item.color })
  const cabins = onRoad(box([0.23, 0.09, 0.2], [-0.025, 0.21, 0], 'glass'))
  const wheels = onRoad(box([0.09, 0.09, 0.045], [0, 0.045, 0], 'rubber')
    .distribute({ points: [[-0.14, 0, -0.13], [0.14, 0, -0.13], [-0.14, 0, 0.13], [0.14, 0, 0.13]] }))
  const markings = box([0.24, 0.012, 0.035], [0, 0.006, 0], 'paint')
    .distribute({
      items: Array.from({ length: 40 }, (_, index) => ({ id: `dash-${index}`, ...carPose(index * roadLength / 40) })),
      keyBy: 'id', position: ({ item }) => item.position, rotation: ({ item }) => item.rotation,
    })

  return geo.join([
    box([8.4, 0.12, 7.2], [0, 0.06, 0], 'base'),
    box([7.8, 0.04, 6.6], [0, 0.14, 0], 'asphalt'),
    box([5.6, 0.08, 4.4], [0, 0.2, 0], 'pavement'),
    box([5.1, 0.025, 0.55], [0, 0.2525, 0], 'garden'),
    markings, facades, roofs, windows, bodies, cabins, wheels,
  ])
}

export const cityMaterials = {
  base: { color: 0x566764, roughness: 0.9 },
  asphalt: { color: 0x28373e, roughness: 1 },
  pavement: { color: 0xc7baa3, roughness: 0.9 },
  garden: { color: 0x72916d, roughness: 1 },
  facade: { color: 0xffffff, roughness: 0.8 },
  roof: { color: 0xe6dcc6, roughness: 0.7 },
  glass: { color: 0xc9e5e5, roughness: 0.3, metalness: 0.2 },
  car: { color: 0xffffff, roughness: 0.4 },
  rubber: { color: 0x172329, roughness: 1 },
  paint: { color: 0xf7dc92, roughness: 0.8 },
}

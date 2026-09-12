import { defineGeometry, geo, type GeometrySource } from '@/lib-components/index.js'
import type { DeploymentViewModel, HealthStatus } from '../types.js'

export type DeploymentVisualKind = 'gateway' | 'lock' | 'catalog' | 'workflow' | 'orbit'

interface DeploymentVisualParameters {
  id: string
  seed: number
  podCount: number
  readiness: number
  activity: number
  stress: number
  primary: number
  accent: number
  status: number
}

const visualKinds: readonly DeploymentVisualKind[] = [
  'gateway',
  'lock',
  'catalog',
  'workflow',
  'orbit',
]

const knownVisualKinds: Readonly<Record<string, DeploymentVisualKind>> = Object.freeze({
  'edge-gateway': 'gateway',
  'auth-api': 'lock',
  'catalog-api': 'catalog',
  'orders-api': 'workflow',
  'payments-api': 'orbit',
})

const palettes = [
  [0x46a8d8, 0x9be7f5],
  [0x9a6bd2, 0xd8b6ff],
  [0x54a96b, 0xa4df82],
  [0xe38a42, 0xffc66d],
  [0x3f86d8, 0x8dd2ff],
  [0xc65f86, 0xf3a5bd],
] as const

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function statusColor(status: HealthStatus): number {
  if (status === 'unavailable') return 0xc94b55
  if (status === 'degraded') return 0xd99a35
  return 0x55bb7a
}

function colorize(source: GeometrySource, color: number, key: string): GeometrySource {
  return geo.parameterMap(source, { key, color })
}

function transform(
  source: GeometrySource,
  key: string,
  translate: readonly [number, number, number],
  scale?: number | readonly [number, number, number],
): GeometrySource {
  return geo.transform(source, { key, translate, ...(scale === undefined ? {} : { scale }) })
}

const gatewayVisual = defineGeometry<DeploymentVisualParameters>('health.gateway-visual', parameters => {
  const rayCount = Math.max(3, Math.min(5, parameters.podCount + 1))
  const rayHeight = 0.12 + parameters.activity * 0.035
  const beam = colorize(
    geo.line({ key: 'gateway-beam', length: rayHeight, thickness: 0.009, radialSegments: 6 }),
    parameters.primary,
    'gateway-beam-color',
  )
  const terminalSites = geo.points(Array.from({ length: rayCount }, (_, index) => {
      const unit = rayCount <= 1 ? 0.5 : index / (rayCount - 1)
      const angle = (unit - 0.5) * 1.65
      return {
        key: `terminal-${index}`,
        position: [Math.sin(angle) * 0.105, 0.22 + Math.cos(angle) * 0.025, Math.cos(angle) * 0.04] as const,
      }
  }))
  const beamSites = geo.mapPoints(terminalSites, site => ({
    key: site.key,
    position: [0, 0.115, 0],
    direction: [site.position.x, site.position.y - 0.115, site.position.z],
    scale: 0.86 + (site.count <= 1 ? 0.5 : site.index / (site.count - 1)) * 0.2,
  }))
  const beams = geo.distribute(beam, beamSites)
  const terminals = geo.distribute(
    colorize(geo.icosphere({ key: 'gateway-terminal', radius: 0.026, detail: 1 }), parameters.accent, 'terminal-color'),
    terminalSites,
  )

  return geo.join([
    colorize(geo.line({ key: 'gateway-mast', length: 0.15, thickness: 0.016, radialSegments: 7 }), parameters.status, 'mast-color'),
    transform(colorize(geo.icosphere({ key: 'gateway-core', radius: 0.055, detail: 1 }), parameters.primary, 'core-color'), 'core-position', [0, 0.065, 0]),
    beams,
    geo.randomize(terminals, { key: 'terminal-variation', seed: parameters.seed, scale: [0.86, 1.14] }),
  ], { key: 'gateway-assembly' })
})

const lockVisual = defineGeometry<DeploymentVisualParameters>('health.lock-visual', parameters => {
  const pinCount = Math.max(1, Math.min(4, parameters.podCount))
  const pins = geo.parameterMap(
    geo.distribute(geo.box({ key: 'lock-pin', width: 0.018, height: 0.045, depth: 0.018 }), {
      key: 'lock-pins',
      pattern: 'line',
      count: pinCount,
      start: [-0.065, 0.075, 0.076],
      end: [0.065, 0.075, 0.076],
    }),
    {
      key: 'lock-pin-colors',
      color: ({ index }) => index % 2 === 0 ? parameters.accent : parameters.status,
      scale: [1, 0.7 + parameters.readiness * 0.45, 1],
    },
  )

  return geo.join([
    transform(
      colorize(geo.box({ key: 'lock-body', width: 0.23, height: 0.15, depth: 0.14 }), parameters.primary, 'lock-body-color'),
      'lock-body-position',
      [0, 0.075, 0],
    ),
    colorize(geo.line({
      key: 'lock-shackle',
      points: [[-0.075, 0.145, 0], [-0.075, 0.235, 0], [0, 0.285, 0], [0.075, 0.235, 0], [0.075, 0.145, 0]],
      thickness: 0.017,
      radialSegments: 7,
      tubularSegments: 18,
      path: 'smooth',
    }), parameters.accent, 'lock-shackle-color'),
    transform(colorize(geo.icosphere({ key: 'lock-keyhole', radius: 0.025, detail: 1 }), parameters.status, 'keyhole-color'), 'keyhole-position', [0, 0.075, 0.078], [0.72, 1.15, 0.42]),
    pins,
  ], { key: 'lock-assembly' })
})

const catalogVisual = defineGeometry<DeploymentVisualParameters>('health.catalog-visual', parameters => {
  const shelfCount = Math.max(3, Math.min(6, parameters.podCount + 2))
  const shelves = geo.parameterMap(
    geo.distribute(geo.box({ key: 'catalog-shelf', width: 0.17, height: 0.042, depth: 0.12 }), {
      key: 'catalog-shelves',
      pattern: 'custom',
      count: shelfCount,
      placement(index) {
        return {
          key: `shelf-${index}`,
          position: [index % 2 === 0 ? -0.045 : 0.045, 0.035 + index * 0.052, 0],
          scale: 0.92 + (index % 3) * 0.06,
        }
      },
    }),
    {
      key: 'catalog-colors',
      color: ({ index }) => index === shelfCount - 1
        ? parameters.status
        : index % 2 === 0 ? parameters.primary : parameters.accent,
    },
  )

  return geo.join([
    colorize(geo.line({ key: 'catalog-spine', length: 0.31, thickness: 0.012, radialSegments: 6 }), parameters.status, 'catalog-spine-color'),
    geo.randomize(shelves, {
      key: 'catalog-shelf-variation',
      seed: parameters.seed,
      rotation: [0, 0.025 + parameters.stress * 0.035, 0.02],
      scale: [0.96, 1.04],
    }),
    transform(colorize(geo.icosphere({ key: 'catalog-index', radius: 0.031, detail: 1 }), parameters.accent, 'catalog-index-color'), 'catalog-index-position', [0, 0.33, 0]),
  ], { key: 'catalog-assembly' })
})

const workflowVisual = defineGeometry<DeploymentVisualParameters>('health.workflow-visual', parameters => {
  const nodeCount = Math.max(4, Math.min(7, parameters.podCount + 2))
  const points = Array.from({ length: nodeCount }, (_, index) => {
    const unit = nodeCount <= 1 ? 0 : index / (nodeCount - 1)
    const x = (index % 2 === 0 ? -1 : 1) * (0.055 + parameters.stress * 0.025)
    return [x, 0.025 + unit * 0.285, Math.sin(index * 1.7) * 0.025] as const
  })
  const workflowSites = geo.points(points.map((position, index) => ({
    key: `step-${index}`,
    position,
  })))
  const nodes = geo.parameterMap(
    geo.distribute(geo.box({ key: 'workflow-step', width: 0.052, height: 0.052, depth: 0.052 }), workflowSites),
    {
      key: 'workflow-step-colors',
      color: ({ index }) => index === nodeCount - 1
        ? parameters.status
        : index % 2 === 0 ? parameters.primary : parameters.accent,
      scale: ({ index }) => index === nodeCount - 1 ? 1.2 : 0.88 + parameters.readiness * 0.18,
    },
  )

  return geo.join([
    colorize(geo.line({
      key: 'workflow-path',
      points,
      thickness: 0.011,
      radialSegments: 6,
      tubularSegments: nodeCount * 4,
      path: 'smooth',
    }), parameters.primary, 'workflow-path-color'),
    nodes,
  ], { key: 'workflow-assembly' })
})

function circlePoints(radius: number, centerY: number, count: number): Array<readonly [number, number, number]> {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2
    return [Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0] as const
  })
}

const orbitVisual = defineGeometry<DeploymentVisualParameters>('health.orbit-visual', parameters => {
  const satelliteCount = Math.max(5, Math.min(8, parameters.podCount + 3))
  const radius = 0.115 + parameters.activity * 0.018
  const centerY = 0.155
  const satellites = geo.parameterMap(
    geo.distribute(geo.icosphere({ key: 'orbit-satellite', radius: 0.026, detail: 1 }), {
      key: 'orbit-satellites',
      pattern: 'custom',
      count: satelliteCount,
      placement(index, count) {
        const angle = index / count * Math.PI * 2 + (parameters.seed % 17) * 0.025
        return {
          key: `satellite-${index}`,
          position: [Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, Math.sin(angle * 2) * 0.035],
        }
      },
    }),
    {
      key: 'orbit-satellite-colors',
      color: ({ index }) => index % 3 === 0 ? parameters.status : parameters.accent,
    },
  )

  return geo.join([
    colorize(geo.line({
      key: 'orbit-ring',
      points: circlePoints(radius, centerY, 18),
      closed: true,
      path: 'smooth',
      thickness: 0.008,
      radialSegments: 6,
      tubularSegments: 36,
    }), parameters.primary, 'orbit-ring-color'),
    transform(
      colorize(geo.icosphere({ key: 'orbit-core', radius: 0.058, detail: 2 }), parameters.primary, 'orbit-core-color'),
      'orbit-core-position',
      [0, centerY, 0],
      0.9 + parameters.readiness * 0.18,
    ),
    geo.randomize(satellites, { key: 'orbit-variation', seed: parameters.seed, scale: [0.82, 1.18] }),
  ], { key: 'orbit-assembly' })
})

const factories = {
  gateway: gatewayVisual,
  lock: lockVisual,
  catalog: catalogVisual,
  workflow: workflowVisual,
  orbit: orbitVisual,
} as const

export function deploymentVisualKind(id: string): DeploymentVisualKind {
  return knownVisualKinds[id] ?? visualKinds[stableHash(id) % visualKinds.length]
}

export function deploymentVisualFor(deployment: DeploymentViewModel): GeometrySource {
  const seed = stableHash(deployment.id)
  const palette = palettes[seed % palettes.length]
  const readiness = deployment.desiredReplicas <= 0
    ? 0
    : clamp(deployment.readyReplicas / deployment.desiredReplicas)
  const activity = clamp(deployment.metrics.requestsPerSecond / 900)
  const stress = clamp(deployment.metrics.latencyP95Ms / 450 + deployment.metrics.errorRate * 8)
  const parameters: DeploymentVisualParameters = {
    id: deployment.id,
    seed,
    podCount: deployment.pods.length,
    readiness,
    activity,
    stress,
    primary: palette[0],
    accent: palette[1],
    status: statusColor(deployment.status),
  }
  return factories[deploymentVisualKind(deployment.id)](parameters)
}

const stableGraphs = new Map<string, GeometrySource>()

/** A graph whose identity changes only when structure or status changes. */
export function stableDeploymentVisualFor(deployment: DeploymentViewModel): GeometrySource {
  const cacheKey = `${deployment.id}:${deployment.pods.length}:${deployment.status}`
  const existing = stableGraphs.get(cacheKey)
  if (existing) return existing
  const baseline: DeploymentViewModel = {
    ...deployment,
    readyReplicas: deployment.desiredReplicas,
    metrics: {
      ...deployment.metrics,
      requestsPerSecond: 360,
      latencyP95Ms: 80,
      errorRate: 0,
    },
  }
  const graph = geo.transform(deploymentVisualFor(baseline), {
    key: 'health-live-parameters',
    scale: geo.param('visualScale', 1),
    rotate: geo.param('visualRotation', [0, 0, 0] as const),
  })
  stableGraphs.set(cacheKey, graph)
  return graph
}

export function deploymentVisualParametersFor(
  deployment: DeploymentViewModel,
): Readonly<Record<string, unknown>> {
  const readiness = deployment.desiredReplicas <= 0
    ? 0
    : clamp(deployment.readyReplicas / deployment.desiredReplicas)
  const activity = clamp(deployment.metrics.requestsPerSecond / 900)
  const stress = clamp(deployment.metrics.latencyP95Ms / 450 + deployment.metrics.errorRate * 8)
  return {
    visualScale: 0.94 + readiness * 0.04 + activity * 0.05,
    visualRotation: [stress * 0.025, 0, stress * 0.055],
  }
}

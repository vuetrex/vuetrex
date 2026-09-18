import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { compose } from '@/lib-components/composition/index.js'
import { evaluateGeometry } from '@/lib-components/geometry/compiler/evaluator.js'
import { GeometryPrototypeRegistry } from '@/lib-components/geometry/compiler/prototypes.js'
import { geometrySetBounds } from '@/lib-components/geometry/compiler/bounds.js'
import {
  deploymentVisualFor,
  deploymentVisualParametersFor,
  deploymentVisualKind,
  stableDeploymentVisualFor,
} from '../../demo-health/v-ui/geometry/deploymentVisual.js'
import { researchNodeIds } from '../../demo-health/v-ui/model/sceneModel.js'
import { deploymentRecipe } from '../../demo-health/v-ui/recipes/deploymentRecipe.js'
import type { DeploymentViewModel, RelationViewModel } from '../../demo-health/v-ui/types.js'

function deployment(id: string, overrides: Partial<DeploymentViewModel> = {}): DeploymentViewModel {
  return {
    id,
    name: id,
    namespace: 'research',
    domain: 'commerce',
    team: 'platform',
    createdAt: 0,
    desiredReplicas: 3,
    currentReplicas: 3,
    readyReplicas: 3,
    status: 'healthy',
    metrics: {
      requestsPerSecond: 320,
      cpuCores: 1.2,
      memoryMb: 1024,
      latencyP95Ms: 90,
      errorRate: 0.002,
    },
    pods: Array.from({ length: 3 }, (_, ordinal) => ({
      id: `${id}-${ordinal}`,
      ordinal,
      ready: true,
      phase: 'Running',
      restarts: 0,
      metrics: { cpuCores: 0.4, memoryMb: 320 },
    })),
    ...overrides,
  }
}

describe('health deployment procedural visuals', () => {
  it('keeps radial placements anchored on the gateway when visual selection changes', () => {
    const deployments = researchNodeIds.map(id => deployment(id))
    const relations: RelationViewModel[] = [
      {
        id: 'gateway:auth',
        from: 'edge-gateway',
        to: 'auth-api',
        protocol: 'http',
        kind: 'request',
        renderer: 'particles',
        layout: 'orthogonal',
      },
      {
        id: 'orders:payments',
        from: 'orders-api',
        to: 'payments-api',
        protocol: 'grpc',
        kind: 'request',
        renderer: 'particles',
        layout: 'direct',
      },
    ]
    const data = { deployments, relations }
    const context = { parameters: { pattern: 'radial' } }
    const before = compose(deploymentRecipe, data, {
      ...context,
      selectedId: 'edge-gateway',
    }).fragment.nodes
    const after = compose(deploymentRecipe, data, {
      ...context,
      selectedId: 'orders-api',
    }).fragment.nodes

    expect(after.map(node => ({
      id: node.id,
      position: node.placement.position.toArray(),
      scale: node.placement.scale.toArray(),
    }))).toEqual(before.map(node => ({
      id: node.id,
      position: node.placement.position.toArray(),
      scale: node.placement.scale.toArray(),
    })))
    expect(after.find(node => node.id === 'edge-gateway')?.placement.position.toArray()).toEqual([0, 0, 0])
  })

  it('assigns every displayed deployment a different procedural motif', () => {
    const kinds = researchNodeIds.map(deploymentVisualKind)
    expect(new Set(kinds).size).toBe(researchNodeIds.length)
    expect(kinds).toEqual(['gateway', 'lock', 'catalog', 'workflow', 'orbit'])
  })

  it('evaluates every motif into a compact, non-empty geometry set', () => {
    for (const id of researchNodeIds) {
      const prototypes = new GeometryPrototypeRegistry()
      prototypes.beginCompilation()
      const set = evaluateGeometry(deploymentVisualFor(deployment(id)), prototypes)
      const bounds = geometrySetBounds(set)

      expect(set.records.length).toBeGreaterThan(2)
      expect(bounds.isEmpty()).toBe(false)
      const size = bounds.getSize(new Vector3())
      expect(size.x).toBeLessThan(0.45)
      expect(size.y).toBeLessThan(0.45)
      prototypes.endCompilation()
      prototypes.dispose()
    }
  })

  it('reacts to deployment replica and metric changes', () => {
    const calm = deployment('orders-api')
    const stressed = deployment('orders-api', {
      desiredReplicas: 6,
      currentReplicas: 6,
      readyReplicas: 2,
      status: 'degraded',
      metrics: { ...calm.metrics, requestsPerSecond: 1100, latencyP95Ms: 420, errorRate: 0.08 },
      pods: Array.from({ length: 6 }, (_, ordinal) => ({
        id: `orders-api-${ordinal}`,
        ordinal,
        ready: ordinal < 2,
        phase: 'Running',
        restarts: ordinal,
        metrics: { cpuCores: 0.8, memoryMb: 720 },
      })),
    })

    const calmSet = evaluateGeometry(deploymentVisualFor(calm))
    const stressedSet = evaluateGeometry(deploymentVisualFor(stressed))
    expect(stressedSet.records.length).toBeGreaterThan(calmSet.records.length)
    expect(stressedSet.records.some(record => record.color.getHex() === 0xd99a35)).toBe(true)
  })

  it('keeps the authored graph stable across continuous metric updates', () => {
    const calm = deployment('payments-api')
    const busy = deployment('payments-api', {
      metrics: { ...calm.metrics, requestsPerSecond: 850, latencyP95Ms: 300, errorRate: 0.03 },
    })

    expect(stableDeploymentVisualFor(calm)).toBe(stableDeploymentVisualFor(busy))
    expect(deploymentVisualParametersFor(calm)).not.toEqual(deploymentVisualParametersFor(busy))
  })
})

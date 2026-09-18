import { Vector3 } from 'three'
import {
  encode,
  radialFocus,
  row,
  timeline,
  type RepresentationRecipe,
  type SpatialContext,
} from '@/lib-components/index.js'
import type { CompositionPattern, DeploymentViewModel, RelationViewModel } from '../types.js'

type Deployments = readonly DeploymentViewModel[]
interface DeploymentComposition {
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
}

function patternOf(context: SpatialContext): CompositionPattern {
  const pattern = context.parameters?.pattern
  return pattern === 'row' || pattern === 'temporal' ? pattern : 'radial'
}

export const deploymentRecipe: RepresentationRecipe<
  { deployments: Deployments, relations: readonly RelationViewModel[] },
  DeploymentComposition,
  DeploymentComposition,
  DeploymentViewModel
> = {
  select(data) {
    // Keep known deployments in the composition while they start. Vue controls
    // visibility separately, so their spatial slots remain stable over time.
    const deployments = [...data.deployments]
    const activeIds = new Set(deployments.map(deployment => deployment.id))
    const relations = data.relations.filter(relation =>
      activeIds.has(relation.from) && activeIds.has(relation.to),
    )
    return { deployments, relations }
  },

  aggregate(data) {
    // Insertion point for groupBy(namespace), summaries, or topology reduction.
    return data
  },

  arrange(data, context) {
    const pattern = patternOf(context)
    if (pattern === 'row') return row(data.deployments, context, { gap: 1.95 })
    if (pattern === 'temporal') {
      return timeline(data.deployments, context, {
        gap: 1.05,
        rise: 0.1,
        scale: new Vector3(0.88, 0.88, 0.88),
      }).map((placement, index) => {
        placement.position.x += index % 2 === 0 ? -0.72 : 0.72
        return placement
      })
    }
    // Selection is an inspection/style concern in this demo. Keep the spatial
    // topology anchored on the gateway so clicking a deployment never changes
    // ring membership, scale, or connector endpoints.
    const focusContext = { ...context, selectedId: 'edge-gateway' }
    return radialFocus(data.deployments, focusContext, {
      id: deployment => deployment.id,
      relations: data.relations,
      innerRadius: 2.15,
      outerRadius: 3.35,
      startAngle: -Math.PI / 2,
      faceCenter: false,
      centerScale: new Vector3(1.3, 1.3, 1.3),
      innerScale: new Vector3(0.88, 0.88, 0.88),
      outerScale: new Vector3(0.76, 0.76, 0.76),
    })
  },

  emit(data, placements) {
    return encode(data.deployments, placements, {
      id: deployment => deployment.id,
      representation: 'health/deployment',
      props: deployment => ({
        status: deployment.status,
        replicas: deployment.currentReplicas,
      }),
    })
  },

  capabilities: [
    { type: 'select', target: 'node' },
    { type: 'inspect', target: 'instance' },
    { type: 'focus', target: 'node' },
    { type: 'restart', target: 'scene' },
    { type: 'pause', target: 'scene' },
    { type: 'animate', target: 'node' },
  ],
}

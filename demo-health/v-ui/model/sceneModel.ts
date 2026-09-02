import { computed, type Ref, type ShallowRef } from 'vue'
import type {
  CatalogDeployment,
  DeploymentSnapshot,
  DeploymentViewModel,
  HealthCatalog,
  HealthSnapshot,
  MetricDeploymentSample,
  MetricSample,
  RelationViewModel,
} from '../types.js'

export const researchNodeIds = [
  'edge-gateway',
  'auth-api',
  'catalog-api',
  'orders-api',
  'payments-api',
] as const

const emptyMetrics = {
  requestsPerSecond: 0,
  cpuCores: 0,
  memoryMb: 0,
  latencyP95Ms: 0,
  errorRate: 0,
}

function fromSnapshot(item: DeploymentSnapshot): DeploymentViewModel {
  return {
    ...item,
    pods: item.pods.map(pod => ({
      id: pod.id,
      ordinal: pod.ordinal,
      ready: pod.ready,
      phase: pod.phase,
      restarts: pod.restarts,
      metrics: pod.metrics,
    })),
  }
}

function fromMetric(definition: CatalogDeployment, sample: MetricDeploymentSample): DeploymentViewModel {
  return {
    id: definition.id,
    name: definition.id,
    namespace: definition.namespace,
    domain: definition.domain,
    team: definition.team,
    createdAt: 0,
    desiredReplicas: sample.desiredReplicas,
    currentReplicas: sample.pods.length,
    readyReplicas: sample.readyReplicas,
    status: sample.status,
    metrics: sample.metrics ?? emptyMetrics,
    pods: sample.pods.map((pod, ordinal) => ({ ...pod, ordinal })),
  }
}

function fromDefinition(definition: CatalogDeployment): DeploymentViewModel {
  return {
    id: definition.id,
    name: definition.id,
    namespace: definition.namespace,
    domain: definition.domain,
    team: definition.team,
    createdAt: 0,
    desiredReplicas: definition.replicas,
    currentReplicas: 0,
    readyReplicas: 0,
    status: 'unavailable',
    metrics: emptyMetrics,
    pods: [],
  }
}

export function useResearchScene(
  catalog: ShallowRef<HealthCatalog | null>,
  snapshot: ShallowRef<HealthSnapshot | null>,
  metrics: ShallowRef<MetricSample | null>,
  selectedId: Ref<string>,
) {
  const deployments = computed<DeploymentViewModel[]>(() => {
    const definitions = new Map(catalog.value?.deployments.map(item => [item.id, item]))
    const snapshots = new Map(snapshot.value?.deployments.map(item => [item.id, item]))
    const samples = new Map(metrics.value?.deployments.map(item => [item.id, item]))

    return researchNodeIds.flatMap(id => {
      const sample = samples.get(id)
      const definition = definitions.get(id)
      if (sample && definition) return [fromMetric(definition, sample)]

      const item = snapshots.get(id)
      if (item) return [fromSnapshot(item)]
      return definition ? [fromDefinition(definition)] : []
    })
  })

  const relations = computed<RelationViewModel[]>(() => {
    const activeIds = new Set(deployments.value.map(item => item.id))
    return (catalog.value?.relations ?? [])
      .filter(relation => activeIds.has(relation.from) && activeIds.has(relation.to))
      .map(relation => ({
        ...relation,
        renderer: relation.kind === 'request' ? 'particles' : 'line',
        layout: relation.protocol === 'grpc' ? 'direct' : 'orthogonal',
      }))
  })

  const selected = computed(() => deployments.value.find(item => item.id === selectedId.value) ?? null)

  return { deployments, relations, selected }
}

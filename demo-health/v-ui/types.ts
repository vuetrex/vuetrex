export type HealthStatus = 'healthy' | 'degraded' | 'unavailable'
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
export type CompositionPattern = 'row' | 'radial' | 'temporal'
export type WallDisplayMode = 'continuous' | 'displays'

export interface RenderFeatures {
  floorGrid: boolean
  floorMirror: boolean
  floorCaptions: boolean
  shadows: boolean
}

export interface ScenarioDefinition {
  id: string
  label: string
  description: string
}

export interface ControlState {
  t: number
  playing: boolean
  rate: number
  scenario: string
  revision: number
  availableScenarios: ScenarioDefinition[]
}

export interface MetricValues {
  requestsPerSecond: number
  cpuCores: number
  memoryMb: number
  latencyP95Ms: number
  errorRate: number
}

export interface PodMetricValues {
  cpuCores: number
  memoryMb: number
}

export interface PodSnapshot {
  id: string
  name: string
  deploymentId: string
  namespace: string
  ordinal: number
  zone: string
  node: string
  phase: string
  ready: boolean
  restarts: number
  createdAt: number
  metrics: PodMetricValues
}

export interface DeploymentSnapshot {
  id: string
  name: string
  namespace: string
  domain: string
  team: string
  createdAt: number
  desiredReplicas: number
  currentReplicas: number
  readyReplicas: number
  status: HealthStatus
  metrics: MetricValues
  pods: PodSnapshot[]
}

export interface RelationDefinition {
  id: string
  from: string
  to: string
  protocol: string
  kind: string
}

export interface HealthSnapshot {
  schemaVersion: number
  cluster: {
    id: string
    name: string
    expectedDeployments: number
    expectedPods: number
  }
  t: number
  scenario: string
  phase: 'starting' | 'steady' | 'incident'
  summary: {
    deployments: number
    pods: number
    readyPods: number
    health: Record<HealthStatus, number>
  }
  deployments: DeploymentSnapshot[]
  relations: RelationDefinition[]
}

export interface CatalogDeployment {
  id: string
  namespace: string
  domain: string
  team: string
  replicas: number
  baseline: {
    rps: number
    cpu: number
    memoryMb: number
    latencyMs: number
  }
}

export interface HealthCatalog {
  schemaVersion: number
  clusterId: string
  deployments: CatalogDeployment[]
  relations: RelationDefinition[]
  scenarios: ScenarioDefinition[]
}

export interface MetricPodSample {
  id: string
  ready: boolean
  phase: string
  restarts: number
  metrics: PodMetricValues
}

export interface MetricDeploymentSample {
  id: string
  status: HealthStatus
  desiredReplicas: number
  readyReplicas: number
  metrics: MetricValues
  pods: MetricPodSample[]
}

export interface MetricSample {
  schemaVersion: number
  t: number
  scenario: string
  summary: HealthSnapshot['summary']
  deployments: MetricDeploymentSample[]
}

export interface HealthEvent {
  id: string
  sequence: number
  t: number
  type: 'ADDED' | 'MODIFIED'
  reason: string
  severity: 'info' | 'warning' | 'critical'
  resource: {
    kind: string
    id: string
    namespace?: string
  }
  message: string
}

export interface TimelinePatch {
  t?: number
  playing?: boolean
  rate?: number
  scenario?: string
}

export interface DeploymentViewModel extends Omit<DeploymentSnapshot, 'pods'> {
  pods: Array<MetricPodSample & { ordinal: number }>
}

export interface RelationViewModel extends RelationDefinition {
  renderer: 'line' | 'particles'
  layout: 'direct' | 'orthogonal'
}

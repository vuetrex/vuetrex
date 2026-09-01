const CLUSTER_ID = 'vuetrex-lab'
const DEFAULT_SCENARIO = 'normal'

const deployment = (id, namespace, domain, team, replicas, rps, cpu, memoryMb, latencyMs) => ({
    id,
    namespace,
    domain,
    team,
    replicas,
    baseline: { rps, cpu, memoryMb, latencyMs },
})

export const DEPLOYMENTS = Object.freeze([
    deployment('edge-gateway', 'edge', 'ingress', 'platform', 3, 1250, 0.34, 310, 24),
    deployment('web-frontend', 'edge', 'experience', 'web', 3, 860, 0.27, 260, 31),
    deployment('auth-api', 'core', 'identity', 'security', 2, 420, 0.31, 420, 42),
    deployment('catalog-api', 'core', 'catalog', 'commerce', 3, 790, 0.38, 510, 47),
    deployment('orders-api', 'core', 'orders', 'commerce', 3, 610, 0.44, 620, 58),
    deployment('payments-api', 'core', 'payments', 'payments', 2, 330, 0.37, 580, 71),
    deployment('inventory-api', 'core', 'inventory', 'supply', 2, 510, 0.29, 460, 39),
    deployment('recommendation-api', 'intelligence', 'recommendations', 'ml-platform', 2, 270, 0.61, 920, 96),
    deployment('notification-worker', 'workers', 'notifications', 'engagement', 2, 240, 0.26, 350, 68),
    deployment('event-router', 'streaming', 'events', 'platform', 3, 2400, 0.48, 690, 18),
    deployment('fraud-worker', 'workers', 'risk', 'payments', 2, 310, 0.52, 780, 84),
    deployment('shipping-worker', 'workers', 'fulfilment', 'supply', 2, 180, 0.24, 390, 76),
    deployment('search-indexer', 'workers', 'search', 'commerce', 2, 460, 0.57, 830, 113),
    deployment('session-cache', 'data', 'cache', 'platform', 3, 1800, 0.22, 740, 7),
    deployment('postgres-proxy', 'data', 'database', 'data', 2, 1320, 0.33, 540, 14),
    deployment('telemetry-collector', 'observability', 'telemetry', 'sre', 2, 3200, 0.42, 660, 12),
    deployment('metrics-adapter', 'observability', 'metrics', 'sre', 2, 2100, 0.36, 490, 16),
    deployment('trace-collector', 'observability', 'tracing', 'sre', 2, 1900, 0.45, 710, 22),
    deployment('health-api', 'observability', 'health', 'sre', 2, 140, 0.18, 280, 29),
    deployment('ops-console', 'operations', 'operations', 'sre', 2, 95, 0.16, 320, 36),
])

const relation = (from, to, protocol, kind = 'request') => ({
    id: `${from}:${to}:${kind}`,
    from,
    to,
    protocol,
    kind,
})

export const RELATIONS = Object.freeze([
    relation('web-frontend', 'edge-gateway', 'https'),
    relation('edge-gateway', 'auth-api', 'http'),
    relation('edge-gateway', 'catalog-api', 'http'),
    relation('edge-gateway', 'orders-api', 'http'),
    relation('catalog-api', 'inventory-api', 'grpc'),
    relation('catalog-api', 'recommendation-api', 'grpc'),
    relation('orders-api', 'payments-api', 'grpc'),
    relation('orders-api', 'inventory-api', 'grpc'),
    relation('orders-api', 'event-router', 'kafka', 'publish'),
    relation('payments-api', 'fraud-worker', 'kafka', 'publish'),
    relation('event-router', 'notification-worker', 'kafka', 'consume'),
    relation('event-router', 'shipping-worker', 'kafka', 'consume'),
    relation('event-router', 'search-indexer', 'kafka', 'consume'),
    relation('auth-api', 'session-cache', 'redis'),
    relation('catalog-api', 'session-cache', 'redis'),
    relation('auth-api', 'postgres-proxy', 'postgres'),
    relation('orders-api', 'postgres-proxy', 'postgres'),
    relation('payments-api', 'postgres-proxy', 'postgres'),
    relation('inventory-api', 'postgres-proxy', 'postgres'),
    relation('telemetry-collector', 'metrics-adapter', 'otlp', 'telemetry'),
    relation('telemetry-collector', 'trace-collector', 'otlp', 'telemetry'),
    relation('metrics-adapter', 'health-api', 'http', 'telemetry'),
    relation('trace-collector', 'health-api', 'http', 'telemetry'),
    relation('health-api', 'ops-console', 'sse', 'telemetry'),
])

export const SCENARIOS = Object.freeze([
    {
        id: 'normal',
        label: 'Normal startup',
        description: 'Controlled startup followed by steady operation.',
    },
    {
        id: 'traffic-spike',
        label: 'Checkout traffic spike',
        description: 'Load begins at t=120, saturates checkout services, and recovers after t=240.',
    },
    {
        id: 'zone-outage',
        label: 'Zone B outage',
        description: 'Zone B becomes unavailable at t=120 and pods recover between t=210 and t=235.',
    },
    {
        id: 'memory-leak',
        label: 'Recommendation memory leak',
        description: 'Recommendation memory grows after t=120, causes an OOM restart, then stabilizes.',
    },
])

const scenarioIds = new Set(SCENARIOS.map(scenario => scenario.id))
const zones = ['zone-a', 'zone-b', 'zone-c']

const hash = value => {
    let result = 2166136261
    for (const char of value) {
        result ^= char.charCodeAt(0)
        result = Math.imul(result, 16777619)
    }
    return result >>> 0
}

const round = (value, precision = 3) => Number(value.toFixed(precision))
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const smoothstep = (from, to, value) => {
    const x = clamp((value - from) / (to - from), 0, 1)
    return x * x * (3 - 2 * x)
}

const wave = (id, t, period, amplitude = 1) => {
    const phase = (hash(id) % 1000) / 1000 * Math.PI * 2
    return Math.sin(t / period * Math.PI * 2 + phase) * amplitude
}

const deploymentPlan = DEPLOYMENTS.map((definition, deploymentIndex) => {
    const createdAt = Math.floor(deploymentIndex / 2) * 4
    const pods = Array.from({ length: definition.replicas }, (_, ordinal) => {
        const id = `${definition.id}-${ordinal}`
        const podCreatedAt = createdAt + 1 + ordinal * 2
        const scheduledAt = podCreatedAt + 1
        const startedAt = scheduledAt + 2 + hash(id) % 3
        const readyAt = startedAt + 2
        const zone = zones[(deploymentIndex + ordinal) % zones.length]
        return {
            id,
            ordinal,
            createdAt: podCreatedAt,
            scheduledAt,
            startedAt,
            readyAt,
            zone,
            node: `${zone}-node-${1 + hash(id) % 3}`,
        }
    })
    return { ...definition, createdAt, pods }
})

const scenarioWindow = (scenario, t) => {
    if (scenario === 'traffic-spike') {
        const rise = smoothstep(120, 150, t)
        const fall = 1 - smoothstep(220, 270, t)
        return rise * fall
    }
    if (scenario === 'zone-outage') {
        const failure = smoothstep(120, 126, t)
        const recovery = 1 - smoothstep(210, 235, t)
        return failure * recovery
    }
    if (scenario === 'memory-leak') {
        const growth = smoothstep(120, 190, t)
        const recovery = 1 - smoothstep(205, 255, t)
        return growth * recovery
    }
    return 0
}

const isPodReady = (pod, t, scenario) => {
    if (t < pod.readyAt) return false
    if (scenario === 'zone-outage' && pod.zone === 'zone-b' && t >= 126 && t < 235) return false
    if (scenario === 'traffic-spike' && pod.id === 'payments-api-0' && t >= 165 && t < 184) return false
    if (scenario === 'memory-leak' && pod.id === 'recommendation-api-0' && t >= 190 && t < 210) return false
    return true
}

const podPhase = (pod, t, scenario) => {
    if (scenario === 'zone-outage' && pod.zone === 'zone-b' && t >= 126 && t < 210) return 'Unknown'
    if (!isPodReady(pod, t, scenario) && t >= pod.readyAt) return 'CrashLoopBackOff'
    if (t < pod.scheduledAt) return 'Pending'
    if (t < pod.startedAt) return 'ContainerCreating'
    return 'Running'
}

const scenarioMetricImpact = (deploymentId, t, scenario) => {
    const intensity = scenarioWindow(scenario, t)
    const impact = { traffic: 1, cpu: 0, memoryMb: 0, latency: 1, errors: 0 }

    if (scenario === 'traffic-spike') {
        const affected = ['edge-gateway', 'catalog-api', 'orders-api', 'payments-api', 'fraud-worker']
        if (affected.includes(deploymentId)) {
            impact.traffic = 1 + intensity * (deploymentId === 'edge-gateway' ? 3.5 : 2.4)
            impact.cpu = intensity * 0.48
            impact.latency = 1 + intensity * (deploymentId === 'payments-api' ? 7 : 4)
            impact.errors = intensity * (deploymentId === 'payments-api' ? 0.16 : 0.055)
        }
    }

    if (scenario === 'zone-outage') {
        impact.traffic = 1 + intensity * 0.25
        impact.cpu = intensity * 0.18
        impact.latency = 1 + intensity * 2.2
        impact.errors = intensity * 0.075
    }

    if (scenario === 'memory-leak' && deploymentId === 'recommendation-api') {
        impact.memoryMb = intensity * 1450
        impact.cpu = intensity * 0.21
        impact.latency = 1 + intensity * 3.8
        impact.errors = intensity * 0.12
    }

    return impact
}

const deploymentMetrics = (plan, t, scenario, readyRatio) => {
    const baseline = plan.baseline
    const startup = smoothstep(plan.createdAt, plan.createdAt + 18, t) * readyRatio
    const impact = scenarioMetricImpact(plan.id, t, scenario)
    const trafficWave = 1 + wave(`${plan.id}:rps`, t, 37, 0.08)
    const cpuWave = wave(`${plan.id}:cpu`, t, 29, 0.035)
    const memoryWave = wave(`${plan.id}:memory`, t, 53, 18)
    const latencyWave = 1 + wave(`${plan.id}:latency`, t, 43, 0.09)

    return {
        requestsPerSecond: round(baseline.rps * startup * impact.traffic * trafficWave, 1),
        cpuCores: round(clamp((baseline.cpu + cpuWave + impact.cpu) * startup, 0, 1.8)),
        memoryMb: round(Math.max(0, (baseline.memoryMb + memoryWave + impact.memoryMb) * startup), 1),
        latencyP95Ms: round(baseline.latencyMs * latencyWave * impact.latency, 1),
        errorRate: round(clamp(0.0015 + Math.max(0, wave(`${plan.id}:errors`, t, 31, 0.001)) + impact.errors, 0, 1), 4),
    }
}

const deploymentStatus = (readyReplicas, desiredReplicas, metrics) => {
    if (readyReplicas === 0) return 'unavailable'
    if (readyReplicas < desiredReplicas || metrics.errorRate >= 0.03 || metrics.latencyP95Ms >= 350) return 'degraded'
    return 'healthy'
}

const podRestarts = (pod, t, scenario) => {
    if (scenario === 'traffic-spike' && pod.id === 'payments-api-0' && t >= 165) return t < 184 ? 3 : 4
    if (scenario === 'memory-leak' && pod.id === 'recommendation-api-0' && t >= 190) return 1
    if (scenario === 'zone-outage' && pod.zone === 'zone-b' && t >= 210) return 1
    return 0
}

const buildDeployment = (plan, t, scenario) => {
    const visiblePods = plan.pods.filter(pod => t >= pod.createdAt)
    const readyReplicas = visiblePods.filter(pod => isPodReady(pod, t, scenario)).length
    const metrics = deploymentMetrics(plan, t, scenario, readyReplicas / plan.replicas)
    const status = deploymentStatus(readyReplicas, plan.replicas, metrics)

    const pods = visiblePods.map(pod => {
        const ready = isPodReady(pod, t, scenario)
        const podShare = readyReplicas > 0 && ready ? 1 / readyReplicas : 0
        return {
            id: pod.id,
            name: pod.id,
            deploymentId: plan.id,
            namespace: plan.namespace,
            ordinal: pod.ordinal,
            zone: pod.zone,
            node: pod.node,
            phase: podPhase(pod, t, scenario),
            ready,
            restarts: podRestarts(pod, t, scenario),
            createdAt: pod.createdAt,
            metrics: {
                cpuCores: round(metrics.cpuCores * podShare * (1 + wave(pod.id, t, 23, 0.08))),
                memoryMb: round(metrics.memoryMb * podShare * (1 + wave(`${pod.id}:memory`, t, 41, 0.05)), 1),
            },
        }
    })

    return {
        id: plan.id,
        name: plan.id,
        namespace: plan.namespace,
        domain: plan.domain,
        team: plan.team,
        createdAt: plan.createdAt,
        desiredReplicas: plan.replicas,
        currentReplicas: visiblePods.length,
        readyReplicas,
        status,
        metrics,
        pods,
    }
}

const startupEvents = deploymentPlan.flatMap(plan => [
    {
        t: plan.createdAt,
        type: 'ADDED',
        reason: 'DeploymentCreated',
        severity: 'info',
        resource: { kind: 'Deployment', id: plan.id, namespace: plan.namespace },
        message: `Deployment ${plan.id} created with ${plan.replicas} desired replicas.`,
    },
    ...plan.pods.flatMap(pod => [
        {
            t: pod.createdAt,
            type: 'ADDED',
            reason: 'PodCreated',
            severity: 'info',
            resource: { kind: 'Pod', id: pod.id, namespace: plan.namespace },
            message: `Pod ${pod.id} created.`,
        },
        {
            t: pod.scheduledAt,
            type: 'MODIFIED',
            reason: 'Scheduled',
            severity: 'info',
            resource: { kind: 'Pod', id: pod.id, namespace: plan.namespace },
            message: `Pod ${pod.id} assigned to ${pod.node}.`,
        },
        {
            t: pod.startedAt,
            type: 'MODIFIED',
            reason: 'Started',
            severity: 'info',
            resource: { kind: 'Pod', id: pod.id, namespace: plan.namespace },
            message: `Container started for ${pod.id}.`,
        },
        {
            t: pod.readyAt,
            type: 'MODIFIED',
            reason: 'Ready',
            severity: 'info',
            resource: { kind: 'Pod', id: pod.id, namespace: plan.namespace },
            message: `Pod ${pod.id} is ready.`,
        },
    ]),
])

const scenarioEvents = {
    normal: [],
    'traffic-spike': [
        [120, 'TrafficSpike', 'warning', 'Deployment', 'edge-gateway', 'Checkout traffic began rising above the normal envelope.'],
        [135, 'SLOViolation', 'warning', 'Deployment', 'orders-api', 'Orders p95 latency exceeded the service objective.'],
        [165, 'CrashLoopBackOff', 'critical', 'Pod', 'payments-api-0', 'Payments pod entered CrashLoopBackOff under load.'],
        [184, 'PodRecovered', 'warning', 'Pod', 'payments-api-0', 'Payments pod became ready after four restarts.'],
        [220, 'TrafficNormalizing', 'info', 'Deployment', 'edge-gateway', 'Incoming traffic began returning to baseline.'],
        [270, 'Recovered', 'info', 'Deployment', 'orders-api', 'Checkout services returned to their normal operating envelope.'],
    ],
    'zone-outage': [
        [120, 'NodeNotReady', 'critical', 'Node', 'zone-b', 'All nodes in zone-b stopped reporting heartbeats.'],
        [126, 'PodsUnavailable', 'critical', 'Zone', 'zone-b', 'Workloads in zone-b became unavailable.'],
        [150, 'TrafficShifted', 'warning', 'Zone', 'zone-b', 'Traffic was shifted to zone-a and zone-c.'],
        [210, 'NodeReady', 'warning', 'Node', 'zone-b', 'Nodes in zone-b resumed reporting heartbeats.'],
        [235, 'PodsRecovered', 'info', 'Zone', 'zone-b', 'Replacement pods in zone-b became ready.'],
    ],
    'memory-leak': [
        [120, 'MemoryGrowth', 'warning', 'Deployment', 'recommendation-api', 'Recommendation memory began growing outside its baseline.'],
        [170, 'MemoryPressure', 'warning', 'Pod', 'recommendation-api-0', 'Recommendation pod approached its memory limit.'],
        [190, 'OOMKilled', 'critical', 'Pod', 'recommendation-api-0', 'Recommendation pod was terminated after exceeding its memory limit.'],
        [210, 'PodRecovered', 'warning', 'Pod', 'recommendation-api-0', 'Recommendation pod restarted and became ready.'],
        [255, 'Recovered', 'info', 'Deployment', 'recommendation-api', 'Recommendation memory returned to its normal envelope.'],
    ],
}

const materializeEvents = scenario => {
    const incidentEvents = scenarioEvents[scenario].map(([t, reason, severity, kind, id, message]) => ({
        t,
        type: 'MODIFIED',
        reason,
        severity,
        resource: { kind, id },
        message,
    }))

    return [...startupEvents, ...incidentEvents]
        .sort((a, b) => a.t - b.t || a.resource.id.localeCompare(b.resource.id) || a.reason.localeCompare(b.reason))
        .map((event, index) => ({
            id: `evt-${String(index + 1).padStart(4, '0')}`,
            sequence: index + 1,
            ...event,
        }))
}

const eventCache = new Map()

export function eventsBetween(fromExclusive, toInclusive, scenario = DEFAULT_SCENARIO) {
    assertScenario(scenario)
    const from = Number.isFinite(fromExclusive) ? fromExclusive : -1
    const to = Number.isFinite(toInclusive) ? toInclusive : 0
    if (!eventCache.has(scenario)) eventCache.set(scenario, materializeEvents(scenario))
    return eventCache.get(scenario).filter(event => event.t > from && event.t <= to)
}

export function snapshotAt(time, scenario = DEFAULT_SCENARIO) {
    assertScenario(scenario)
    const t = normalizeTime(time)
    const deployments = deploymentPlan
        .filter(plan => t >= plan.createdAt)
        .map(plan => buildDeployment(plan, t, scenario))
    const pods = deployments.flatMap(item => item.pods)
    const readyPods = pods.filter(pod => pod.ready).length
    const healthCounts = deployments.reduce((counts, item) => {
        counts[item.status]++
        return counts
    }, { healthy: 0, degraded: 0, unavailable: 0 })

    return {
        schemaVersion: 1,
        cluster: {
            id: CLUSTER_ID,
            name: 'Vuetrex Health Lab',
            expectedDeployments: DEPLOYMENTS.length,
            expectedPods: deploymentPlan.reduce((count, plan) => count + plan.replicas, 0),
        },
        t,
        scenario,
        phase: t < 60 ? 'starting' : scenarioWindow(scenario, t) > 0 ? 'incident' : 'steady',
        summary: {
            deployments: deployments.length,
            pods: pods.length,
            readyPods,
            health: healthCounts,
        },
        deployments,
        relations: RELATIONS,
    }
}

export function metricsAt(time, scenario = DEFAULT_SCENARIO) {
    const snapshot = snapshotAt(time, scenario)
    return {
        schemaVersion: snapshot.schemaVersion,
        t: snapshot.t,
        scenario: snapshot.scenario,
        summary: snapshot.summary,
        deployments: snapshot.deployments.map(item => ({
            id: item.id,
            status: item.status,
            desiredReplicas: item.desiredReplicas,
            readyReplicas: item.readyReplicas,
            metrics: item.metrics,
            pods: item.pods.map(pod => ({
                id: pod.id,
                ready: pod.ready,
                phase: pod.phase,
                restarts: pod.restarts,
                metrics: pod.metrics,
            })),
        })),
    }
}

export function catalog() {
    return {
        schemaVersion: 1,
        clusterId: CLUSTER_ID,
        deployments: DEPLOYMENTS,
        relations: RELATIONS,
        scenarios: SCENARIOS,
    }
}

export function normalizeTime(value) {
    const time = Number(value)
    if (!Number.isFinite(time) || time < 0 || time > 86_400) {
        throw new RangeError('t must be a finite number between 0 and 86400 seconds')
    }
    return round(time)
}

export function assertScenario(value) {
    if (!scenarioIds.has(value)) {
        throw new RangeError(`scenario must be one of: ${[...scenarioIds].join(', ')}`)
    }
}

export function validateStatePatch(input, currentState) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('request body must be a JSON object')
    }

    const allowed = new Set(['t', 'playing', 'rate', 'scenario'])
    const unknown = Object.keys(input).filter(key => !allowed.has(key))
    if (unknown.length) throw new TypeError(`unknown state field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`)

    const result = { ...currentState }
    if ('t' in input) result.t = normalizeTime(input.t)
    if ('playing' in input) {
        if (typeof input.playing !== 'boolean') throw new TypeError('playing must be a boolean')
        result.playing = input.playing
    }
    if ('rate' in input) {
        const rate = Number(input.rate)
        if (!Number.isFinite(rate) || rate < 0.1 || rate > 20) {
            throw new RangeError('rate must be between 0.1 and 20')
        }
        result.rate = round(rate)
    }
    if ('scenario' in input) {
        assertScenario(input.scenario)
        result.scenario = input.scenario
    }
    return result
}


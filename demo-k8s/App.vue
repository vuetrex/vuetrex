<template>
  <main class="app-shell">
    <header class="toolbar">
      <div>
        <p class="eyebrow">VUETREX LIVE ARCHITECTURE</p>
        <h1>Intelligent Transit Control Plane</h1>
      </div>
      <div class="toolbar-actions">
        <span class="status-dot"><i /> mobility cluster healthy</span>
        <button type="button" @click="flowPaused = !flowPaused">
          {{ flowPaused ? 'Resume telemetry' : 'Pause telemetry' }}
        </button>
        <button type="button" @click="pulseTelemetry">Telemetry surge</button>
        <button type="button" @click="camera = 'scene'">Overview</button>
      </div>
    </header>

    <section class="scene-wrap">
      <Vuetrex
        height="calc(100vh - 108px)"
        width="100%"
        :camera="camera"
        :stopped="flowPaused"
        :settings="settings"
        @ready="onStageReady"
      >
        <vx-layer :scale="0.82" :gap="0">
          <vx-row :gap="0.7">
            <vx-group layout="depth" :gap="0.62">
              <vx-box
                name="city-edge-lb" id="city-edge-lb"
                text="city edge"
                :size="0.26"
                :depth="0.9"
                :height="2.3"
                :material="{ color: 0xbfc8d2, metalness: 0.72, roughness: 0.25 }"
                :hover="{ color: 0xffffff, scale: 1.04, transition: 0.18 }"
                @click="selectNode('city-edge-lb')"
              />

              <K8sPlatform title="City Edge & Ingress" :width="5.3" :depth="3.3">
                <vx-row :gap="0.42">
                  <K8sWorkload v-bind="workload('public-api')" @select="selectNode" />
                  <K8sWorkload v-bind="workload('municipal-feed')" @select="selectNode" />
                  <K8sWorkload v-bind="workload('service-registry')" @select="selectNode" />
                </vx-row>
                <vx-row :gap="0.5">
                  <K8sWorkload v-bind="workload('auth-service')" @select="selectNode" />
                  <K8sWorkload v-bind="workload('notification-dispatcher')" @select="selectNode" />
                  <K8sWorkload v-bind="workload('config-server')" @select="selectNode" />
                </vx-row>
              </K8sPlatform>
            </vx-group>

            <vx-group layout="depth" :gap="0.74">
              <K8sNodeDisplay v-bind="workload('traffic-orchestrator')" :width="1.9" @select="selectNode" />

              <K8sPlatform title="Realtime Streaming" :width="3.6" :depth="5.8">
                <K8sWorkload
                  v-for="id in streamingIds"
                  :key="id"
                  v-bind="workload(id)"
                  :width="2.35"
                  :depth="0.72"
                  @select="selectNode"
                />
              </K8sPlatform>

              <K8sCache v-bind="cache('redis-live')" @select="selectNode" />

              <K8sPlatform title="Transit Intelligence" :width="3.7" :depth="5">
                <K8sWorkload
                  v-for="id in intelligenceIds"
                  :key="id"
                  v-bind="workload(id)"
                  :width="2.4"
                  :depth="0.72"
                  @select="selectNode"
                />
              </K8sPlatform>
            </vx-group>

            <vx-group layout="depth" :gap="0.78">
              <K8sDatabaseColumns v-bind="database('mysql-primary')" :size="1.15" @select="selectNode" />
              <K8sDatabase v-bind="database('mongo-primary')" :size="1.15" @select="selectNode" />
              <K8sCache v-bind="cache('kraft-coordinator')" kind="coordination" :size="1.05" @select="selectNode" />
            </vx-group>

            <K8sPlatform title="Data & Operations" :width="5.5" :depth="5.5">
              <vx-row :gap="0.38">
                <K8sDatabaseColumns v-bind="database('mysql-replica')" :size="1.05" @select="selectNode" />
                <K8sDatabase v-bind="database('mongo-archive')" @select="selectNode" />
                <K8sCache v-bind="cache('redis-replica')" @select="selectNode" />
                <K8sDatabase v-bind="database('cold-snapshots')" @select="selectNode" />
              </vx-row>
              <vx-row :gap="0.45">
                <K8sWorkload v-bind="workload('cron-optimizer')" @select="selectNode" />
                <K8sWorkload v-bind="workload('dlq-handler')" @select="selectNode" />
                <K8sWorkload v-bind="workload('backup-daemon')" @select="selectNode" />
              </vx-row>
              <vx-row :gap="0.45">
                <K8sWorkload v-bind="workload('prometheus')" @select="selectNode" />
                <K8sWorkload v-bind="workload('grafana')" @select="selectNode" />
                <K8sWorkload v-bind="workload('log-aggregator')" @select="selectNode" />
              </vx-row>
              <vx-row :gap="0.45">
                <K8sWorkload v-bind="workload('tracing-agent')" @select="selectNode" />
                <K8sWorkload v-bind="workload('metrics-collector')" @select="selectNode" />
                <K8sWorkload v-bind="workload('health-api')" @select="selectNode" />
              </vx-row>
            </K8sPlatform>
          </vx-row>

        </vx-layer>

        <vx-connectors :graph="connections" />
      </Vuetrex>

      <aside class="legend">
        <strong>Resources</strong>
        <span><i class="swatch workload" /> Deployment / StatefulSet</span>
        <span><i class="cube" /> Pod / replica activity</span>
        <span><i class="swatch database" /> Data service</span>
        <span><i class="swatch cache" /> Cache / coordination</span>
        <strong class="legend-section">Connectors</strong>
        <span><i class="connector-key direct-line" /> Direct line</span>
        <span><i class="connector-key orthogonal-line" /> Orthogonal line</span>
        <span><i class="connector-key direct-particles" /> Direct particles</span>
        <span><i class="connector-key orthogonal-particles" /> Orthogonal particles</span>
      </aside>

      <aside v-if="selected" class="inspector">
        <button class="close" type="button" aria-label="Close inspector" @click="selectedId = ''">×</button>
        <p class="eyebrow">SELECTED RESOURCE</p>
        <h2>{{ selected.label }}</h2>
        <dl>
          <div><dt>Status</dt><dd :class="selected.status">{{ selected.status }}</dd></div>
          <div v-if="'replicas' in selected"><dt>Replicas</dt><dd>{{ selected.replicas }}/{{ selected.desiredReplicas }}</dd></div>
          <div v-if="'throughput' in selected"><dt>Throughput</dt><dd>{{ selected.throughput }} events/s</dd></div>
          <div v-if="'latencyMs' in selected"><dt>p99</dt><dd>{{ selected.latencyMs }} ms</dd></div>
          <div v-if="'load' in selected"><dt>Load</dt><dd>{{ Math.round(selected.load * 100) }}%</dd></div>
        </dl>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Vuetrex, connectors, particles, type VuetrexStage, type VxSettings } from '@/lib-components/index.js'
import K8sCache from './components/K8sCache.vue'
import K8sDatabase from './components/K8sDatabase.vue'
import K8sDatabaseColumns from './components/K8sDatabaseColumns.vue'
import K8sNodeDisplay from './components/K8sNodeDisplay.vue'
import K8sPlatform from './components/K8sPlatform.vue'
import K8sWorkload, { type WorkloadStatus } from './components/K8sWorkload.vue'

interface WorkloadModel {
  id: string
  label: string
  status: WorkloadStatus
  replicas: number
  desiredReplicas: number
  throughput: number
  latencyMs: number
}

interface DatabaseModel {
  id: string
  label: string
  status: WorkloadStatus
  load: number
}

interface CacheModel {
  id: string
  label: string
  status: WorkloadStatus
}

type ResourceModel = WorkloadModel | DatabaseModel | CacheModel

const settings: VxSettings = {
  unit: 1,
  gap: 0.32,
  color: 0x174f88,
  highlightColor: 0x2c9df2,
  floorColor: 0x111923,
  captionColor: 0xd8e5f0,
  lightColor1: 0x79aee8,
  lightColor2: 0xffffff,
  lightColor3: 0x224466,
  mirrorOpacity: 0.8,
}

const makeWorkload = (
  id: string,
  label = id,
  overrides: Partial<WorkloadModel> = {},
): WorkloadModel => {
  const model: WorkloadModel = {
    id,
    label,
    status: 'healthy',
    replicas: 3,
    desiredReplicas: 3,
    throughput: 90,
    latencyMs: 72,
    ...overrides,
  }
  if (overrides.replicas !== undefined && overrides.desiredReplicas === undefined) {
    model.desiredReplicas = overrides.replicas
  }
  return model
}

const workloads = reactive<Record<string, WorkloadModel>>({
  'public-api': makeWorkload('public-api', 'public api', { replicas: 5, throughput: 880, latencyMs: 64 }),
  'municipal-feed': makeWorkload('municipal-feed', 'municipal feed', { replicas: 4, throughput: 1460, latencyMs: 39 }),
  'service-registry': makeWorkload('service-registry', 'service registry', { replicas: 3, throughput: 160 }),
  'auth-service': makeWorkload('auth-service', 'transit auth', { replicas: 3, throughput: 360 }),
  'notification-dispatcher': makeWorkload('notification-dispatcher', 'rider alerts', { replicas: 4, throughput: 520 }),
  'config-server': makeWorkload('config-server', 'config server', { replicas: 2, throughput: 70 }),
  'traffic-orchestrator': makeWorkload('traffic-orchestrator', 'traffic orchestrator', { replicas: 6, throughput: 2400, latencyMs: 44 }),
  'kafka-broker-1': makeWorkload('kafka-broker-1', 'kafka broker 1', { replicas: 3, throughput: 3100 }),
  'kafka-broker-2': makeWorkload('kafka-broker-2', 'kafka broker 2', { replicas: 3, throughput: 2950 }),
  'kafka-broker-3': makeWorkload('kafka-broker-3', 'kafka broker 3', { replicas: 3, throughput: 3050 }),
  'schema-registry': makeWorkload('schema-registry', 'schema registry', { replicas: 2, throughput: 820 }),
  'gps-consumer': makeWorkload('gps-consumer', 'gps consumer', { replicas: 7, throughput: 2700, latencyMs: 31 }),
  'eta-engine': makeWorkload('eta-engine', 'eta engine', { replicas: 6, throughput: 1850, latencyMs: 52 }),
  'anomaly-detector': makeWorkload('anomaly-detector', 'anomaly detector', { replicas: 3, desiredReplicas: 4, throughput: 940, status: 'degraded' }),
  'signal-priority': makeWorkload('signal-priority', 'signal priority', { replicas: 4, throughput: 760, latencyMs: 28 }),
  'cron-optimizer': makeWorkload('cron-optimizer', 'cron optimizer', { replicas: 2, throughput: 45 }),
  'dlq-handler': makeWorkload('dlq-handler', 'dead-letters', { replicas: 2, throughput: 32 }),
  'backup-daemon': makeWorkload('backup-daemon', 'backup daemon', { replicas: 2, throughput: 18 }),
  prometheus: makeWorkload('prometheus', 'prometheus', { replicas: 3, throughput: 1300 }),
  grafana: makeWorkload('grafana', 'grafana', { replicas: 2, throughput: 210 }),
  'log-aggregator': makeWorkload('log-aggregator', 'log aggregator', { replicas: 5, throughput: 2200 }),
  'tracing-agent': makeWorkload('tracing-agent', 'tracing agent', { replicas: 4, throughput: 1500 }),
  'metrics-collector': makeWorkload('metrics-collector', 'metrics collector', { replicas: 4, throughput: 1800 }),
  'health-api': makeWorkload('health-api', 'health dashboard', { replicas: 2, throughput: 140 }),
})

const databases = reactive<Record<string, DatabaseModel>>({
  'mysql-primary': { id: 'mysql-primary', label: 'mysql primary', status: 'healthy', load: 0.57 },
  'mongo-primary': { id: 'mongo-primary', label: 'mongo telemetry', status: 'degraded', load: 0.79 },
  'mysql-replica': { id: 'mysql-replica', label: 'mysql replica', status: 'healthy', load: 0.41 },
  'mongo-archive': { id: 'mongo-archive', label: 'mongo archive', status: 'healthy', load: 0.66 },
  'cold-snapshots': { id: 'cold-snapshots', label: 'cold snapshots', status: 'healthy', load: 0.28 },
})

const caches = reactive<Record<string, CacheModel>>({
  'redis-live': { id: 'redis-live', label: 'live spatial cache', status: 'healthy' },
  'redis-replica': { id: 'redis-replica', label: 'redis replica', status: 'healthy' },
  'kraft-coordinator': { id: 'kraft-coordinator', label: 'kraft quorum', status: 'healthy' },
})

const streamingIds = ['kafka-broker-1', 'kafka-broker-2', 'kafka-broker-3', 'schema-registry']
const intelligenceIds = ['gps-consumer', 'eta-engine', 'anomaly-detector', 'signal-priority']

type ConnectorRenderer = 'line' | 'particles'
type ConnectorLayout = 'direct' | 'orthogonal'
type ArchitectureEdge = {
  from: string
  to: string
  type: ConnectorRenderer
  layout: ConnectorLayout
}

const edges: readonly ArchitectureEdge[] = [
  { from: 'city-edge-lb', to: 'public-api', type: 'particles', layout: 'direct' },
  { from: 'city-edge-lb', to: 'municipal-feed', type: 'line', layout: 'orthogonal' },
  { from: 'public-api', to: 'traffic-orchestrator', type: 'particles', layout: 'direct' },
  { from: 'municipal-feed', to: 'traffic-orchestrator', type: 'particles', layout: 'direct' },
  { from: 'service-registry', to: 'traffic-orchestrator', type: 'line', layout: 'orthogonal' },
  { from: 'auth-service', to: 'mysql-primary', type: 'line', layout: 'direct' },
  { from: 'notification-dispatcher', to: 'redis-live', type: 'particles', layout: 'direct' },
  { from: 'config-server', to: 'service-registry', type: 'line', layout: 'orthogonal' },
  ...streamingIds.map(to => ({ from: 'traffic-orchestrator', to, type: 'particles' as const, layout: 'orthogonal' as const })),
  { from: 'kraft-coordinator', to: 'kafka-broker-1', type: 'particles', layout: 'orthogonal' },
  { from: 'kraft-coordinator', to: 'kafka-broker-2', type: 'particles', layout: 'orthogonal' },
  { from: 'kraft-coordinator', to: 'kafka-broker-3', type: 'particles', layout: 'orthogonal' },
  { from: 'kafka-broker-1', to: 'gps-consumer', type: 'line', layout: 'direct' },
  { from: 'kafka-broker-2', to: 'anomaly-detector', type: 'line', layout: 'direct' },
  { from: 'schema-registry', to: 'gps-consumer', type: 'line', layout: 'orthogonal' },
  { from: 'redis-live', to: 'eta-engine', type: 'particles', layout: 'orthogonal' },
  { from: 'redis-live', to: 'signal-priority', type: 'particles', layout: 'orthogonal' },
  { from: 'gps-consumer', to: 'mongo-primary', type: 'line', layout: 'direct' },
  { from: 'eta-engine', to: 'mysql-primary', type: 'line', layout: 'direct' },
  { from: 'anomaly-detector', to: 'notification-dispatcher', type: 'particles', layout: 'orthogonal' },
  { from: 'signal-priority', to: 'redis-live', type: 'particles', layout: 'direct' },
  { from: 'mysql-primary', to: 'mysql-replica', type: 'line', layout: 'direct' },
  { from: 'mongo-primary', to: 'mongo-archive', type: 'line', layout: 'direct' },
  { from: 'redis-live', to: 'redis-replica', type: 'particles', layout: 'direct' },
  { from: 'cron-optimizer', to: 'mysql-primary', type: 'line', layout: 'direct' },
  { from: 'dlq-handler', to: 'kafka-broker-3', type: 'line', layout: 'orthogonal' },
  { from: 'backup-daemon', to: 'cold-snapshots', type: 'line', layout: 'orthogonal' },
  { from: 'metrics-collector', to: 'prometheus', type: 'particles', layout: 'orthogonal' },
  { from: 'prometheus', to: 'grafana', type: 'line', layout: 'direct' },
  { from: 'tracing-agent', to: 'log-aggregator', type: 'particles', layout: 'direct' },
  { from: 'health-api', to: 'prometheus', type: 'line', layout: 'orthogonal' },
]

const connections = connectors.join(edges.map(edge => {
  const route = connectors.edge(edge.from, edge.to, { key: edge.from + ':' + edge.to })
    .route({ strategy: edge.layout })
  return edge.type === 'line' ? route.stroke() : route.stroke({ opacity: 0, markerEnd: false })
    .flow(path => particles.path(path.points, {
      count: Math.max(1, Math.round(path.totalLength * 50)), spread: 0.018 * path.scale,
    }).appearance({ color: 0x5bc0ff, size: 0.11 * path.scale, blending: 'additive' })
      .motion({ speed: 0.5 * path.scale }))
}))

const flowPaused = ref(false)
const camera = ref('scene')
const selectedId = ref('')

const resourceIndex = computed<Record<string, ResourceModel>>(() => ({
  ...workloads,
  ...databases,
  ...caches,
  'city-edge-lb': { id: 'city-edge-lb', label: 'City Edge Load Balancer', status: 'healthy' },
}))
const selected = computed(() => resourceIndex.value[selectedId.value])

const workload = (id: string) => workloads[id]
const database = (id: string) => databases[id]
const cache = (id: string) => caches[id]

function selectNode(id: string) {
  selectedId.value = id
  camera.value = id
}

function pulseTelemetry() {
  const feed = workloads['municipal-feed']
  feed.throughput = feed.throughput >= 2600 ? 1460 : feed.throughput + 420
  feed.latencyMs = feed.throughput >= 2600 ? 136 : 39
  feed.status = feed.throughput >= 2600 ? 'degraded' : 'healthy'
  selectedId.value = feed.id
}

function onStageReady(stage: VuetrexStage) {
  // `camera` defaults to "scene", so Vuetrex's change-only watcher does not
  // invoke the overview transition on first mount. Retarget once after the
  // custom renderer has populated the scene.
  window.setTimeout(() => stage.sendCameraTo('scene'), 250)
}
</script>

<style>
:root {
  color: #e9f2fa;
  background: #0d141c;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 1080px; overflow: hidden; }
button { font: inherit; }

.app-shell {
  min-height: 100vh;
  background: radial-gradient(circle at 50% 0%, #1a2a38 0, #0d141c 56%, #080d12 100%);
}

.toolbar {
  height: 108px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  border-bottom: 1px solid rgba(142, 184, 217, 0.17);
  background: rgba(8, 14, 20, 0.88);
  backdrop-filter: blur(18px);
}

.toolbar h1 { margin: 4px 0 0; font-size: 25px; letter-spacing: -0.03em; }
.eyebrow { margin: 0; color: #61b8f4; font-size: 10px; font-weight: 800; letter-spacing: 0.18em; }
.toolbar-actions { display: flex; align-items: center; gap: 10px; }
.toolbar button, .close {
  color: #dcebf7;
  border: 1px solid rgba(120, 176, 218, 0.28);
  background: rgba(23, 48, 68, 0.7);
  border-radius: 8px;
  padding: 9px 13px;
  cursor: pointer;
}
.toolbar button:hover { background: #1d5378; border-color: #3d94ca; }
.status-dot { margin-right: 8px; color: #9eb3c2; font-size: 12px; }
.status-dot i { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: #54d16a; box-shadow: 0 0 12px #54d16a; }

.scene-wrap { position: relative; }
.scene-wrap canvas { display: block; }

.legend, .inspector {
  position: absolute;
  bottom: 22px;
  padding: 16px;
  border: 1px solid rgba(133, 176, 209, 0.2);
  border-radius: 12px;
  background: rgba(9, 17, 24, 0.82);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(14px);
}
.legend { left: 22px; display: grid; gap: 10px; min-width: 220px; color: #b8c8d5; font-size: 11px; }
.legend strong { margin-bottom: 3px; color: #f1f6fa; font-size: 13px; }
.legend .legend-section { margin-top: 7px; padding-top: 13px; border-top: 1px solid rgba(133, 176, 209, 0.16); }
.legend span { display: flex; align-items: center; gap: 9px; }
.swatch, .cube { display: inline-block; flex: 0 0 auto; width: 19px; height: 13px; border: 1px solid #4aa3e0; background: #174f88; box-shadow: 0 0 9px rgba(45, 148, 218, 0.3); }
.cube { width: 12px; height: 12px; margin-left: 3px; margin-right: 4px; transform: rotate(45deg); background: #168fe3; }
.database { border-radius: 50%; border-color: #a9b4be; background: #758492; }
.cache { border-color: #f1525c; background: #c72935; }
.connector-key { position: relative; display: inline-block; flex: 0 0 auto; width: 34px; height: 13px; }
.connector-key::before, .connector-key::after { position: absolute; content: ""; }
.direct-line::before { top: 6px; left: 1px; width: 32px; height: 2px; background: #a0ffff; transform: rotate(-12deg); }
.orthogonal-line::before { top: 1px; left: 3px; width: 14px; height: 8px; border-right: 2px solid #a0ffff; border-bottom: 2px solid #a0ffff; }
.orthogonal-line::after { top: 9px; left: 17px; width: 14px; border-top: 2px solid #a0ffff; }
.direct-particles::before { top: 5px; left: 1px; width: 32px; height: 4px; background: radial-gradient(circle, #75e8ff 0 1px, transparent 1.6px) 0 0 / 8px 4px; transform: rotate(-12deg); }
.orthogonal-particles::before { top: 1px; left: 3px; width: 14px; height: 8px; border-right: 2px dotted #75e8ff; border-bottom: 2px dotted #75e8ff; }
.orthogonal-particles::after { top: 9px; left: 17px; width: 14px; border-top: 2px dotted #75e8ff; }

.inspector { right: 22px; width: 260px; color: #d8e5ef; }
.inspector h2 { margin: 5px 0 17px; font-size: 19px; }
.close { position: absolute; top: 8px; right: 8px; padding: 2px 8px; font-size: 18px; }
.inspector dl, .inspector dl div { margin: 0; }
.inspector dl div { display: flex; justify-content: space-between; padding: 9px 0; border-top: 1px solid rgba(133, 176, 209, 0.12); font-size: 12px; }
.inspector dt { color: #8fa5b6; }
.inspector dd { margin: 0; font-weight: 700; }
.inspector dd.healthy { color: #5ee273; }
.inspector dd.degraded { color: #f3b536; }
.inspector dd.critical { color: #ff5966; }
</style>

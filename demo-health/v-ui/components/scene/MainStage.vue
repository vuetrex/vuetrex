<template>
  <vx-group id="main-stage" name="Main stage" :placement="originPlacement">
    <vx-group id="stage-platform" name="Stage platform" :placement="platformPlacement">
      <vx-cylinder
        id="stage-platform-surface"
        name="Stage platform surface"
        :size="PLATFORM_SIZE"
        :height="PLATFORM_HEIGHT"
        :material="platformMaterial"
        disabled
      />
    </vx-group>

    <vx-layer id="deployment-layer" name="Deployment layer" :gap="0.25" :elevation="PLATFORM_HEIGHT">
      <vx-group
        v-for="node in compositionNodes"
        :key="node.id"
        :id="`placement:${node.id}`"
        :name="`Placement: ${displayName(node.id)}`"
        :placement="node.placement"
        :visible="node.data.currentReplicas > 0"
      >
        <DeploymentNode
          :deployment="node.data"
          :selected="node.id === selectedId"
          :theme="theme"
          @select="emit('selectDeployment', $event)"
          @select-pod="(deploymentId, podId) => emit('selectPod', deploymentId, podId)"
        />
      </vx-group>
    </vx-layer>

    <vx-connectors :graph="connectorGraph" @click="emit('selectConnector', $event)" />
  </vx-group>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, shallowRef, watch } from 'vue'
import { Quaternion, Vector3 } from 'three'
import {
  compose,
  connectors,
  particles,
  type ConnectorHit,
  type ConnectorSource,
  type Placement,
} from '@/lib-components/index.js'
import DeploymentNode from './DeploymentNode.vue'
import { deploymentRecipe } from '../../recipes/deploymentRecipe.js'
import { PLATFORM_DEPTH_SCALE, PLATFORM_SIZE } from '../../sceneGeometry.js'
import { createPlatformDotTexture } from '../../visuals/platformDotTexture.js'
import type {
  CompositionPattern,
  DeploymentViewModel,
  RelationViewModel,
  ThemeMode,
} from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  composition: CompositionPattern
  currentTime: number
  selectedId: string
  selectedConnectorKey: string
  theme: ThemeMode
}>()

const emit = defineEmits<{
  selectDeployment: [id: string]
  selectPod: [deploymentId: string, podId: string]
  selectConnector: [hit: ConnectorHit]
}>()

type RelationSeverity = 'normal' | 'warning' | 'critical'

interface VisualRelation extends RelationViewModel {
  severity: RelationSeverity
  requestsPerSecond: number
  flowSpeed: number
}

interface GatewayBusItem {
  id: string
  kind: 'request'
  protocol: 'http'
  severity: 'normal'
  requestsPerSecond: number
  flowSpeed: number
}

const originPlacement: Placement = {
  position: new Vector3(),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
}

const PLATFORM_HEIGHT = 0.2

const platformPlacement: Placement = {
  position: new Vector3(),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, PLATFORM_DEPTH_SCALE),
}

const platformTexture = shallowRef(markRaw(createPlatformDotTexture(props.theme)))
watch(() => props.theme, theme => {
  platformTexture.value.dispose()
  platformTexture.value = markRaw(createPlatformDotTexture(theme))
})
onBeforeUnmount(() => platformTexture.value.dispose())

const platformMaterial = computed(() => ({
  color: props.theme === 'light' ? 0xc8d0d3 : 0x2b3a40,
  roughness: props.theme === 'light' ? 0.82 : 0.72,
  metalness: props.theme === 'light' ? 0.03 : 0.08,
  transparent: props.theme !== 'light',
  opacity: props.theme === 'light' ? 1 : 0.42,
  map: platformTexture.value,
}))

const compositionNodes = computed(() => compose(deploymentRecipe, {
  deployments: props.deployments,
  relations: props.relations,
}, {
  time: props.currentTime,
  selectedId: props.selectedId || undefined,
  parameters: { pattern: props.composition },
}).fragment.nodes)

const activeRelations = computed(() => {
  const activeIds = new Set(props.deployments
    .filter(deployment => deployment.currentReplicas > 0)
    .map(deployment => deployment.id))
  return props.relations.filter(relation => activeIds.has(relation.from) && activeIds.has(relation.to))
})

const visualRelations = computed<VisualRelation[]>(() => {
  const byId = new Map(props.deployments.map(deployment => [deployment.id, deployment]))
  return activeRelations.value.map(relation => {
    const from = byId.get(relation.from)
    const to = byId.get(relation.to)
    const severity = relationSeverity(from, to)
    const requestsPerSecond = Math.max(
      from?.metrics.requestsPerSecond ?? 0,
      to?.metrics.requestsPerSecond ?? 0,
    )
    return {
      ...relation,
      severity,
      requestsPerSecond,
      flowSpeed: flowSpeedFor(requestsPerSecond, severity),
    }
  })
})

const healthyGatewayRelations = computed(() => visualRelations.value
  .filter(relation => relation.from === 'edge-gateway' && relation.severity === 'normal'))

const pointRelations = computed(() => visualRelations.value
  .filter(relation => relation.from !== 'edge-gateway' || relation.severity !== 'normal'))

const connectorGraph = computed(() => {
  const sources: ConnectorSource<any>[] = []
  const selectedKey = props.selectedConnectorKey
  const gatewayRelations = healthyGatewayRelations.value
  if (gatewayRelations.length) {
    const gatewayItem: GatewayBusItem = {
      id: 'gateway-api-bus',
      kind: 'request',
      protocol: 'http',
      severity: 'normal',
      requestsPerSecond: Math.max(...gatewayRelations.map(relation => relation.requestsPerSecond)),
      flowSpeed: Math.max(...gatewayRelations.map(relation => relation.flowSpeed)),
    }
    sources.push(connectors
      .bus(
        { node: 'edge-gateway', port: 'auto' },
        gatewayRelations.map(relation => ({ node: relation.to, port: 'auto' })),
        { key: gatewayItem.id, item: gatewayItem, kind: gatewayItem.kind },
      )
      .profile(() => 'ground')
      .route({
        elevation: 0.045,
        clearance: 0.22,
      })
      .stroke({
        key: 'underlay',
        color: props.theme === 'light' ? 0x23383f : 0x0b2229,
        width: selectedKey === gatewayItem.id ? 0.084 : 0.06,
        opacity: 0.9,
        markerEnd: false,
      })
      .stroke({
        key: 'shaft',
        color: healthyColor(props.theme),
        width: selectedKey === gatewayItem.id ? 0.034 : 0.026,
        opacity: selectedKey === gatewayItem.id ? 1 : 0.78,
        markerEnd: 'arrow',
      })
      .flow(route => particles
        .path(route.points, {
          key: route.key,
          item: route.item,
          count: Math.max(14, Math.round(route.totalLength * 18)),
          distribution: 'even',
          spread: 0.018,
        })
        .appearance({
          color: particleColor(props.theme, 'normal'),
          size: 0.028,
          opacity: 0.72,
          blending: 'additive',
        })
        .motion({ speed: ({ item }) => item.flowSpeed }))
      .named('Gateway API bus'))
  }

  if (pointRelations.value.length) {
    const relationSource = connectors
      .edges(pointRelations.value, {
        keyBy: ({ item }) => item.id,
        from: ({ item }) => ({ node: item.from, port: item.severity === 'normal' ? 'auto' : 'top' }),
        to: ({ item }) => ({ node: item.to, port: item.severity === 'normal' ? 'auto' : 'top' }),
        kind: ({ item }) => item.kind,
        weight: ({ item }) => item.requestsPerSecond,
        metadata: ({ item }) => ({ protocol: item.protocol, severity: item.severity }),
      })
      .profile(({ item }) => item.severity === 'normal' ? 'ground' : 'air')
      .route({
        strategy: ({ item }) => item.severity === 'normal'
          ? 'orthogonal'
          : props.composition === 'temporal' ? 'spline' : 'bezier',
        elevation: ({ item }) => item.severity === 'normal' ? 0.045 : 0.62,
        lane: 'auto',
        clearance: 0.22,
      })
      .bundle({
        keyBy: ({ item }) => item.severity === 'normal' ? `ground:${item.protocol}` : undefined,
        width: 0.075,
        color: props.theme === 'light' ? 0x46646d : 0x17343c,
      })
      .stroke({
        key: 'underlay',
        color: ({ item }) => underlayColor(props.theme, item.severity),
        width: ({ item, key }) => key === selectedKey
          ? item.severity === 'normal' ? 0.08 : 0.095
          : item.severity === 'normal' ? 0.055 : 0.072,
        opacity: ({ item }) => item.severity === 'normal' ? 0.78 : 0.92,
        markerEnd: false,
      })
      .stroke({
        key: 'shaft',
        color: ({ item }) => relationColor(props.theme, item.severity),
        width: ({ item, key }) => key === selectedKey
          ? item.severity === 'normal' ? 0.032 : 0.04
          : item.severity === 'normal' ? 0.021 : 0.03,
        opacity: ({ item, key }) => key === selectedKey || item.severity !== 'normal' ? 1 : 0.76,
        markerEnd: ({ item }) => item.severity === 'normal' ? 'arrow' : 'diamond',
      })
      .flow(route => particles
        .path(route.points, {
          key: route.key,
          item: route.item,
          count: Math.max(12, Math.round(route.totalLength * (route.item.severity === 'normal' ? 16 : 24))),
          distribution: 'even',
          spread: route.item.severity === 'normal' ? 0.014 : 0.028,
        })
        .appearance({
          color: ({ item }) => particleColor(props.theme, item.severity),
          size: ({ item }) => item.severity === 'normal' ? 0.032 : 0.045,
          opacity: ({ item }) => item.severity === 'normal' ? 0.64 : 0.9,
          blending: 'additive',
        })
        .motion({ speed: ({ item }) => item.flowSpeed }))
      .named(({ item }) => `${item.severity === 'normal' ? 'Ground' : 'Incident'} route: ${displayName(item.from)} to ${displayName(item.to)}`)
    sources.push(relationSource)
  }

  return connectors.join(sources)
})

function relationSeverity(
  from: DeploymentViewModel | undefined,
  to: DeploymentViewModel | undefined,
): RelationSeverity {
  if (!from || !to || from.status === 'unavailable' || to.status === 'unavailable') return 'critical'
  if (from.status === 'degraded' || to.status === 'degraded') return 'warning'
  if (Math.max(from.metrics.errorRate, to.metrics.errorRate) >= 0.04) return 'critical'
  if (Math.max(from.metrics.errorRate, to.metrics.errorRate) >= 0.012) return 'warning'
  return 'normal'
}

function flowSpeedFor(requestsPerSecond: number, severity: RelationSeverity) {
  const normalizedRate = Math.min(1, Math.log10(1 + requestsPerSecond) / 3.3)
  return 0.22 + normalizedRate * 0.62 + (severity === 'normal' ? 0 : 0.14)
}

function healthyColor(theme: ThemeMode) {
  return theme === 'light' ? 0x167e97 : 0x58c6d5
}

function relationColor(theme: ThemeMode, severity: RelationSeverity) {
  if (severity === 'critical') return theme === 'light' ? 0xc43e4e : 0xff6b76
  if (severity === 'warning') return theme === 'light' ? 0xb16b18 : 0xf2b55d
  return healthyColor(theme)
}

function underlayColor(theme: ThemeMode, severity: RelationSeverity) {
  if (severity === 'critical') return theme === 'light' ? 0x69313a : 0x581923
  if (severity === 'warning') return theme === 'light' ? 0x6d512d : 0x503614
  return theme === 'light' ? 0x263b42 : 0x0b2229
}

function particleColor(theme: ThemeMode, severity: RelationSeverity) {
  if (severity === 'critical') return theme === 'light' ? 0xe25965 : 0xff9aa2
  if (severity === 'warning') return theme === 'light' ? 0xc9832c : 0xffcf7a
  return theme === 'light' ? 0x2598ad : 0xa4f5ff
}

function displayName(id: string) {
  return id.replaceAll('-', ' ')
}
</script>

<template>
  <vx-group id="background-wall" name="Background wall" :placement="wallPlacement">
    <vx-display-wall
      id="health-wall"
      name="Canvas wall"
      shape="curved"
      :radius="PLATFORM_RADIUS"
      :arc="WALL_ARC_DEGREES"
      :height="WALL_HEIGHT"
      :thickness="WALL_THICKNESS"
      :bezel="WALL_BEZEL"
      :segments="128"
      :texture-width="textureWidth"
      :texture-height="textureHeight"
      :frame-color="wallPalette.frame"
      :surface="wallSurface"
      :participates-in-layout="false"
    />
  </vx-group>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Quaternion, Vector3 } from 'three'
import type {
  Placement,
  VxDisplayPaintContext,
  VxDisplaySurface,
} from '@/lib-components/index.js'
import {
  PLATFORM_DEPTH_SCALE,
  PLATFORM_RADIUS,
  WALL_ARC_DEGREES,
  WALL_BEZEL,
  WALL_HEIGHT,
  WALL_THICKNESS,
} from '../../sceneGeometry.js'
import type { DeploymentViewModel, RelationViewModel, ThemeMode } from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  currentTime: number
  theme: ThemeMode
}>()

interface ChartData {
  id: string
  title: string
  value: string
  color: string
  values: number[]
}

const textureHeight = 768
const textureWidth = (() => {
  const screenHeight = WALL_HEIGHT - WALL_BEZEL * 2
  const screenRadius = PLATFORM_RADIUS
    - Math.min(WALL_THICKNESS * 0.35, PLATFORM_RADIUS * 0.02)
  const wallArc = WALL_ARC_DEGREES * Math.PI / 180
  const screenArc = wallArc - 2 * WALL_BEZEL / PLATFORM_RADIUS
  const steps = 128
  let screenWidth = 0
  for (let index = 0; index < steps; index++) {
    const angle = -screenArc / 2 + screenArc * (index + 0.5) / steps
    const tangentX = screenRadius * Math.cos(angle)
    const tangentZ = screenRadius * PLATFORM_DEPTH_SCALE * Math.sin(angle)
    screenWidth += Math.hypot(tangentX, tangentZ) * screenArc / steps
  }
  return Math.round(textureHeight * screenWidth / screenHeight)
})()

interface WallPalette {
  canvas: string
  frame: number
  panel: string
  panelBorder: string
  grid: string
  track: string
  heading: string
  primary: string
  secondary: string
  muted: string
  subtle: string
  node: string
  relation: string
}

const wallPalette = computed<WallPalette>(() => props.theme === 'light' ? {
  canvas: '#f2f2f1',
  frame: 0xe7e6e3,
  panel: '#fbfbfa',
  panelBorder: '#c5c7c9',
  grid: '#dfe1e2',
  track: '#d8dade',
  heading: '#27313b',
  primary: '#34404a',
  secondary: '#66717a',
  muted: '#7b858e',
  subtle: '#9aa1a7',
  node: '#edf0f2',
  relation: '#aab0b5',
} : {
  canvas: '#111719',
  frame: 0x46514d,
  panel: '#182124',
  panelBorder: '#344248',
  grid: '#2c393e',
  track: '#28363b',
  heading: '#dce7e9',
  primary: '#edf3f4',
  secondary: '#c6d0d3',
  muted: '#829198',
  subtle: '#65747b',
  node: '#223036',
  relation: '#54656c',
})

const wallPlacement = computed<Placement>(() => ({
  position: new Vector3(0, 1.88, 0),
  orientation: new Quaternion(),
  // The same depth scale turns the circular wall into the platform's ellipse.
  scale: new Vector3(1, 1, PLATFORM_DEPTH_SCALE),
}))

const chartData = computed<ChartData[]>(() => {
  const traffic = props.deployments.map(item => item.metrics.requestsPerSecond)
  const latency = props.deployments.map(item => item.metrics.latencyP95Ms)
  const readiness = props.deployments.map(item =>
    item.desiredReplicas > 0 ? item.readyReplicas / item.desiredReplicas : 0,
  )
  const errors = props.deployments.map(item => item.metrics.errorRate)
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const average = (values: number[]) => values.length ? sum(values) / values.length : 0

  return [
    { id: 'traffic', title: 'REQUEST RATE', value: `${Math.round(sum(traffic))}/s`, color: '#52b9d4', values: traffic },
    { id: 'latency', title: 'P95 LATENCY', value: `${Math.round(Math.max(0, ...latency))} ms`, color: '#e3a64f', values: latency },
    { id: 'readiness', title: 'POD READINESS', value: `${Math.round(average(readiness) * 100)}%`, color: '#58c6d5', values: readiness },
    { id: 'errors', title: 'ERROR RATE', value: `${(Math.max(0, ...errors) * 100).toFixed(1)}%`, color: '#dc6670', values: errors },
  ]
})

const wallSurface = computed<VxDisplaySurface>(() => {
  const charts = chartData.value
  const deployments = props.deployments
  const relations = props.relations
  const t = props.currentTime
  return {
    id: 'health-overview',
    background: wallPalette.value.canvas,
    paint(target) {
      paintDashboard(target, charts, deployments, relations, t)
    },
  }
})

function paintHealthPanel(
  ctx: CanvasRenderingContext2D,
  deployments: DeploymentViewModel[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)
  const inset = width * 0.075
  const healthy = deployments.filter(item => item.status === 'healthy').length
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.052)}px Inter, sans-serif`
  ctx.fillText('SERVICE HEALTH', x + inset, y + height * 0.13)
  ctx.fillStyle = wallPalette.value.primary
  ctx.font = `700 ${Math.round(height * 0.09)}px Inter, sans-serif`
  ctx.fillText(`${healthy}/${deployments.length} healthy`, x + inset, y + height * 0.27)

  deployments.slice(0, 5).forEach((deployment, index) => {
    const rowY = y + height * (0.42 + index * 0.10)
    const color = statusColor(deployment)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + inset + height * 0.018, rowY - height * 0.012, Math.max(3, height * 0.014), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = wallPalette.value.secondary
    ctx.font = `600 ${Math.round(height * 0.038)}px Inter, sans-serif`
    ctx.fillText(shortName(deployment.id), x + inset + height * 0.055, rowY)
    ctx.fillStyle = wallPalette.value.subtle
    ctx.textAlign = 'right'
    ctx.fillText(`${deployment.readyReplicas}/${deployment.desiredReplicas}`, x + width - inset, rowY)
    ctx.textAlign = 'left'
  })
}

function paintCapacityPanel(
  ctx: CanvasRenderingContext2D,
  deployments: DeploymentViewModel[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)
  const desired = deployments.reduce((sum, item) => sum + item.desiredReplicas, 0)
  const ready = deployments.reduce((sum, item) => sum + item.readyReplicas, 0)
  const ratio = desired > 0 ? ready / desired : 0
  const cx = x + width * 0.5
  const cy = y + height * 0.54
  const radius = Math.min(width, height) * 0.19
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.052)}px Inter, sans-serif`
  ctx.fillText('READY CAPACITY', x + width * 0.075, y + height * 0.13)
  ctx.lineWidth = radius * 0.34
  ctx.strokeStyle = wallPalette.value.track
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5)
  ctx.stroke()
  ctx.strokeStyle = ratio > 0.8 ? '#52b9d4' : '#e3a64f'
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = wallPalette.value.primary
  ctx.font = `700 ${Math.round(height * 0.105)}px Inter, sans-serif`
  ctx.fillText(`${Math.round(ratio * 100)}%`, cx, cy + height * 0.025)
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `600 ${Math.round(height * 0.036)}px Inter, sans-serif`
  ctx.fillText(`${ready} of ${desired} pods`, cx, y + height * 0.88)
  ctx.textAlign = 'left'
}

function paintWorkloadPanel(
  ctx: CanvasRenderingContext2D,
  deployments: DeploymentViewModel[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)
  const inset = width * 0.075
  const pods = deployments.reduce((sum, item) => sum + item.currentReplicas, 0)
  const ready = deployments.reduce((sum, item) => sum + item.readyReplicas, 0)
  const restarts = deployments.reduce(
    (sum, item) => sum + item.pods.reduce((podSum, pod) => podSum + pod.restarts, 0),
    0,
  )
  const metrics = [
    { label: 'DEPLOYMENTS', value: deployments.length, color: '#52b9d4' },
    { label: 'PODS', value: pods, color: '#8aa0a8' },
    { label: 'READY', value: ready, color: '#58c6d5' },
    { label: 'RESTARTS', value: restarts, color: '#dc6670' },
  ]

  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.052)}px Inter, sans-serif`
  ctx.fillText('WORKLOAD INVENTORY', x + inset, y + height * 0.13)

  metrics.forEach((metric, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const cellX = x + inset + column * width * 0.47
    const cellY = y + height * (0.38 + row * 0.34)
    ctx.fillStyle = metric.color
    ctx.font = `700 ${Math.round(height * 0.12)}px Inter, sans-serif`
    ctx.fillText(String(metric.value), cellX, cellY)
    ctx.fillStyle = wallPalette.value.subtle
    ctx.font = `600 ${Math.round(height * 0.034)}px Inter, sans-serif`
    ctx.fillText(metric.label, cellX, cellY + height * 0.09)
  })
}

function paintTopologyPanel(
  ctx: CanvasRenderingContext2D,
  deployments: DeploymentViewModel[],
  relations: RelationViewModel[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)
  const inset = width * 0.075
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.052)}px Inter, sans-serif`
  ctx.fillText('SYSTEM FLOW', x + inset, y + height * 0.13)
  ctx.fillStyle = wallPalette.value.subtle
  ctx.font = `500 ${Math.round(height * 0.034)}px Inter, sans-serif`
  ctx.fillText(`${relations.length} active relations`, x + inset, y + height * 0.23)

  const anchors = [
    [0.5, 0.52],
    [0.18, 0.42],
    [0.82, 0.40],
    [0.28, 0.78],
    [0.75, 0.78],
  ] as const
  const points = new Map(deployments.slice(0, anchors.length).map((deployment, index) => [
    deployment.id,
    { deployment, x: x + width * anchors[index][0], y: y + height * anchors[index][1] },
  ]))

  ctx.lineWidth = Math.max(1.5, height * 0.009)
  for (const relation of relations) {
    const from = points.get(relation.from)
    const to = points.get(relation.to)
    if (!from || !to) continue
    ctx.strokeStyle = relation.kind === 'request' ? '#3f9fb9' : wallPalette.value.relation
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  for (const point of points.values()) {
    const nodeWidth = width * 0.18
    const nodeHeight = height * 0.095
    ctx.fillStyle = wallPalette.value.node
    ctx.strokeStyle = statusColor(point.deployment)
    ctx.lineWidth = Math.max(1.5, height * 0.007)
    roundRect(ctx, point.x - nodeWidth / 2, point.y - nodeHeight / 2, nodeWidth, nodeHeight, 5)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = wallPalette.value.primary
    ctx.font = `600 ${Math.round(height * 0.03)}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(shortName(point.deployment.id), point.x, point.y + height * 0.012)
  }
  ctx.textAlign = 'left'
}

function statusColor(deployment: DeploymentViewModel): string {
  if (deployment.status === 'healthy') return '#58c6d5'
  if (deployment.status === 'degraded') return '#e3a64f'
  return '#dc6670'
}

function shortName(id: string): string {
  return id.replace('-api', '').replace('edge-', '')
}

function paintDashboard(
  target: VxDisplayPaintContext,
  charts: ChartData[],
  deployments: DeploymentViewModel[],
  relations: RelationViewModel[],
  time: number,
) {
  const { context: ctx, width, height } = target
  const margin = width * 0.045
  ctx.fillStyle = wallPalette.value.heading
  ctx.font = `700 ${Math.round(height * 0.043)}px Inter, sans-serif`
  ctx.fillText('LIVE SERVICE TOPOLOGY', margin, height * 0.075)
  ctx.fillStyle = wallPalette.value.subtle
  ctx.font = `500 ${Math.round(height * 0.022)}px Inter, sans-serif`
  ctx.fillText('checkout / health / capacity', margin, height * 0.115)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#58c6d5'
  ctx.fillText(`LIVE  t=${time.toFixed(1)}`, width - margin, height * 0.09)
  ctx.textAlign = 'left'
  ctx.strokeStyle = wallPalette.value.grid
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(margin, height * 0.14)
  ctx.lineTo(width - margin, height * 0.14)
  ctx.stroke()

  const gap = width * 0.014
  const panelWidth = (width - margin * 2 - gap * 3) / 4
  const topY = height * 0.17
  const topHeight = height * 0.34
  const bottomY = height * 0.54
  const bottomHeight = height * 0.36
  paintChart(ctx, charts[0], margin, topY, panelWidth, topHeight)
  paintLineChart(ctx, charts[1], margin + panelWidth + gap, topY, panelWidth, topHeight)
  paintChart(ctx, charts[2], margin + (panelWidth + gap) * 2, topY, panelWidth, topHeight)
  paintLineChart(ctx, charts[3], margin + (panelWidth + gap) * 3, topY, panelWidth, topHeight)
  paintHealthPanel(ctx, deployments, margin, bottomY, panelWidth, bottomHeight)
  paintTopologyPanel(ctx, deployments, relations, margin + panelWidth + gap, bottomY, panelWidth, bottomHeight)
  paintCapacityPanel(ctx, deployments, margin + (panelWidth + gap) * 2, bottomY, panelWidth, bottomHeight)
  paintWorkloadPanel(ctx, deployments, margin + (panelWidth + gap) * 3, bottomY, panelWidth, bottomHeight)
}

function paintPanelSurface(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = wallPalette.value.panel
  ctx.strokeStyle = wallPalette.value.panelBorder
  ctx.lineWidth = 2
  roundRect(ctx, x, y, width, height, 12)
  ctx.fill()
  ctx.stroke()
}

function paintChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartData,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)

  const inset = width * 0.08
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.06)}px Inter, sans-serif`
  ctx.fillText(chart.title, x + inset, y + height * 0.14)
  ctx.fillStyle = wallPalette.value.primary
  ctx.font = `700 ${Math.round(height * 0.105)}px Inter, sans-serif`
  ctx.fillText(chart.value, x + inset, y + height * 0.29)

  const max = Math.max(1, ...chart.values)
  const graphTop = y + height * 0.40
  const graphHeight = height * 0.43
  const graphWidth = width - inset * 2
  const slot = graphWidth / Math.max(1, chart.values.length)
  ctx.strokeStyle = wallPalette.value.grid
  ctx.lineWidth = 1
  for (let row = 0; row <= 3; row++) {
    const lineY = graphTop + graphHeight * row / 3
    ctx.beginPath()
    ctx.moveTo(x + inset, lineY)
    ctx.lineTo(x + width - inset, lineY)
    ctx.stroke()
  }
  chart.values.forEach((value, index) => {
    const barHeight = Math.max(5, value / max * graphHeight)
    ctx.fillStyle = chart.color
    ctx.fillRect(
      x + inset + slot * index + slot * 0.18,
      graphTop + graphHeight - barHeight,
      slot * 0.64,
      barHeight,
    )
  })
}

function paintLineChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartData,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  paintPanelSurface(ctx, x, y, width, height)
  const inset = width * 0.08
  ctx.fillStyle = wallPalette.value.muted
  ctx.font = `700 ${Math.round(height * 0.06)}px Inter, sans-serif`
  ctx.fillText(chart.title, x + inset, y + height * 0.14)
  ctx.fillStyle = wallPalette.value.primary
  ctx.font = `700 ${Math.round(height * 0.105)}px Inter, sans-serif`
  ctx.fillText(chart.value, x + inset, y + height * 0.29)

  const graphTop = y + height * 0.40
  const graphHeight = height * 0.43
  const graphWidth = width - inset * 2
  ctx.strokeStyle = wallPalette.value.grid
  ctx.lineWidth = 1
  for (let row = 0; row <= 3; row++) {
    const lineY = graphTop + graphHeight * row / 3
    ctx.beginPath()
    ctx.moveTo(x + inset, lineY)
    ctx.lineTo(x + width - inset, lineY)
    ctx.stroke()
  }

  const max = Math.max(1, ...chart.values)
  ctx.strokeStyle = chart.color
  ctx.lineWidth = Math.max(3, height * 0.018)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  chart.values.forEach((value, index) => {
    const px = x + inset + graphWidth * index / Math.max(1, chart.values.length - 1)
    const py = graphTop + graphHeight - value / max * graphHeight
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}
</script>

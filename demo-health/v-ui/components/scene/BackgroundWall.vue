<template>
  <vx-group id="background-wall" name="Background wall" :placement="wallPlacement">
    <vx-display-wall
      v-if="mode === 'displays'"
      id="health-display-backing"
      name="Health display backing"
      shape="curved"
      mode="continuous"
      :radius="7.25"
      :arc="108"
      :height="4.05"
      :thickness="0.2"
      :bezel="0.12"
      :segments="128"
      :frame-color="wallPalette.frame"
      :surface="backingSurface"
      :participates-in-layout="false"
      disabled
    />
    <vx-display-wall
      id="health-displays"
      name="Health displays"
      shape="curved"
      :mode="mode"
      :radius="mode === 'continuous' ? 7.2 : 7.0"
      :arc="mode === 'continuous' ? 108 : 100"
      :height="mode === 'continuous' ? 4.05 : 2.25"
      :thickness="0.16"
      :bezel="0.11"
      :segments="128"
      :display-width="mode === 'continuous' ? 0 : 2.0"
      :texture-width="textureWidth"
      :texture-height="textureHeight"
      :frame-color="wallPalette.frame"
      :surface="continuousSurface"
      :surfaces="displaySurfaces"
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
import type { DeploymentViewModel, RelationViewModel, ThemeMode, WallDisplayMode } from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  relations: RelationViewModel[]
  currentTime: number
  mode: WallDisplayMode
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
const textureWidth = computed(() => {
  const bezel = 0.11
  const wallHeight = props.mode === 'continuous' ? 4.05 : 2.25
  const screenHeight = wallHeight - bezel * 2

  if (props.mode === 'displays') {
    const screenWidth = 2.0 - bezel * 2
    return Math.round(textureHeight * screenWidth / screenHeight)
  }

  const radius = 7.2
  const thickness = 0.16
  const arc = 108 * Math.PI / 180
  const screenRadius = radius - Math.min(thickness * 0.35, radius * 0.02)
  const screenArc = arc - 2 * bezel / radius
  const screenWidth = screenRadius * screenArc
  return Math.round(textureHeight * screenWidth / screenHeight)
})

interface WallPalette {
  canvas: string
  backingTop: string
  backingBottom: string
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
  canvas: '#dce4e7',
  backingTop: '#d8dfe1',
  backingBottom: '#b9c4c8',
  frame: 0x8d9a9f,
  panel: '#f7f9fa',
  panelBorder: '#aab8bd',
  grid: '#d5dee1',
  track: '#c8d3d7',
  heading: '#17242b',
  primary: '#1d2b32',
  secondary: '#41545d',
  muted: '#586b73',
  subtle: '#74858c',
  node: '#dce5e8',
  relation: '#809097',
} : {
  canvas: '#111719',
  backingTop: '#252e31',
  backingBottom: '#171d1f',
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
  position: new Vector3(0, 2.05, 3.35),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
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
    { id: 'readiness', title: 'POD READINESS', value: `${Math.round(average(readiness) * 100)}%`, color: '#66c88c', values: readiness },
    { id: 'errors', title: 'ERROR RATE', value: `${(Math.max(0, ...errors) * 100).toFixed(1)}%`, color: '#dc6670', values: errors },
  ]
})

const continuousSurface = computed<VxDisplaySurface>(() => {
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

const backingSurface = computed<VxDisplaySurface>(() => ({
  id: 'display-backing',
  background: wallPalette.value.backingBottom,
  paint({ context: ctx, width, height }) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, wallPalette.value.backingTop)
    gradient.addColorStop(1, wallPalette.value.backingBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  },
}))

const displaySurfaces = computed<VxDisplaySurface[]>(() => {
  const [traffic, latency, readiness] = chartData.value
  return [
    {
      id: traffic.id,
      background: wallPalette.value.canvas,
      paint(target) { paintSingleChart(target, traffic, props.currentTime) },
    },
    {
      id: 'service-health',
      background: wallPalette.value.canvas,
      paint(target) { paintHealthSummary(target, props.deployments, props.currentTime) },
    },
    {
      id: latency.id,
      background: wallPalette.value.canvas,
      // Inline SVG is rasterized onto this display's private canvas texture.
      svg: chartSvg(latency, props.currentTime, textureWidth.value, textureHeight),
    },
    {
      id: readiness.id,
      background: wallPalette.value.canvas,
      paint(target) { paintSingleChart(target, readiness, props.currentTime) },
    },
    {
      id: 'capacity',
      background: wallPalette.value.canvas,
      paint(target) { paintCapacity(target, props.deployments, props.currentTime) },
    },
  ]
})

function paintHealthSummary(
  target: VxDisplayPaintContext,
  deployments: DeploymentViewModel[],
  time: number,
) {
  const { context: ctx, width, height } = target
  paintHealthPanel(ctx, deployments, width * 0.07, height * 0.08, width * 0.86, height * 0.78)
  paintLiveFooter(ctx, width, height, time)
}

function paintCapacity(
  target: VxDisplayPaintContext,
  deployments: DeploymentViewModel[],
  time: number,
) {
  const { context: ctx, width, height } = target
  paintCapacityPanel(ctx, deployments, width * 0.07, height * 0.08, width * 0.86, height * 0.78)
  paintLiveFooter(ctx, width, height, time)
}

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
    { label: 'PODS', value: pods, color: '#66c88c' },
    { label: 'READY', value: ready, color: '#e3a64f' },
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
  if (deployment.status === 'healthy') return '#66c88c'
  if (deployment.status === 'degraded') return '#e3a64f'
  return '#dc6670'
}

function shortName(id: string): string {
  return id.replace('-api', '').replace('edge-', '')
}

function paintLiveFooter(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.fillStyle = wallPalette.value.subtle
  ctx.font = `500 ${Math.round(height * 0.025)}px Inter, sans-serif`
  ctx.fillText(`LIVE  t=${time.toFixed(1)}`, width * 0.08, height * 0.94)
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
  ctx.fillStyle = '#66c88c'
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

function paintSingleChart(target: VxDisplayPaintContext, chart: ChartData, time: number) {
  const { context: ctx, width, height } = target
  paintChart(ctx, chart, width * 0.07, height * 0.08, width * 0.86, height * 0.78)
  ctx.fillStyle = wallPalette.value.subtle
  ctx.font = `500 ${Math.round(height * 0.025)}px Inter, sans-serif`
  ctx.fillText(`LIVE  t=${time.toFixed(1)}`, width * 0.07, height * 0.94)
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

function chartSvg(chart: ChartData, time: number, width: number, height: number): string {
  const colors = wallPalette.value
  const max = Math.max(1, ...chart.values)
  const left = width * 0.072
  const right = width * 0.925
  const graphTop = height * 0.39
  const graphBottom = height * 0.78
  const points = chart.values.map((value, index) => {
    const x = left + index * ((right - left) / Math.max(1, chart.values.length - 1))
    const y = graphBottom - value / max * (graphBottom - graphTop)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const gridLines = [0, 1, 2, 3].map(index => {
    const y = graphTop + (graphBottom - graphTop) * index / 3
    return `M${left.toFixed(1)} ${y.toFixed(1)} H${right.toFixed(1)}`
  }).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="${width * 0.042}" y="${height * 0.073}" width="${width * 0.916}" height="${height * 0.807}" rx="18" fill="${colors.panel}" stroke="${colors.panelBorder}" stroke-width="3"/>
    <text x="${left}" y="${height * 0.195}" fill="${colors.muted}" font-family="Inter,sans-serif" font-size="38" font-weight="700">${chart.title}</text>
    <text x="${left}" y="${height * 0.319}" fill="${colors.primary}" font-family="Inter,sans-serif" font-size="72" font-weight="700">${chart.value}</text>
    <path d="${gridLines}" stroke="${colors.grid}" stroke-width="2"/>
    <polyline points="${points}" fill="none" stroke="${chart.color}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${left}" y="${height * 0.948}" fill="${colors.subtle}" font-family="Inter,sans-serif" font-size="24">LIVE  t=${time.toFixed(1)}</text>
  </svg>`
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

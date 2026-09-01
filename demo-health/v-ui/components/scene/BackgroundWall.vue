<template>
  <vx-group name="background-wall" :placement="wallPlacement">
    <vx-display-wall
      name="health-displays"
      shape="curved"
      :mode="mode"
      :radius="7.2"
      :arc="mode === 'continuous' ? 110 : 82"
      :height="mode === 'continuous' ? 4.6 : 2.5"
      :thickness="0.16"
      :bezel="0.13"
      :segments="128"
      :display-width="2.5"
      :texture-width="1536"
      :texture-height="768"
      :frame-color="0x46514d"
      :surface="continuousSurface"
      :surfaces="displaySurfaces"
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
import type { DeploymentViewModel, WallDisplayMode } from '../../types.js'

const props = defineProps<{
  deployments: DeploymentViewModel[]
  currentTime: number
  mode: WallDisplayMode
}>()

interface ChartData {
  id: string
  title: string
  value: string
  color: string
  values: number[]
}

const wallPlacement = computed<Placement>(() => ({
  position: new Vector3(0, props.mode === 'continuous' ? 2.28 : 2.85, 2.25),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1),
}))

const chartData = computed<ChartData[]>(() => {
  const traffic = props.deployments.map(item => item.metrics.requestsPerSecond)
  const latency = props.deployments.map(item => item.metrics.latencyP95Ms)
  const readiness = props.deployments.map(item =>
    item.desiredReplicas > 0 ? item.readyReplicas / item.desiredReplicas : 0,
  )
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const average = (values: number[]) => values.length ? sum(values) / values.length : 0

  return [
    { id: 'traffic', title: 'REQUEST RATE', value: `${Math.round(sum(traffic))}/s`, color: '#52b9d4', values: traffic },
    { id: 'latency', title: 'P95 LATENCY', value: `${Math.round(Math.max(0, ...latency))} ms`, color: '#e3a64f', values: latency },
    { id: 'readiness', title: 'POD READINESS', value: `${Math.round(average(readiness) * 100)}%`, color: '#66c88c', values: readiness },
  ]
})

const continuousSurface = computed<VxDisplaySurface>(() => {
  const charts = chartData.value
  const t = props.currentTime
  return {
    id: 'health-overview',
    background: '#111719',
    paint(target) {
      paintDashboard(target, charts, t)
    },
  }
})

const displaySurfaces = computed<VxDisplaySurface[]>(() => {
  const [traffic, latency, readiness] = chartData.value
  return [
    {
      id: traffic.id,
      background: '#111719',
      paint(target) { paintSingleChart(target, traffic, props.currentTime) },
    },
    {
      id: latency.id,
      background: '#111719',
      // Inline SVG is rasterized onto this display's private canvas texture.
      svg: chartSvg(latency, props.currentTime),
    },
    {
      id: readiness.id,
      background: '#111719',
      paint(target) { paintSingleChart(target, readiness, props.currentTime) },
    },
  ]
})

function paintDashboard(target: VxDisplayPaintContext, charts: ChartData[], time: number) {
  const { context: ctx, width, height } = target
  const margin = width * 0.055
  ctx.fillStyle = '#dce7e9'
  ctx.font = `700 ${Math.round(height * 0.048)}px Inter, sans-serif`
  ctx.fillText('LIVE SERVICE TOPOLOGY', margin, height * 0.105)
  ctx.fillStyle = '#718189'
  ctx.font = `500 ${Math.round(height * 0.024)}px Inter, sans-serif`
  ctx.fillText(`checkout / health / capacity     t=${time.toFixed(1)}`, margin, height * 0.15)
  ctx.strokeStyle = '#2e3b40'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(margin, height * 0.19)
  ctx.lineTo(width - margin, height * 0.19)
  ctx.stroke()

  const gap = width * 0.025
  const panelWidth = (width - margin * 2 - gap * 2) / 3
  charts.forEach((chart, index) => {
    paintChart(ctx, chart, margin + index * (panelWidth + gap), height * 0.245, panelWidth, height * 0.62)
  })
}

function paintSingleChart(target: VxDisplayPaintContext, chart: ChartData, time: number) {
  const { context: ctx, width, height } = target
  paintChart(ctx, chart, width * 0.07, height * 0.08, width * 0.86, height * 0.78)
  ctx.fillStyle = '#65747b'
  ctx.font = `500 ${Math.round(height * 0.025)}px Inter, sans-serif`
  ctx.fillText(`LIVE  t=${time.toFixed(1)}`, width * 0.07, height * 0.94)
}

function paintChart(
  ctx: CanvasRenderingContext2D,
  chart: ChartData,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#182124'
  ctx.strokeStyle = '#344248'
  ctx.lineWidth = 2
  roundRect(ctx, x, y, width, height, 12)
  ctx.fill()
  ctx.stroke()

  const inset = width * 0.08
  ctx.fillStyle = '#829198'
  ctx.font = `700 ${Math.round(height * 0.06)}px Inter, sans-serif`
  ctx.fillText(chart.title, x + inset, y + height * 0.14)
  ctx.fillStyle = '#edf3f4'
  ctx.font = `700 ${Math.round(height * 0.105)}px Inter, sans-serif`
  ctx.fillText(chart.value, x + inset, y + height * 0.29)

  const max = Math.max(1, ...chart.values)
  const graphTop = y + height * 0.40
  const graphHeight = height * 0.43
  const graphWidth = width - inset * 2
  const slot = graphWidth / Math.max(1, chart.values.length)
  ctx.strokeStyle = '#2c393e'
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

function chartSvg(chart: ChartData, time: number): string {
  const max = Math.max(1, ...chart.values)
  const points = chart.values.map((value, index) => {
    const x = 110 + index * (800 / Math.max(1, chart.values.length - 1))
    const y = 600 - value / max * 300
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="768" viewBox="0 0 1536 768">
    <rect x="64" y="56" width="1408" height="620" rx="18" fill="#182124" stroke="#344248" stroke-width="3"/>
    <text x="110" y="150" fill="#829198" font-family="Inter,sans-serif" font-size="38" font-weight="700">${chart.title}</text>
    <text x="110" y="245" fill="#edf3f4" font-family="Inter,sans-serif" font-size="72" font-weight="700">${chart.value}</text>
    <path d="M110 600 H1420 M110 500 H1420 M110 400 H1420 M110 300 H1420" stroke="#2c393e" stroke-width="2"/>
    <polyline points="${points}" fill="none" stroke="${chart.color}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="110" y="728" fill="#65747b" font-family="Inter,sans-serif" font-size="24">LIVE  t=${time.toFixed(1)}</text>
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

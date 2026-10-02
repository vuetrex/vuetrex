<template>
  <vx-group id="foundation-stage" :placement="at(0, 0, 0)">
    <vx-group :placement="at(0, 0, 0)">
      <vx-workshop-plinth :size="11.8" :depth="8.8" :height="platformTop" :material="platformMaterial"/>
    </vx-group>

    <vx-group :placement="wallPlacement" fit="none">
      <vx-display-wall
          id="health-wall"
          name="Live health dashboard"
          shape="curved"
          :radius="7.2"
          :arc="90"
          :height="3.5"
          :thickness="0.12"
          :bezel="0.07"
          :segments="64"
          :texture-width="4096"
          :texture-height="1536"
          :frame-color="0x8fa1aa"
          :surface="dashboardSurface"
          :screen-style="{ brightness: 1.32, effects: { bloom: 'exclude' } }"
          :participates-in-layout="false"
      />
    </vx-group>
  </vx-group>
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import {Quaternion, Vector3} from 'three'
import {useCanvasTexture, type Placement, type VxDisplaySurface} from '@/lib-components/index.js'
import type {DeploymentViewModel, RelationViewModel} from '../../types.js'

const props = defineProps<{ deployments: DeploymentViewModel[]; relations: RelationViewModel[]; currentTime: number }>()
const platformTop = .18
const at = (x: number, y: number, z: number): Placement => ({
  position: new Vector3(x, y, z),
  orientation: new Quaternion(),
  scale: new Vector3(1, 1, 1)
})
const wallPlacement = at(0, 2.03, .5)

const gridTexture = useCanvasTexture(ctx => {
  const size = ctx.canvas.width;
  ctx.fillStyle = '#d8dde0';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#bdc6cc';
  const scale = size / 256;
  ctx.lineWidth = scale * .45
  for (let point = 0; point <= size; point += 12 * scale) {
    ctx.beginPath();
    ctx.moveTo(point, 0);
    ctx.lineTo(point, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, point);
    ctx.lineTo(size, point);
    ctx.stroke()
  }
}, {width: 2048, height: 2048, purpose: 'color'})
const grainTexture = useCanvasTexture(ctx => {
  for (let y = 0; y < ctx.canvas.height; y++) {
    const shade = 170 + ((y * 73 + 19) % 53);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, ctx.canvas.width, 1)
  }
}, {width: 512, height: 512, purpose: 'bump'})
watch(gridTexture, texture => {
  if (texture) texture.anisotropy = 8
})
const platformMaterial = computed(() => ({
  color: 0xffffff,
  map: gridTexture.value,
  roughness: .72,
  metalness: .12,
  bumpMap: grainTexture.value,
  bumpScale: .003
}))

const dashboardSurface = computed<VxDisplaySurface>(() => {
  const deployments = props.deployments, relations = props.relations, time = props.currentTime
  return {
    id: 'curved-health-dashboard',
    background: '#edf1f3',
    paint: ({context, width, height}) => paintDashboard(context, width, height, deployments, relations, time)
  }
})

function paintDashboard(ctx: CanvasRenderingContext2D, width: number, height: number, deployments: DeploymentViewModel[], relations: RelationViewModel[], time: number) {
  const margin = width * .035, gap = width * .012, top = height * .15, topHeight = height * .35, bottom = height * .535,
      bottomHeight = height * .39
  const panelWidth = (width - margin * 2 - gap * 3) / 4
  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, '#f8fafb');
  wash.addColorStop(1, '#dfe7eb');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#247f9d';
  ctx.font = `700 ${height * .026}px Inter, sans-serif`;
  ctx.fillText('COMMERCE PULSE  /  LIVE OPERATIONS', margin, height * .07)
  ctx.fillStyle = '#73838c';
  ctx.font = `500 ${height * .015}px Inter, sans-serif`;
  ctx.fillText('service health · traffic · capacity · topology', margin, height * .105)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#279b7c';
  ctx.font = `700 ${height * .017}px Inter, sans-serif`;
  ctx.fillText(`● LIVE   T+${time.toFixed(1)}`, width - margin, height * .075);
  ctx.textAlign = 'left'
  ctx.strokeStyle = '#c8d3d8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, height * .125);
  ctx.lineTo(width - margin, height * .125);
  ctx.stroke()

  const traffic = deployments.map(item => item.metrics.requestsPerSecond)
  const latency = deployments.map(item => item.metrics.latencyP95Ms)
  const readiness = deployments.map(item => item.desiredReplicas ? item.readyReplicas / item.desiredReplicas : 0)
  const errors = deployments.map(item => item.metrics.errorRate)
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const average = (values: number[]) => values.length ? sum(values) / values.length : 0
  paintBars(ctx, {
    title: 'REQUEST RATE',
    value: `${Math.round(sum(traffic)).toLocaleString()}/s`,
    color: '#168bdf',
    values: traffic
  }, margin, top, panelWidth, topHeight)
  paintLine(ctx, {
    title: 'P95 LATENCY',
    value: `${Math.round(Math.max(0, ...latency))} ms`,
    color: '#ffad66',
    values: latency
  }, margin + panelWidth + gap, top, panelWidth, topHeight)
  paintRing(ctx, 'POD READINESS', average(readiness), margin + (panelWidth + gap) * 2, top, panelWidth, topHeight)
  paintLine(ctx, {
    title: 'ERROR RATE',
    value: `${(Math.max(0, ...errors) * 100).toFixed(2)}%`,
    color: '#ff7f73',
    values: errors
  }, margin + (panelWidth + gap) * 3, top, panelWidth, topHeight)
  paintHealth(ctx, deployments, margin, bottom, panelWidth, bottomHeight)
  paintTopology(ctx, deployments, relations, margin + panelWidth + gap, bottom, panelWidth, bottomHeight)
  paintCapacity(ctx, deployments, margin + (panelWidth + gap) * 2, bottom, panelWidth, bottomHeight)
  paintInventory(ctx, deployments, margin + (panelWidth + gap) * 3, bottom, panelWidth, bottomHeight)
}

type Chart = { title: string; value: string; color: string; values: number[] }

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.strokeStyle = '#b8c7ce';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.stroke()
}

function heading(ctx: CanvasRenderingContext2D, title: string, value: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#71838d';
  ctx.font = `700 ${h * .054}px Inter, sans-serif`;
  ctx.fillText(title, x + w * .07, y + h * .14);
  ctx.fillStyle = '#1b2b35';
  ctx.font = `700 ${h * .115}px Inter, sans-serif`;
  ctx.fillText(value, x + w * .07, y + h * .29)
}

function grid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = '#d7e0e4';
  ctx.lineWidth = 1;
  for (let row = 0; row <= 3; row++) {
    const py = y + h * row / 3;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke()
  }
}

function paintBars(ctx: CanvasRenderingContext2D, c: Chart, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  heading(ctx, c.title, c.value, x, y, w, h);
  const inset = w * .07, gy = y + h * .42, gh = h * .43, gw = w - inset * 2, max = Math.max(1, ...c.values);
  grid(ctx, x + inset, gy, gw, gh);
  const slot = gw / Math.max(1, c.values.length);
  c.values.forEach((value, index) => {
    const bh = Math.max(5, value / max * gh);
    ctx.fillStyle = c.color;
    ctx.fillRect(x + inset + slot * index + slot * .18, gy + gh - bh, slot * .64, bh)
  })
}

function paintLine(ctx: CanvasRenderingContext2D, c: Chart, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  heading(ctx, c.title, c.value, x, y, w, h);
  const inset = w * .07, gy = y + h * .42, gh = h * .43, gw = w - inset * 2, max = Math.max(.0001, ...c.values);
  grid(ctx, x + inset, gy, gw, gh);
  ctx.strokeStyle = c.color;
  ctx.lineWidth = Math.max(3, h * .014);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  c.values.forEach((value, index) => {
    const px = x + inset + gw * index / Math.max(1, c.values.length - 1), py = gy + gh - value / max * gh;
    index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  });
  ctx.stroke()
}

function paintRing(ctx: CanvasRenderingContext2D, title: string, ratio: number, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  ctx.fillStyle = '#71838d';
  ctx.font = `700 ${h * .054}px Inter, sans-serif`;
  ctx.fillText(title, x + w * .07, y + h * .14);
  const cx = x + w * .5, cy = y + h * .57, r = Math.min(w, h) * .23;
  ctx.lineWidth = r * .28;
  ctx.strokeStyle = '#d5dfe3';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = ratio > .8 ? '#35b89a' : '#e99b4c';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1b2b35';
  ctx.font = `700 ${h * .12}px Inter, sans-serif`;
  ctx.fillText(`${Math.round(ratio * 100)}%`, cx, cy + h * .035);
  ctx.textAlign = 'left'
}

function paintHealth(ctx: CanvasRenderingContext2D, items: DeploymentViewModel[], x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  const inset = w * .07, healthy = items.filter(i => i.status === 'healthy').length;
  heading(ctx, 'SERVICE HEALTH', `${healthy}/${items.length} healthy`, x, y, w, h);
  items.slice(0, 5).forEach((item, index) => {
    const py = y + h * (.42 + index * .105);
    ctx.fillStyle = statusColor(item);
    ctx.beginPath();
    ctx.arc(x + inset + h * .018, py - h * .012, h * .014, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#344a55';
    ctx.font = `600 ${h * .038}px Inter, sans-serif`;
    ctx.fillText(shortName(item.id), x + inset + h * .055, py);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#758791';
    ctx.fillText(`${item.readyReplicas}/${item.desiredReplicas}`, x + w - inset, py);
    ctx.textAlign = 'left'
  })
}

function paintTopology(ctx: CanvasRenderingContext2D, items: DeploymentViewModel[], relations: RelationViewModel[], x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  heading(ctx, 'SYSTEM FLOW', `${relations.length} relations`, x, y, w, h);
  const anchors = [[.5, .48], [.18, .48], [.82, .48], [.3, .78], [.72, .78]] as const;
  const points = new Map(items.slice(0, 5).map((item, index) => [item.id, {
    item,
    x: x + w * anchors[index][0],
    y: y + h * anchors[index][1]
  }]));
  ctx.lineWidth = 3;
  for (const relation of relations) {
    const from = points.get(relation.from), to = points.get(relation.to);
    if (!from || !to) continue;
    ctx.strokeStyle = '#3b9cba';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke()
  }
  for (const point of points.values()) {
    ctx.fillStyle = '#edf3f5';
    ctx.strokeStyle = statusColor(point.item);
    ctx.lineWidth = 2;
    roundRect(ctx, point.x - w * .085, point.y - h * .045, w * .17, h * .09, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#304650';
    ctx.font = `600 ${h * .027}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(shortName(point.item.id), point.x, point.y + h * .01)
  }
  ctx.textAlign = 'left'
}

function paintCapacity(ctx: CanvasRenderingContext2D, items: DeploymentViewModel[], x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  const desired = items.reduce((s, i) => s + i.desiredReplicas, 0),
      ready = items.reduce((s, i) => s + i.readyReplicas, 0), ratio = desired ? ready / desired : 0;
  heading(ctx, 'READY CAPACITY', `${ready} of ${desired}`, x, y, w, h);
  const cx = x + w * .5, cy = y + h * .62, r = Math.min(w, h) * .19;
  ctx.lineWidth = r * .34;
  ctx.strokeStyle = '#d5dfe3';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = ratio > .8 ? '#35b89a' : '#e99b4c';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1b2b35';
  ctx.font = `700 ${h * .1}px Inter, sans-serif`;
  ctx.fillText(`${Math.round(ratio * 100)}%`, cx, cy + h * .03);
  ctx.textAlign = 'left'
}

function paintInventory(ctx: CanvasRenderingContext2D, items: DeploymentViewModel[], x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  heading(ctx, 'WORKLOAD INVENTORY', 'live objects', x, y, w, h);
  const metrics = [['DEPLOYMENTS', items.length, '#168bdf'], ['PODS', items.reduce((s, i) => s + i.currentReplicas, 0), '#71838d'], ['READY', items.reduce((s, i) => s + i.readyReplicas, 0), '#35b89a'], ['RESTARTS', items.reduce((s, i) => s + i.pods.reduce((p, v) => p + v.restarts, 0), 0), '#e96f67']] as const;
  metrics.forEach((metric, index) => {
    const col = index % 2, row = Math.floor(index / 2), px = x + w * (.08 + col * .48), py = y + h * (.5 + row * .28);
    ctx.fillStyle = metric[2];
    ctx.font = `700 ${h * .11}px Inter, sans-serif`;
    ctx.fillText(String(metric[1]), px, py);
    ctx.fillStyle = '#758791';
    ctx.font = `600 ${h * .03}px Inter, sans-serif`;
    ctx.fillText(metric[0], px, py + h * .075)
  })
}

function statusColor(item: DeploymentViewModel) {
  return item.status === 'healthy' ? '#35b89a' : item.status === 'degraded' ? '#e99b4c' : '#e96f67'
}

function shortName(id: string) {
  return id.replace('-api', '').replace('edge-', '')
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath()
}
</script>

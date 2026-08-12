<template>
  <div class="k8s-root">
    <div class="k8s-hud">
      <div v-if="selected" class="k8s-panel">
        <div class="k8s-title">{{ services[selected].label }}</div>
        <div class="k8s-meta">
          <span>namespace: default</span>
          <span>{{ podCounts[selected] }}/{{ podCounts[selected] }} pods ready</span>
        </div>
        <div class="k8s-actions">
          <button @click="triggerScaleUp">&#x2191; Scale</button>
          <button @click="triggerScaleDown">&#x2193; Drain</button>
          <button @click="triggerRestart">&#x21BA; Restart</button>
          <button class="k8s-close" @click="deselectAll">&#x2715;</button>
        </div>
      </div>
      <div v-else-if="hovered" class="k8s-hint k8s-hint--hover">
        {{ services[hovered].label }} &mdash; {{ podCounts[hovered] }} pods &nbsp;·&nbsp; dblclick to burst-scale
      </div>
      <div v-else class="k8s-hint">Click a deployment to inspect &mdash; click its pods to drain</div>
    </div>

    <vuetrex height="80vh" :camera="camera"  @ready="onStageReady">
      <vx-layer>
        <!-- API Gateway -->
        <vx-row>
          <vx-stack>
            <vx-box name="api-gw" text="api-gateway" size="1.5"
              :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'api-gw') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-layer :elevation="-0.55">
              <vx-ring size="2.0" start-angle="45" direction="reverse">
                <vx-wedge size="3.5"
                  v-for="i in podCounts['api-gw']"
                  :key="'api-gw-pod-' + i"
                  :name="'api-gw-pod-' + i"
                  text="" height="0.75"
                  :hover="{ scale: 1.18, transition: 0.18, color: 0x4c7fb2 }"
                  @click="onPodClick"
                />
              </vx-ring>
            </vx-layer>

          </vx-stack>
        </vx-row>

        <!-- Microservices -->
        <vx-row align-x="start">
          <vx-stack>
            <vx-box name="auth-svc" text="auth-svc" connection="api-gw"
              :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'auth-svc') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-cylinder
              v-for="i in podCounts['auth-svc']"
              :key="'auth-svc-pod-' + i"
              :name="'auth-svc-pod-' + i"
              text="" height="0.22" size="0.85"
              :hover="{ scale: 1.18, transition: 0.18 }"
              @click="onPodClick"
            />
          </vx-stack>
          <vx-stack>
            <vx-box name="product-svc" text="product-svc"
              :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'product-svc') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-cylinder
              v-for="i in podCounts['product-svc']"
              :key="'product-svc-pod-' + i"
              :name="'product-svc-pod-' + i"
              text="" height="0.22" size="0.85"
              :hover="{ scale: 1.18, transition: 0.18 }"
              @click="onPodClick"
            />
          </vx-stack>
          <vx-stack>
            <vx-box name="order-svc" text="order-svc"
              :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'order-svc') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-cylinder
              v-for="i in podCounts['order-svc']"
              :key="'order-svc-pod-' + i"
              :name="'order-svc-pod-' + i"
              text="" height="0.22" size="0.85"
              :hover="{ scale: 1.18, transition: 0.18 }"
              @click="onPodClick"
            />
          </vx-stack>
        </vx-row>

        <!-- Data layer -->
        <vx-row>
          <vx-stack>
            <vx-box name="mongo" text="MongoDB" size="1.4"
                 :material="{color:0x333333}"
                 :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'mongo') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-cylinder
              v-for="i in podCounts['mongo']"
              :key="'mongo-pod-' + i"
              :name="'mongo-pod-' + i"
              text="" height="0.22" size="0.75"
              :hover="{ scale: 1.18, transition: 0.18, color: 0x4c7fb2 }"
              @click="onPodClick"
            />
          </vx-stack>
          <vx-stack>
            <vx-box name="redis" text="Redis" size="1.4"
                 :hover="{ scale: 1.05, transition: 0.22, color: 0x4c7fb2 }"
              @click="onDeployClick"
              @dblclick="onDeployBurst"
              @pointerenter="!selected ? (hovered = 'redis') : null"
              @pointerleave="!selected ? (hovered = null) : null"
            />
            <vx-cylinder
              v-for="i in podCounts['redis']"
              :key="'redis-pod-' + i"
              :name="'redis-pod-' + i"
              text="" height="0.22" size="0.75"
              :hover="{ scale: 1.18, transition: 0.18 }"
              @click="onPodClick"
            />
            <vx-connector from="order-svc" to="mongo" type="line" layout="linear" />
          </vx-stack>
        </vx-row>
      </vx-layer>
    </vuetrex>
  </div>
</template>

<script lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { Vuetrex, VxSettings, VxStage, VxMouseEvent } from '@/lib-components/index.js'

export default {
  components: { Vuetrex },

  setup() {
    const camera = ref('scene')
    const selected = ref<string | null>(null)
    const hovered = ref<string | null>(null)
    let stage: any = null

    const services = {
      'api-gw':      { label: 'api-gateway' },
      'auth-svc':    { label: 'auth-svc' },
      'product-svc': { label: 'product-svc' },
      'order-svc':   { label: 'order-svc' },
      'mongo':       { label: 'MongoDB' },
      'redis':       { label: 'Redis' },
    } as Record<string, { label: string }>

    const podCounts = reactive<Record<string, number>>({
      'api-gw':      3,
      'auth-svc':    2,
      'product-svc': 2,
      'order-svc':   1,
      'mongo':       1,
      'redis':       1,
    })

    function getPodMesh(svc: string, idx: number) {
      return stage?.getById(`${svc}-pod-${idx}`)?.mesh ?? null
    }

    function getDeployMesh(svc: string) {
      return stage?.getById(svc)?.mesh ?? null
    }

    // Gentle upward lift — pods rise a small amount and settle back smoothly.
    function liftPods(svc: string, baseDelay = 0) {
      const count = podCounts[svc]
      for (let i = 1; i <= count; i++) {
        const id = `${svc}-pod-${i}`
        const mesh = getPodMesh(svc, i)
        if (!mesh) continue
        const origY = mesh.position.y
        stage.animateTo(id, { positionY: origY + 0.13 }, {
          duration: 0.45,
          ease: 'sine.out',
          delay: baseDelay + (i - 1) * 0.1,
          onComplete: () => {
            stage.animateTo(id, { positionY: origY }, { duration: 0.55, ease: 'sine.inOut' })
          }
        })
      }
    }

    // Subtle scale accent — used for both selection and restart feedback.
    function accentBox(svc: string) {
      stage.animateTo(svc, { scaleX: 1.07, scaleZ: 1.07 }, {
        duration: 0.35,
        ease: 'sine.out',
        onComplete: () => {
          stage.animateTo(svc, { scale: 1.0 }, { duration: 0.5, ease: 'sine.inOut' })
        }
      })
    }

    // New pod slides in from slightly above with a clean power ease — no bounce.
    function podEntranceAnim(svc: string, podIdx: number) {
      nextTick(() => {
        const id = `${svc}-pod-${podIdx}`
        const mesh = getPodMesh(svc, podIdx)
        if (!mesh) return
        const finalY = mesh.position.y
        mesh.position.y = finalY + 0.4
        mesh.scale.set(0.05, 0.05, 0.05)

        stage.animateTo(id, { positionY: finalY, scale: 1 }, { duration: 0.55, ease: 'power2.out' })
      })
    }

    // Pod shrinks and drops away quietly.
    function podExitAnim(svc: string, podIdx: number, onDone: () => void) {
      const id = `${svc}-pod-${podIdx}`
      const mesh = getPodMesh(svc, podIdx)
      if (!mesh) { onDone(); return }
      stage.animateTo(id, { scale: 0.05, positionY: mesh.position.y - 0.2 }, {
        duration: 0.4,
        ease: 'power2.inOut',
        onComplete: onDone
      })
    }

    // Double-click: burst-scale — add 2 pods in rapid succession (fast deploy surge)
    function onDeployBurst(ev: VxMouseEvent) {
      const svc = ev.vxNode.name
      if (!services[svc]) return
      const burst = Math.min(2, 8 - podCounts[svc])
      if (burst <= 0) return
      for (let i = 0; i < burst; i++) {
        setTimeout(() => {
          podCounts[svc]++
          podEntranceAnim(svc, podCounts[svc])
        }, i * 180)
      }
    }

    function onDeployClick(ev: VxMouseEvent) {
      const svc = ev.vxNode.name
      if (!services[svc]) return

      if (selected.value === svc) {
        // Second click: rolling restart — cascade on API GW, self-restart otherwise
        if (svc === 'api-gw') {
          ;['auth-svc', 'product-svc', 'order-svc'].forEach((s, i) => {
            setTimeout(() => {
              accentBox(s)
              liftPods(s)
            }, i * 500)
          })
        } else {
          accentBox(svc)
          liftPods(svc)
        }
      } else {
        selected.value = svc
        hovered.value = null
        camera.value = svc
        accentBox(svc)
        liftPods(svc)
      }
    }

    function onPodClick(ev: VxMouseEvent) {
      const match = ev.vxNode.name.match(/^(.+)-pod-\d+$/)
      if (!match) return
      const svc = match[1]
      if (!podCounts[svc] || podCounts[svc] <= 1) return

      // Always drain the topmost pod for a clean visual
      const topIdx = podCounts[svc]
      podExitAnim(svc, topIdx, () => {
        podCounts[svc]--
      })
    }

    function triggerScaleUp() {
      const svc = selected.value
      if (!svc || podCounts[svc] >= 8) return
      podCounts[svc]++
      podEntranceAnim(svc, podCounts[svc])
    }

    function triggerScaleDown() {
      const svc = selected.value
      if (!svc || podCounts[svc] <= 1) return
      const topIdx = podCounts[svc]
      podExitAnim(svc, topIdx, () => { podCounts[svc]-- })
    }

    function triggerRestart() {
      if (!selected.value) return
      accentBox(selected.value)
      liftPods(selected.value)
    }

    function deselectAll() {
      selected.value = null
      hovered.value = null
      camera.value = 'scene'
    }

    function onStageReady(s: VxStage) {
      stage = s
      // Add cross-cutting connections once all meshes have been placed
      setTimeout(() => {
        const connect = (a: string, b: string) => {
          const e1 = (stage as any).getById(a)
          const e2 = (stage as any).getById(b)
          if (e1 && e2) (stage as any).connect(e1, e2)
        }
        connect('auth-svc',  'api-gw')
        connect('order-svc', 'redis')
        connect('auth-svc',  'mongo')
      }, 600)
    }

    return {
      camera, selected, hovered, services, podCounts,
      onDeployClick, onDeployBurst,
      onPodClick,
      triggerScaleUp, triggerScaleDown, triggerRestart, deselectAll,
      onStageReady,
    }
  }
}
</script>

<style scoped>
.k8s-root {
  position:relative;
}

.k8s-hud {
  position: absolute;
  top: 12px;
  left: 16px;
  z-index: 10;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  pointer-events: none;
}

.k8s-panel {
  background: rgba(8, 16, 32, 0.92);
  border: 1px solid rgba(63, 168, 255, 0.3);
  border-radius: 6px;
  padding: 10px 16px;
  color: #7fc4ff;
  pointer-events: all;
  min-width: 300px;
  box-shadow: 0 0 24px rgba(63, 168, 255, 0.12);
}

.k8s-title {
  font-size: 15px;
  font-weight: bold;
  color: #a8d8ff;
  margin-bottom: 6px;
  letter-spacing: 0.05em;
}

.k8s-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 12px;
  opacity: 0.65;
}

.k8s-actions {
  display: flex;
  gap: 8px;
}

.k8s-actions button {
  background: rgba(63, 168, 255, 0.1);
  border: 1px solid rgba(63, 168, 255, 0.4);
  color: #7fc4ff;
  border-radius: 4px;
  padding: 3px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition: background 0.2s;
}

.k8s-actions button:hover {
  background: rgba(63, 168, 255, 0.25);
}

.k8s-close {
  margin-left: auto;
  background: rgba(255, 80, 80, 0.08) !important;
  border-color: rgba(255, 80, 80, 0.4) !important;
  color: #ff8080 !important;
}

.k8s-hint {
  color: rgba(168, 213, 255, 0.53);
  font-size: 12px;
  padding: 4px 0;
}

.k8s-hint--hover {
  color: rgba(63, 168, 255, 0.7);
}
</style>

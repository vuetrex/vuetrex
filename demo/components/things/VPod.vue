<!--
  Kubernetes Pod card, reimagined as an architectural silo:
  – a wide rectangular plinth (footer) carries the pod's identity;
  – each container is a cylindrical "tank" stacked on top, colour-coded by
    lifecycle state, with the container name/restart count etched on it;
  – the header is a thin cylindrical disc — a Bauhaus circle-over-square —
    coloured by the current pod phase.
  All reactive state stays in props; a parent may push updates from an SSE
  Kubernetes watch stream without any imperative wiring.
-->
<template>
  <stack :gap="0.04">
    <!-- footer plinth: name · namespace -->
    <box
      :size="1.8"
      :depth="0.9"
      :height="0.35"
      :lines="[`${name}`]"
      :label-color="0xffffff"
      :label-font-size="0.16"
      :material="{ color: 0x1c2a44, roughness: 0.5, metalness: 0.15 }"
      :hover="{ color: 0x2f4a7a, transition: 0.2 }"
    />

    <!-- body: one cylindrical tank per container -->
    <cylinder
      v-for="c in containers"
      :key="c.name"
      :text="`${namespace}`"
      :size="1.3"
      :height="0.5"
      :material="{ color: containerColor(c), roughness: 0.55, metalness: 0.15 }"
      :hover="{ color: 0x4c7fb2, transition: 0.18 }"
    />

    <!-- header disc: pod phase -->
    <cylinder

      :size="1.7"
      :height="0.22"
      :material="{ color: phaseColor, roughness: 0.35, metalness: 0.25 }"
      :hover="{ color: 0x49a457, transition: 0.2 }"
    />
  </stack>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
export type ContainerState = 'running' | 'waiting' | 'terminated'
export interface PodContainer {
  name: string
  ready: boolean
  restarts: number
  state: ContainerState
}

const PHASE_COLORS: Record<PodPhase, number> = {
  Pending: 0xd4a12a,
  Running: 0x2f7a3a,
  Succeeded: 0x2a5cb2,
  Failed: 0xa4322a,
  Unknown: 0x555555,
}

const CONTAINER_COLORS: Record<ContainerState, number> = {
  running: 0x2d2d2d,
  waiting: 0x4a3a1a,
  terminated: 0x4a1e1e,
}

export default defineComponent({
  name: 'VPod',
  props: {
    name: { type: String, default: 'nginx-7d9c' },
    namespace: { type: String, default: 'default' },
    phase: { type: String as PropType<PodPhase>, default: 'Running' },
    containers: {
      type: Array as PropType<PodContainer[]>,
      default: () => [
        { name: 'nginx', ready: true, restarts: 0, state: 'running' },
        { name: 'sidecar', ready: true, restarts: 1, state: 'running' },
      ],
    },
  },
  computed: {
    phaseColor(): number {
      return PHASE_COLORS[this.phase] ?? PHASE_COLORS.Unknown
    },
  },
  methods: {
    containerColor(c: PodContainer): number {
      if (!c.ready) return 0x4a3a1a
      if (c.restarts > 3) return 0xa4322a
      return CONTAINER_COLORS[c.state] ?? 0x2d2d2d
    },
  },
})
</script>

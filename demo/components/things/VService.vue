<!--
  HTTP service gauge, reimagined as a sci-fi turbine:
  – a rectangular base plinth (footer) holds the service name, coloured by
    overall health;
  – a segmented ring of wedges above it visualises the replica set — one
    wedge per desired replica, "lit" when the replica is ready;
  – a load-driven cylindrical tower rises out of that ring; its height is
    bound to current RPS so the whole component visibly grows under load;
  – a thin latency-coloured disc caps the top with the p99 reading.
-->
<template>
  <stack :gap="0.04">
    <!-- footer plinth: service name + health -->
    <box
      :size="1.8"
      :depth="0.9"
      :height="0.35"
      :lines="[serviceName]"
      :label-color="0xffffff"
      :label-font-size="0.2"
      :material="{ color: healthColor, roughness: 0.45, metalness: 0.15 }"
      :hover="{ color: 0x49a457, transition: 0.2 }"
    />

    <!-- replica ring: one wedge per desired replica -->
    <ring :radius="0.9" :gap-ratio="0.45" start-angle="90">
      <wedge
        v-for="i in desiredReplicas"
        :key="i"

        :height="0.25"
        :thickness="0.12"
        :material="{ color: replicaColor(i), roughness: 0.5, metalness: 0.2 }"
        :hover="{ color: 0x4c7fb2, transition: 0.18 }"
      />
    </ring>

    <!-- load tower: cylinder whose height reflects current RPS -->
    <cylinder
      :text="`${rps.toFixed(0)} rps`"
      :size="1.1"
      :height="barHeight"
      :material="{ color: 0x1e1e1e, roughness: 0.55, metalness: 0.2 }"
      :hover="{ color: 0x4c7fb2, transition: 0.18 }"
    />

    <!-- latency disc -->
    <cylinder
      :text="`p99 ${p99Ms} ms`"
      :size="1.5"
      :height="0.2"
      :material="{ color: latencyColor, roughness: 0.35, metalness: 0.25 }"
      :hover="{ color: 0x3d7ce0, transition: 0.2 }"
    />
  </stack>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'

export type ServiceStatus = 'healthy' | 'degraded' | 'down'

const HEALTH_COLORS: Record<ServiceStatus, number> = {
  healthy: 0x2f7a3a,
  degraded: 0xd4a12a,
  down: 0xa4322a,
}

export default defineComponent({
  name: 'VService',
  props: {
    serviceName: { type: String, default: 'checkout-api' },
    rps: { type: Number, default: 120 },
    errorRate: { type: Number, default: 0.002 },
    p99Ms: { type: Number, default: 85 },
    replicas: { type: Number, default: 3 },
    desiredReplicas: { type: Number, default: 3 },
    status: { type: String as PropType<ServiceStatus>, default: 'healthy' },
    // Load scale: how many rps map to 1 unit of extra bar height.
    rpsScale: { type: Number, default: 200 },
  },
  computed: {
    barHeight(): number {
      // Grow from 0.5 up to 3.0 as load increases.
      return Math.min(3.0, 0.5 + this.rps / this.rpsScale)
    },
    latencyColor(): number {
      if (this.p99Ms >= 500) return 0xa4322a
      if (this.p99Ms >= 200) return 0xd4a12a
      return 0x2f7a3a
    },
    healthColor(): number {
      return HEALTH_COLORS[this.status] ?? HEALTH_COLORS.healthy
    },
  },
  methods: {
    // `i` is 1-based from v-for; a wedge is "lit" when its slot is covered
    // by a currently-ready replica.
    replicaColor(i: number): number {
      return i <= this.replicas ? 0x2f7a3a : 0x3a3a3a
    },
  },
})
</script>

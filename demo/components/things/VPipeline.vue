<!--
  CI/CD pipeline card, reimagined as a Bauhaus progress dial:
  – a rectangular plinth (footer) carries repo @ shortSha;
  – above it, a ring of wedges — one per stage — forms a circular progress
    indicator; each wedge is coloured by that stage's status;
  – a large cylindrical disc caps the composition and shows overall
    percent + passed/total, coloured by the pipeline's overall state.
  Because `stages` is a reactive array, appending or updating a stage via
  SSE grows / recolours a wedge in place without renderer-side patching.
-->
<template>
  <vx-stack :gap="0.04">
    <!-- footer plinth: repo @ sha -->
    <vx-box
      :size="1.8"
      :depth="0.9"
      :height="0.35"
      :lines="[`${repo}`]"
      :label-color="0xffffff"
      :label-font-size="0.18"
      :material="{ color: 0x1c2a44, roughness: 0.5, metalness: 0.15 }"
      :hover="{ color: 0x2f4a7a, transition: 0.2 }"
    />

    <!-- stage dial: one wedge per stage, colour = status -->
    <vx-ring :radius="1" :gap-ratio="0.05" start-angle="90">
      <vx-wedge
        v-for="s in stages"
        :key="s.name"
        :height="0.3"
        :thickness="0.12"
        :material="{ color: stageColor(s), roughness: 0.5, metalness: 0.2 }"
        :hover="{ color: 0x4c7fb2, transition: 0.18 }"
      />
    </vx-ring>

    <!-- header disc: overall progress -->
    <vx-cylinder
      :text="`${passed}/${stages.length}  ${percent}%`"
      :size="1.7"
      :height="0.28"
      :material="{ color: overallColor, roughness: 0.35, metalness: 0.25 }"
      :hover="{ color: 0x3d7ce0, transition: 0.2 }"
    />
  </vx-stack>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'

export type PipelineStageStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'

export interface PipelineStage {
  name: string
  status: PipelineStageStatus
  durationS: number
}

const STAGE_COLORS: Record<PipelineStageStatus, number> = {
  pending: 0x555555,
  running: 0x2a5cb2,
  success: 0x2f7a3a,
  failed: 0xa4322a,
  skipped: 0x333333,
}

export default defineComponent({
  name: 'VPipeline',
  props: {
    repo: { type: String, default: 'acme/api' },
    branch: { type: String, default: 'main' },
    stages: {
      type: Array as PropType<PipelineStage[]>,
      default: () => [
        { name: 'lint', status: 'success', durationS: 12 },
        { name: 'build', status: 'success', durationS: 84 },
        { name: 'test', status: 'running', durationS: 41 },
        { name: 'deploy', status: 'pending', durationS: 0 },
      ],
    },
    percent: { type: Number, default: 65 },
    syncState: {
      type: String as PropType<'Synced' | 'OutOfSync' | undefined>,
      default: undefined,
    },
  },
  computed: {
    passed(): number {
      return this.stages.filter((s) => s.status === 'success').length
    },
    overallColor(): number {
      if (this.stages.some((s) => s.status === 'failed')) return 0xa4322a
      if (this.stages.some((s) => s.status === 'running')) return 0x2a5cb2
      if (this.stages.every((s) => s.status === 'success')) return 0x2f7a3a
      return 0x555555
    },
  },
  methods: {
    stageColor(s: PipelineStage): number {
      return STAGE_COLORS[s.status] ?? 0x333333
    },
  },
})
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  source: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: 'Live example',
  },
})

const activeTab = ref('result')
const copied = ref(false)
const isMaximized = ref(false)
const normalizedSource = computed(() => props.source.trim())

function closeExpandedView(event) {
  if (event.key === 'Escape' && isMaximized.value) {
    isMaximized.value = false
  }
}

function toggleMaximized() {
  isMaximized.value = !isMaximized.value
}

onMounted(() => document.addEventListener('keydown', closeExpandedView))
onBeforeUnmount(() => document.removeEventListener('keydown', closeExpandedView))

async function copySource() {
  await navigator.clipboard.writeText(normalizedSource.value)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1400)
}
</script>

<template>
  <section
    class="vx-example-tabs"
    :class="{ 'is-maximized': isMaximized }"
    :aria-label="title"
  >
    <div class="vx-example-tabs__bar" role="tablist" :aria-label="`${title} views`">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'result'"
        :class="{ active: activeTab === 'result' }"
        @click="activeTab = 'result'"
      >
        Result
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'source'"
        :class="{ active: activeTab === 'source' }"
        @click="activeTab = 'source'"
      >
        Source
      </button>
      <span class="vx-example-tabs__title">{{ title }}</span>
      <span class="vx-example-tabs__actions">
        <button
          v-if="activeTab === 'source'"
          type="button"
          class="vx-example-tabs__copy"
          @click="copySource"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button
          type="button"
          class="vx-example-tabs__maximize"
          :aria-label="isMaximized ? 'Minimize example' : 'Maximize example'"
          :title="isMaximized ? 'Minimize' : 'Maximize'"
          @click="toggleMaximized"
        >
          <svg v-if="isMaximized" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
          </svg>
        </button>
      </span>
    </div>

    <div v-show="activeTab === 'result'" class="vx-example-tabs__result" role="tabpanel">
      <slot />
    </div>
    <div v-show="activeTab === 'source'" class="vx-example-tabs__source" role="tabpanel">
      <pre><code>{{ normalizedSource }}</code></pre>
    </div>
  </section>
</template>

<style scoped>
.vx-example-tabs {
  margin: 1.25rem 0 2rem;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}

.vx-example-tabs__bar {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 0.5rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.vx-example-tabs__bar button {
  height: 44px;
  padding: 0 0.75rem;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--vp-c-text-2);
  background: transparent;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.vx-example-tabs__bar button:hover,
.vx-example-tabs__bar button.active {
  color: var(--vp-c-brand-1);
}

.vx-example-tabs__bar button.active {
  border-bottom-color: var(--vp-c-brand-1);
}

.vx-example-tabs__title {
  min-width: 0;
  margin-left: 0.5rem;
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vx-example-tabs__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}

.vx-example-tabs__bar .vx-example-tabs__copy {
  height: 30px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 0 0.65rem;
}

.vx-example-tabs__bar .vx-example-tabs__maximize {
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  place-items: center;
}

.vx-example-tabs__maximize:hover {
  background: var(--vp-c-bg-soft);
}

.vx-example-tabs__maximize svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.vx-example-tabs__result {
  min-height: 260px;
  background: #101719;
}

.vx-example-tabs__source {
  max-height: 560px;
  overflow: auto;
  background: var(--vp-code-block-bg);
}

.vx-example-tabs__source pre {
  margin: 0;
  padding: 1.1rem 1.25rem;
  border-radius: 0;
  background: transparent;
  line-height: 1.55;
}

.vx-example-tabs__source code {
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
}

.vx-example-tabs.is-maximized {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  width: 100dvw;
  height: 100dvh;
  margin: 0;
  border: 0;
  border-radius: 0;
  flex-direction: column;
  background: var(--vp-c-bg);
}

.vx-example-tabs.is-maximized .vx-example-tabs__bar {
  flex: none;
}

.vx-example-tabs.is-maximized .vx-example-tabs__result,
.vx-example-tabs.is-maximized .vx-example-tabs__source {
  flex: 1;
  min-height: 0;
  max-height: none;
}

.vx-example-tabs.is-maximized .vx-example-tabs__result {
  display: flex;
  flex-direction: column;
}

.vx-example-tabs.is-maximized .vx-example-tabs__result :deep(> *) {
  min-height: 0;
  flex: 1;
}

.vx-example-tabs.is-maximized .vx-example-tabs__result :deep(.custom-renderer-wrapper) {
  min-height: 0;
  height: 100% !important;
  max-height: none !important;
  flex: 1;
}

@media (max-width: 640px) {
  .vx-example-tabs__title {
    display: none;
  }
}
</style>

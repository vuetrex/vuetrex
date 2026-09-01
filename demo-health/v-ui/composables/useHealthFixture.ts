import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import type {
  ConnectionStatus,
  ControlState,
  HealthCatalog,
  HealthEvent,
  HealthSnapshot,
  MetricSample,
  TimelinePatch,
} from '../types.js'

const defaultApiBase = 'http://127.0.0.1:4100'

async function requestJson<T>(apiBase: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init)
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(failure.error ?? `Health fixture request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function useHealthFixture(apiBase = import.meta.env.VITE_HEALTH_API ?? defaultApiBase) {
  const catalog = shallowRef<HealthCatalog | null>(null)
  const snapshot = shallowRef<HealthSnapshot | null>(null)
  const metrics = shallowRef<MetricSample | null>(null)
  const state = shallowRef<ControlState | null>(null)
  const recentEvents = ref<HealthEvent[]>([])
  const connection = ref<ConnectionStatus>('disconnected')
  const error = ref('')
  let eventSource: EventSource | null = null

  const currentTime = computed(() => metrics.value?.t ?? state.value?.t ?? 0)

  function acceptReset(event: MessageEvent<string>) {
    const reset = JSON.parse(event.data) as { state: ControlState, snapshot: HealthSnapshot }
    state.value = reset.state
    snapshot.value = reset.snapshot
    metrics.value = null
    recentEvents.value = []
  }

  function acceptMetricSample(event: MessageEvent<string>) {
    const sample = JSON.parse(event.data) as MetricSample
    metrics.value = sample
    if (state.value) state.value = { ...state.value, t: sample.t }
  }

  function acceptState(event: MessageEvent<string>) {
    state.value = JSON.parse(event.data) as ControlState
  }

  function acceptEvent(event: MessageEvent<string>) {
    const item = JSON.parse(event.data) as HealthEvent
    recentEvents.value = [item, ...recentEvents.value].slice(0, 8)
  }

  async function connect() {
    disconnect()
    connection.value = 'connecting'
    error.value = ''

    try {
      const [nextCatalog, nextState, nextSnapshot] = await Promise.all([
        requestJson<HealthCatalog>(apiBase, '/catalog'),
        requestJson<ControlState>(apiBase, '/state'),
        requestJson<HealthSnapshot>(apiBase, '/snapshot'),
      ])
      catalog.value = nextCatalog
      state.value = nextState
      snapshot.value = nextSnapshot

      eventSource = new EventSource(`${apiBase}/stream`)
      eventSource.addEventListener('reset', acceptReset as EventListener)
      eventSource.addEventListener('metrics', acceptMetricSample as EventListener)
      eventSource.addEventListener('state', acceptState as EventListener)
      eventSource.addEventListener('event', acceptEvent as EventListener)
      eventSource.onopen = () => {
        connection.value = 'connected'
        error.value = ''
      }
      eventSource.onerror = () => {
        connection.value = 'reconnecting'
        error.value = 'Live stream disconnected; EventSource is retrying.'
      }
    } catch (cause) {
      connection.value = 'disconnected'
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function disconnect() {
    eventSource?.close()
    eventSource = null
    connection.value = 'disconnected'
  }

  async function updateState(patch: TimelinePatch) {
    error.value = ''
    try {
      const result = await requestJson<{ state: ControlState }>(apiBase, '/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      state.value = result.state
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  onBeforeUnmount(disconnect)

  return {
    apiBase,
    catalog,
    snapshot,
    metrics,
    state,
    currentTime,
    recentEvents,
    connection,
    error,
    connect,
    disconnect,
    updateState,
  }
}

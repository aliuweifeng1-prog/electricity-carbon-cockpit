/**
 * SSE 事件流（§8.5/§8.6）：
 * - 断线后指数重连 1s/2s/5s/10s/30s，携带 Last-Event-ID
 * - 连续失败 3 次进入轮询降级（由调用方配合 bootstrap/告警/时序轮询）
 */
import { onBeforeUnmount, ref } from 'vue'
import { openCockpitEventStream } from '../api/cockpit'
import { useCockpitStore } from '../stores/cockpit'
import type { CockpitScope } from '../types/cockpit'

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]

export function useCockpitEvents(enabled: () => boolean) {
  const store = useCockpitStore()
  const running = ref(false)
  let closeStream: (() => void) | null = null
  let retryTimer: number | undefined
  let stopped = false

  function connect(scope: CockpitScope) {
    if (stopped || !enabled()) return
    closeStream = openCockpitEventStream(scope, store.stream.lastEventId, {
      onEvent: (event) => store.applyStreamEvent(event),
      onOpen: () => store.setStreamConnected(true),
      onError: () => {
        store.setStreamConnected(false)
        store.setStreamFailure()
        closeStream?.()
        closeStream = null
        scheduleReconnect(scope)
      },
    })
  }

  function scheduleReconnect(scope: CockpitScope) {
    if (stopped) return
    const backoff = BACKOFF_MS[Math.min(store.stream.reconnectCount, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]
    retryTimer = window.setTimeout(() => connect(scope), backoff)
  }

  function start(scope: CockpitScope) {
    stopped = false
    running.value = true
    connect(scope)
  }

  function stop() {
    stopped = true
    running.value = false
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryTimer = undefined
    closeStream?.()
    closeStream = null
    store.setStreamConnected(false)
  }

  onBeforeUnmount(stop)

  return { running, start, stop }
}

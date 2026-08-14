/**
 * 驾驶舱状态管理（§9.4）。
 * 拆分：session / scope / bootstrap / map / stream / ui。
 * 禁止把全部数据堆在一个巨型 overview 对象后全量替换；遥测更新按 resource_id 精确更新。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BootstrapData,
  CockpitAlert,
  CockpitScope,
  CockpitStreamEvent,
  DecisionSuggestion,
  MapViewMode,
  OperationStatus,
  ProvinceSummary,
  ResourceCluster,
  ResourceDetail,
  ResourceMarker,
  ScenarioType,
  TimeRange,
} from '../types/cockpit'
import { isDemoMode } from '../api/cockpit'
import { isLiangzhuStation, makeLiangzhuMarker } from '../utils/liangzhu'

export interface SessionState {
  mode: 'standalone' | 'embedded'
  ticket: string | null
  nonce: string
  environment: string
  authStatus: 'none' | 'pending' | 'ready' | 'expired'
  /** 宿主告知的演示模式（host demo_mode） */
  hostDemoMode: boolean
}

export interface StreamState {
  connected: boolean
  lastEventId: string | null
  reconnectCount: number
  degraded: boolean
  consecutiveFailures: number
}

export interface UiState {
  fullscreen: boolean
  autoPatrol: boolean
  drawerOpen: boolean
  searchOpen: boolean
  criticalToastShown: boolean
}

export const useCockpitStore = defineStore('cockpit', () => {
  // ===== session =====
  const session = ref<SessionState>({
    mode: 'standalone',
    ticket: null,
    nonce: '',
    environment: import.meta.env.PROD ? 'production' : 'development',
    authStatus: 'none',
    hostDemoMode: false,
  })

  // ===== scope =====
  const scope = ref<CockpitScope>({ type: 'all', id: 'all', name: '全部资源' })
  const timeRange = ref<TimeRange>('today')
  const scenario = ref<ScenarioType>('all')
  const highlightType = ref<string | null>(null)
  const mapScope = ref<string>('country')

  // ===== bootstrap =====
  const bootstrap = ref<BootstrapData | null>(null)
  const bootstrapStatus = ref<'idle' | 'loading' | 'ready' | 'error' | 'stale' | 'partial'>('idle')
  const bootstrapError = ref<string | null>(null)
  const lastRefreshAt = ref<string | null>(null)
  const dataVersion = ref<string | null>(null)

  // ===== map =====
  const viewMode = ref<MapViewMode>('resource')
  const markers = ref<ResourceMarker[]>([])
  const clusters = ref<ResourceCluster[]>([])
  const selectedResource = ref<ResourceDetail | null>(null)
  const selectedMarker = ref<ResourceMarker | null>(null)
  const resourceMapStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const resourceMapQuality = ref<'good' | 'partial' | 'stale' | 'missing' | 'demo'>('missing')
  const mapAsOf = ref<string | null>(null)

  // ===== stream =====
  const stream = ref<StreamState>({
    connected: false,
    lastEventId: null,
    reconnectCount: 0,
    degraded: false,
    consecutiveFailures: 0,
  })

  // ===== ui =====
  const ui = ref<UiState>({
    fullscreen: false,
    autoPatrol: false,
    drawerOpen: false,
    searchOpen: false,
    criticalToastShown: false,
  })

  const demoMode = computed(() => isDemoMode())
  const overallQuality = computed(() => bootstrap.value?.overall_quality_status ?? 'missing')
  const criticalAlertCount = computed(() =>
    (bootstrap.value?.top_alerts ?? []).filter(a => a.severity === 'critical' || a.severity === 'high').length,
  )
  const sourceHealth = computed(() => bootstrap.value?.source_health ?? null)
  const indicators = computed(() => bootstrap.value?.indicators ?? [])
  const provinceSummaries = computed<ProvinceSummary[]>(() => {
    const summaries = new Map<string, ProvinceSummary>()
    const statusPriority: Record<OperationStatus, number> = {
      normal: 0,
      maintenance: 1,
      offline: 2,
      warning: 3,
      alarm: 4,
    }

    for (const marker of markers.value) {
      const regionCode = `${marker.region_code.slice(0, 2)}0000`
      if (!/^\d{6}$/.test(regionCode)) continue
      const current = summaries.get(regionCode) ?? {
        region_code: regionCode,
        region_name: marker.region_name,
        total_capacity_mw: 0,
        station_count: 0,
        // ResourceMapData does not carry daily energy; keep the field neutral until the summary API is connected.
        generation_mwh: 0,
        status: 'normal' as OperationStatus,
      }
      current.total_capacity_mw += marker.rated_power_mw ?? 0
      current.station_count += 1
      if (statusPriority[marker.operation_status] > statusPriority[current.status]) {
        current.status = marker.operation_status
      }
      summaries.set(regionCode, current)
    }

    return [...summaries.values()].map((summary) => ({
      ...summary,
      total_capacity_mw: Math.round(summary.total_capacity_mw * 10) / 10,
    }))
  })

  function setSession(patch: Partial<SessionState>) {
    session.value = { ...session.value, ...patch }
  }

  function setScope(next: CockpitScope) {
    scope.value = { ...next }
    // 范围变化后丢弃旧数据版本，防止迟到响应串范围（§6.1）
    dataVersion.value = null
  }

  function setTimeRange(next: TimeRange) {
    timeRange.value = next
  }

  function setScenario(next: ScenarioType) {
    scenario.value = next
  }

  function setHighlightType(type: string | null) {
    highlightType.value = type
  }

  function setMapScope(next: string) {
    mapScope.value = next
  }

  function setBootstrap(data: BootstrapData) {
    bootstrap.value = data
    dataVersion.value = data.data_version
    lastRefreshAt.value = data.generated_at
    bootstrapStatus.value = data.overall_quality_status === 'demo' ? 'ready' : 'ready'
    bootstrapError.value = null
  }

  function setBootstrapStatus(status: 'idle' | 'loading' | 'ready' | 'error' | 'stale' | 'partial', error: string | null = null) {
    bootstrapStatus.value = status
    bootstrapError.value = error
  }

  function setResourceMap(data: { markers: ResourceMarker[]; clusters: ResourceCluster[]; quality: typeof resourceMapQuality.value; as_of: string; data_version: string }) {
    // 注入专题演示站点：余杭良渚光伏储能电站（若接口已返回则不重复追加）
    markers.value = data.markers.some((m) => isLiangzhuStation(m.resource_id))
      ? data.markers
      : [...data.markers, makeLiangzhuMarker()]
    clusters.value = data.clusters
    resourceMapQuality.value = data.quality
    mapAsOf.value = data.as_of
    dataVersion.value = data.data_version
    resourceMapStatus.value = 'ready'
  }

  function setResourceMapStatus(status: 'idle' | 'loading' | 'ready' | 'error') {
    resourceMapStatus.value = status
  }

  function selectResource(detail: ResourceDetail, marker: ResourceMarker | null) {
    selectedResource.value = detail
    selectedMarker.value = marker
    ui.value.drawerOpen = true
  }

  function clearSelectedResource() {
    selectedResource.value = null
    selectedMarker.value = null
    ui.value.drawerOpen = false
  }

  function setViewMode(mode: MapViewMode) {
    viewMode.value = mode
  }

  /** 遥测/状态事件按 resource_id 精确更新，不重建整个场景（§9.4） */
  function applyStreamEvent(event: CockpitStreamEvent) {
    stream.value.lastEventId = (event as unknown as { _last_event_id?: string })._last_event_id ?? stream.value.lastEventId
    const payload = event.payload ?? {}
    const resourceId = payload.resource_id as string | undefined
    if (event.event_type === 'resource.telemetry_updated' || event.event_type === 'resource.status_changed') {
      if (resourceId) {
        const idx = markers.value.findIndex(m => m.resource_id === resourceId)
        if (idx >= 0) {
          const next = { ...markers.value[idx] }
          if (typeof payload.current_power_mw === 'number') next.current_power_mw = payload.current_power_mw
          if (typeof payload.soc_pct === 'number') next.soc_pct = payload.soc_pct
          if (typeof payload.operation_status === 'string') next.operation_status = payload.operation_status as ResourceMarker['operation_status']
          if (typeof payload.online_status === 'boolean') next.online_status = payload.online_status
          next.as_of = event.occurred_at
          const copy = [...markers.value]
          copy[idx] = next
          markers.value = copy
        }
      }
    } else if (event.event_type === 'metric.updated' && bootstrap.value) {
      // 指标增量更新：按 payload.key 替换对应指标
      const key = payload.key as string | undefined
      if (key && bootstrap.value) {
        const list = [...bootstrap.value.indicators]
        const idx = list.findIndex(i => i.key === key)
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...(payload as Partial<typeof list[number]>) }
          bootstrap.value = { ...bootstrap.value, indicators: list }
        }
      }
    } else if (event.event_type === 'alert.created' || event.event_type === 'alert.updated') {
      const alert = payload as unknown as CockpitAlert | undefined
      if (alert?.alert_id && bootstrap.value) {
        const list = [...bootstrap.value.top_alerts]
        const idx = list.findIndex(a => a.alert_id === alert.alert_id)
        if (idx >= 0) list[idx] = alert
        else list.unshift(alert)
        bootstrap.value = { ...bootstrap.value, top_alerts: list.slice(0, 20) }
      }
    } else if (event.event_type === 'decision.created') {
      const decision = payload as unknown as DecisionSuggestion | undefined
      if (decision?.suggestion_id && bootstrap.value) {
        bootstrap.value = { ...bootstrap.value, top_decisions: [decision, ...bootstrap.value.top_decisions].slice(0, 10) }
      }
    } else if (event.event_type === 'source.health_changed') {
      const health = payload as Partial<BootstrapData['source_health']> | undefined
      if (health && bootstrap.value) {
        bootstrap.value = { ...bootstrap.value, source_health: { ...bootstrap.value.source_health, ...health } }
      }
    }
  }

  function setStreamConnected(connected: boolean) {
    stream.value.connected = connected
    if (connected) {
      stream.value.consecutiveFailures = 0
      stream.value.degraded = false
    }
  }

  function setStreamFailure() {
    stream.value.consecutiveFailures += 1
    stream.value.reconnectCount += 1
    if (stream.value.consecutiveFailures >= 3) {
      stream.value.degraded = true
    }
  }

  function setStreamDegraded(degraded: boolean) {
    stream.value.degraded = degraded
  }

  function setUi(patch: Partial<UiState>) {
    ui.value = { ...ui.value, ...patch }
  }

  return {
    session,
    scope,
    timeRange,
    scenario,
    highlightType,
    mapScope,
    bootstrap,
    bootstrapStatus,
    bootstrapError,
    lastRefreshAt,
    dataVersion,
    viewMode,
    markers,
    clusters,
    selectedResource,
    selectedMarker,
    resourceMapStatus,
    resourceMapQuality,
    mapAsOf,
    stream,
    ui,
    demoMode,
    overallQuality,
    criticalAlertCount,
    sourceHealth,
    indicators,
    provinceSummaries,
    setSession,
    setScope,
    setTimeRange,
    setScenario,
    setHighlightType,
    setMapScope,
    setBootstrap,
    setBootstrapStatus,
    setResourceMap,
    setResourceMapStatus,
    selectResource,
    clearSelectedResource,
    setViewMode,
    applyStreamEvent,
    setStreamConnected,
    setStreamFailure,
    setStreamDegraded,
    setUi,
  }
})


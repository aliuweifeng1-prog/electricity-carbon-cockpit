/**
 * 电碳协同驾驶舱 v2 数据合同（与《电碳协同驾驶舱改造与平台接入开发技术文档_20260811》§4 保持一致）。
 * 所有字段必须携带元数据；null 显示 `--`，真实 0 显示 0。
 */

export type QualityStatus = 'good' | 'partial' | 'stale' | 'missing' | 'demo'
export type ValueStatus = 'realtime' | 'estimated' | 'settled' | 'verified'

export type ScopeType = 'all' | 'organization' | 'region' | 'site'
export type TimeRange = 'realtime' | 'today' | 'month'
export type ScenarioType = 'all' | 'commercial' | 'storage' | 'pv' | 'charging' | 'aidc' | 'microgrid'
export type MapViewMode = 'resource' | 'power' | 'dispatch' | 'alert'
export type ResourceType = 'storage' | 'pv' | 'wind' | 'charging' | 'load' | 'aidc' | 'microgrid' | 'vpp'
export type OperationStatus = 'normal' | 'warning' | 'alarm' | 'offline' | 'maintenance'
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type RiskLevel = 'high' | 'medium' | 'low'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'expired'
export type ValueType = 'energy' | 'capacity' | 'regulation' | 'green' | 'quality'
export type MarketType = 'spot' | 'agency' | 'tou' | 'ancillary'

export interface TimeSeriesPoint {
  timestamp: string
  value: number | null
  quality_status: QualityStatus
}

/** 顶部北极星指标（§4.2） */
export interface CockpitIndicator {
  key: string
  label: string
  value: number | null
  display_value: string
  unit: string
  compare_value: number | null
  compare_label: string | null
  value_status: ValueStatus
  quality_status: QualityStatus
  as_of: string
  source_system: string
  source_refs: string[]
  calculation_version: string | null
  /** 副值，如持续时长、绿电 MWh、已结算/估算、方法版本 */
  sub_value: { label: string; value: number | null; unit: string } | null
  /** 迷你趋势（如最近 60 分钟净负荷） */
  sparkline: TimeSeriesPoint[] | null
}

/** 地球资源点（§4.3） */
export interface ResourceMarker {
  resource_id: string
  site_id: string
  name: string
  resource_type: ResourceType
  longitude: number
  latitude: number
  region_code: string
  region_name: string
  operation_status: OperationStatus
  online_status: boolean
  current_power_mw: number | null
  rated_power_mw: number | null
  verified_adjustable_up_mw: number | null
  verified_adjustable_down_mw: number | null
  sustainable_duration_h: number | null
  soc_pct: number | null
  active_dispatch_count: number
  highest_alert_severity: AlertSeverity | null
  as_of: string
  quality_status: QualityStatus
}

/** 聚合点（地球级按省/区域聚合） */
export interface ResourceCluster {
  cluster_id: string
  resource_count: number
  site_count: number
  total_current_power_mw: number | null
  total_verified_adjustable_mw: number | null
  bounds: { min_lon: number; min_lat: number; max_lon: number; max_lat: number }
  region_code: string
  region_name: string
  operation_status: OperationStatus
  online_count: number
  alarm_count: number
  highest_alert_severity: AlertSeverity | null
  as_of: string
  quality_status: QualityStatus
}

/** 省级宏观汇总，供全国 GIS 省份 3D 图层与后续总览面板复用。 */
export interface ProvinceSummary {
  region_code: string
  region_name: string
  total_capacity_mw: number
  station_count: number
  generation_mwh: number
  status: OperationStatus
}

/** 地图渲染组件使用的轻量资源标记。 */
export interface MapDevice {
  id: string
  name: string
  lng: number
  lat: number
  type?: string
  status?: string
  load?: number
  power?: number
  soc?: number | null
  revenue?: number
  region?: string
}

/** 左侧资源运行（§4.4） */
export interface ResourceSummaryItem {
  resource_type: ResourceType
  resource_count: number
  online_count: number
  current_power_mw: number | null
  installed_capacity_mw: number | null
  verified_adjustable_power_mw: number | null
  sustainable_duration_h: number | null
  availability_pct: number | null
  energy_capacity_mwh: number | null
  soc_avg_pct: number | null
  connected_terminal_count: number | null
  controllable_terminal_count: number | null
  baseline_power_mw: number | null
  curtailable_power_mw: number | null
}

/** 功率平衡（§4.5） */
export interface PowerBalanceData {
  load_total_mw: TimeSeriesPoint[]
  renewable_generation_mw: TimeSeriesPoint[]
  storage_power_mw: TimeSeriesPoint[]
  grid_exchange_mw: TimeSeriesPoint[]
  charging_load_mw: TimeSeriesPoint[]
  balance_error_mw: number | null
  data_gap_minutes: number | null
  granularity_minutes: number
  range_hours: number
  as_of: string
  quality_status: QualityStatus
}

/** 调用与履约（§4.6） */
export interface DispatchSummary {
  active_event_count: number
  target_response_mw: number | null
  actual_response_mw: number | null
  fulfillment_rate_pct: number | null
  max_deviation_pct: number | null
  avg_response_seconds: number | null
  unconfirmed_event_count: number
  estimated_penalty_cny: number | null
  rule_version: string | null
  quality_status: QualityStatus
  as_of: string
}

/** 市场与价格（§4.7） */
export interface MarketSummary {
  market_type: MarketType
  day_ahead_price_cny_mwh: TimeSeriesPoint[] | null
  realtime_price_cny_mwh: TimeSeriesPoint[] | null
  tou_price_cny_kwh: TimeSeriesPoint[] | null
  current_price_cny_mwh: number | null
  peak_valley_spread_cny_kwh: number | null
  next_opportunity_start: string | null
  next_opportunity_end: string | null
  opportunity_type: string | null
  price_source: string | null
  unit: '元/MWh' | '元/kWh'
  quality_status: QualityStatus
  as_of: string
}

/** 五重价值（§4.8） */
export interface ValueItem {
  type: ValueType
  label: string
  value_cny: number | null
  value_status: 'estimated' | 'settled' | 'unavailable'
  calculation_version: string | null
  source_refs: string[]
  as_of: string
  quality_status: QualityStatus
}

/** 告警（§4.9） */
export interface CockpitAlert {
  alert_id: string
  severity: AlertSeverity
  category: string
  title: string
  description: string
  resource_id: string | null
  region_name: string | null
  started_at: string
  duration_seconds: number
  status: AlertStatus
  impact_value: number | null
  impact_unit: string | null
  handler_path: string | null
}

/** AI 建议（§4.9） */
export interface DecisionSuggestion {
  suggestion_id: string
  title: string
  summary: string
  evidence: Array<{ label: string; value: string; source_ref: string }>
  expected_revenue_cny: number | null
  expected_carbon_reduction_tco2e: number | null
  risk_level: RiskLevel
  confidence: number | null
  model_version: string | null
  rule_version: string | null
  review_status: ReviewStatus
  valid_until: string | null
  handler_path: string
}

/** 业务待办 */
export interface BusinessTodo {
  todo_id: string
  title: string
  count: number
  handler_path: string
}

export interface SourceHealth {
  total: number
  healthy: number
  delayed: number
  unavailable: number
}

export interface CockpitScope {
  type: ScopeType
  id: string
  name: string
}

/** Bootstrap 响应（§8.3） */
export interface BootstrapData {
  contract_version: string
  scope: CockpitScope
  as_of: string
  generated_at: string
  overall_quality_status: QualityStatus
  data_version: string
  scope_id: string
  indicators: CockpitIndicator[]
  resource_summary: ResourceSummaryItem[]
  dispatch_summary: DispatchSummary | null
  market_summary: MarketSummary | null
  value_summary: ValueItem[]
  top_alerts: CockpitAlert[]
  top_decisions: DecisionSuggestion[]
  todos: BusinessTodo[]
  source_health: SourceHealth
}

/** 资源详情（§4.10） */
export interface ResourceDetail {
  resource_id: string
  site_id: string
  name: string
  resource_type: ResourceType
  organization_name: string
  site_name: string
  region_name: string
  operation_status: OperationStatus
  online_status: boolean
  as_of: string
  quality_status: QualityStatus
  current_power_mw: number | null
  rated_power_mw: number | null
  load_rate_pct: number | null
  verified_adjustable_up_mw: number | null
  verified_adjustable_down_mw: number | null
  sustainable_duration_h: number | null
  available_window: string | null
  soc_pct: number | null
  soh_pct: number | null
  energy_capacity_mwh: number | null
  today_energy_mwh: number | null
  today_revenue_cny: number | null
  today_carbon_reduction_tco2e: number | null
  alerts: CockpitAlert[]
  active_dispatch_events: Array<{ event_id: string; title: string; target_mw: number | null; status: string }>
}

/** 资源地图响应 */
export interface ResourceMapData {
  scope_id: string
  data_version: string
  view_mode: MapViewMode
  markers: ResourceMarker[]
  clusters: ResourceCluster[]
  quality_status: QualityStatus
  as_of: string
}

/** 功能开关（§13.1） */
export interface CockpitFeatureFlags {
  cockpit_v2_enabled: boolean
  cockpit_v2_user_allowlist: string[]
  cockpit_v2_org_allowlist: string[]
  cockpit_v2_real_data_enabled: boolean
  cockpit_v2_sse_enabled: boolean
  cockpit_v2_legacy_fallback: boolean
}

/** SSE 事件（§8.5） */
export type CockpitEventType =
  | 'metric.updated'
  | 'resource.status_changed'
  | 'resource.telemetry_updated'
  | 'alert.created'
  | 'alert.updated'
  | 'dispatch.started'
  | 'dispatch.progressed'
  | 'dispatch.completed'
  | 'decision.created'
  | 'source.health_changed'

export interface CockpitStreamEvent {
  event_id: string
  event_type: CockpitEventType
  scope_id: string
  occurred_at: string
  data_version: string
  payload: Record<string, unknown>
}

export interface CockpitApiEnvelope<T> {
  code: number
  message: string
  data: T
  trace_id: string
}

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  storage: '储能',
  pv: '光伏',
  wind: '风电',
  charging: '充换电',
  load: '可调负荷',
  aidc: 'AIDC',
  microgrid: '微电网',
  vpp: 'VPP',
}

export const VALUE_TYPE_LABEL: Record<ValueType, string> = {
  energy: '电量价值',
  capacity: '容量价值',
  regulation: '调节价值',
  green: '绿色价值',
  quality: '质量价值',
}

export const QUALITY_LABEL: Record<QualityStatus, string> = {
  good: '正常',
  partial: '部分可用',
  stale: '已延迟',
  missing: '暂无数据',
  demo: '演示数据',
}

export const VALUE_STATUS_LABEL: Record<ValueStatus, string> = {
  realtime: '实时',
  estimated: '估',
  settled: '结',
  verified: '核',
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
}

export const SCOPE_TYPE_LABEL: Record<ScopeType, string> = {
  all: '全部资源',
  organization: '组织',
  region: '区域',
  site: '站点',
}

/**
 * 驾驶舱聚合接口（§8.2）。
 * 生产：请求 /api/v1/cockpit/*；失败抛错，UI 显示明确状态。
 * 演示：仅当 VITE_DEMO_MODE 开启（开发默认开启、生产默认关闭）时使用演示适配器，
 * 所有演示数据 quality_status='demo'，页面必须持续显示“演示数据”标记，且不使用 Math.random。
 */
import { getCockpit, postCockpit } from './client'
import type {
  BootstrapData,
  CockpitFeatureFlags,
  CockpitScope,
  CockpitStreamEvent,
  DecisionSuggestion,
  DispatchSummary,
  MarketSummary,
  PowerBalanceData,
  ResourceCluster,
  ResourceDetail,
  ResourceMapData,
  ResourceMarker,
  TimeSeriesPoint,
} from '../types/cockpit'
import { VALUE_TYPE_LABEL } from '../types/cockpit'

export function isDemoMode(): boolean {
  const env = import.meta.env.VITE_DEMO_MODE
  if (env === 'true') return true
  if (env === 'false') return false
  return import.meta.env.DEV
}

export const COCKPIT_APP_VERSION = '2.0.0'
export const COCKPIT_CONTRACT_VERSION = '1.0'

// ============ 演示适配器（确定性数据，无随机） ============

function demoNow(offsetMin = 0): string {
  return new Date(Date.now() - offsetMin * 60000).toISOString()
}

function demoPoint(timestamp: string, value: number | null): TimeSeriesPoint {
  return { timestamp, value, quality_status: 'demo' }
}

/** 确定性 15 分钟序列：base + amp * sin，无随机 */
function demoSeries(count: number, base: number, amp: number, phase: number, stepMin: number, gapAt?: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []
  const now = Date.now()
  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(now - i * stepMin * 60000).toISOString()
    const v = Math.round((base + amp * Math.sin((i / count) * Math.PI * 2 + phase)) * 10) / 10
    points.push(demoPoint(ts, gapAt === i ? null : v))
  }
  return points
}

const DEMO_RESOURCES: ResourceMarker[] = [
  { resource_id: 'PV-WZ-02', site_id: 'SITE-WZ-02', name: '温州光伏 A 区', resource_type: 'pv', longitude: 120.65, latitude: 27.99, region_code: '330000', region_name: '浙江省', operation_status: 'normal', online_status: true, current_power_mw: 2.8, rated_power_mw: 8, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 3.2, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-SH-03', site_id: 'SITE-SH-03', name: '上海数据中心 AIDC', resource_type: 'aidc', longitude: 121.47, latitude: 31.23, region_code: '310000', region_name: '上海市', operation_status: 'warning', online_status: true, current_power_mw: 6.8, rated_power_mw: 12, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 1.6, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: 'medium', as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-JN-05', site_id: 'SITE-JN-05', name: '济南充电站', resource_type: 'charging', longitude: 117.0, latitude: 36.65, region_code: '370000', region_name: '山东省', operation_status: 'normal', online_status: true, current_power_mw: 1.4, rated_power_mw: 4, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 0.8, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-CD-06', site_id: 'SITE-CD-06', name: '成都储能电站', resource_type: 'storage', longitude: 104.07, latitude: 30.67, region_code: '510000', region_name: '四川省', operation_status: 'normal', online_status: true, current_power_mw: 3.0, rated_power_mw: 6, verified_adjustable_up_mw: 3.6, verified_adjustable_down_mw: 3.0, sustainable_duration_h: 2.4, soc_pct: 60, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-GZ-07', site_id: 'SITE-GZ-07', name: '广州光储充一体', resource_type: 'charging', longitude: 113.26, latitude: 23.13, region_code: '440000', region_name: '广东省', operation_status: 'normal', online_status: true, current_power_mw: 2.2, rated_power_mw: 5, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 1.2, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-XA-08', site_id: 'SITE-XA-08', name: '西安光伏电站', resource_type: 'pv', longitude: 108.94, latitude: 34.34, region_code: '610000', region_name: '陕西省', operation_status: 'normal', online_status: true, current_power_mw: 3.2, rated_power_mw: 7, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 3.0, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-WH-09', site_id: 'SITE-WH-09', name: '武汉储能电站', resource_type: 'storage', longitude: 114.3, latitude: 30.59, region_code: '420000', region_name: '湖北省', operation_status: 'alarm', online_status: true, current_power_mw: 4.8, rated_power_mw: 9, verified_adjustable_up_mw: 1.2, verified_adjustable_down_mw: 4.4, sustainable_duration_h: 0.6, soc_pct: 18, active_dispatch_count: 1, highest_alert_severity: 'critical', as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-BJ-11', site_id: 'SITE-BJ-11', name: '北京光伏集群', resource_type: 'pv', longitude: 116.4, latitude: 39.9, region_code: '110000', region_name: '北京市', operation_status: 'normal', online_status: true, current_power_mw: 3.5, rated_power_mw: 6, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 2.8, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'WIND-HHHT-14', site_id: 'SITE-HHHT-14', name: '呼和浩特风电基地', resource_type: 'wind', longitude: 111.75, latitude: 40.84, region_code: '150000', region_name: '内蒙古自治区', operation_status: 'normal', online_status: true, current_power_mw: 5.6, rated_power_mw: 15, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 7.5, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-WLMQ-15', site_id: 'SITE-WLMQ-15', name: '乌鲁木齐光伏电站', resource_type: 'pv', longitude: 87.62, latitude: 43.82, region_code: '650000', region_name: '新疆维吾尔自治区', operation_status: 'normal', online_status: true, current_power_mw: 4.6, rated_power_mw: 12, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 5.8, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-LZ-16', site_id: 'SITE-LZ-16', name: '兰州储能电站', resource_type: 'storage', longitude: 103.82, latitude: 36.06, region_code: '620000', region_name: '甘肃省', operation_status: 'normal', online_status: true, current_power_mw: 3.8, rated_power_mw: 9, verified_adjustable_up_mw: 4.2, verified_adjustable_down_mw: 3.9, sustainable_duration_h: 2.0, soc_pct: 74, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-TJ-17', site_id: 'SITE-TJ-17', name: '天津滨海储能电站', resource_type: 'storage', longitude: 117.2, latitude: 39.12, region_code: '120000', region_name: '天津市', operation_status: 'normal', online_status: true, current_power_mw: 4.2, rated_power_mw: 10, verified_adjustable_up_mw: 4.8, verified_adjustable_down_mw: 4.3, sustainable_duration_h: 2.0, soc_pct: 66, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-SJZ-18', site_id: 'SITE-SJZ-18', name: '石家庄充换电站', resource_type: 'charging', longitude: 114.52, latitude: 38.05, region_code: '130000', region_name: '河北省', operation_status: 'normal', online_status: true, current_power_mw: 2.1, rated_power_mw: 5, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 1.3, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-TY-19', site_id: 'SITE-TY-19', name: '太原分布式光伏电站', resource_type: 'pv', longitude: 112.55, latitude: 37.87, region_code: '140000', region_name: '山西省', operation_status: 'normal', online_status: true, current_power_mw: 5.1, rated_power_mw: 12, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 4.8, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'AIDC-SY-20', site_id: 'SITE-SY-20', name: '沈阳算力中心', resource_type: 'aidc', longitude: 123.43, latitude: 41.8, region_code: '210000', region_name: '辽宁省', operation_status: 'warning', online_status: true, current_power_mw: 7.2, rated_power_mw: 14, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 2.1, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: 'medium', as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'WIND-CC-21', site_id: 'SITE-CC-21', name: '长春风电集群', resource_type: 'wind', longitude: 125.32, latitude: 43.9, region_code: '220000', region_name: '吉林省', operation_status: 'normal', online_status: true, current_power_mw: 8.6, rated_power_mw: 20, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 8.4, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'WIND-HEB-22', site_id: 'SITE-HEB-22', name: '哈尔滨风储基地', resource_type: 'wind', longitude: 126.63, latitude: 45.75, region_code: '230000', region_name: '黑龙江省', operation_status: 'normal', online_status: true, current_power_mw: 9.4, rated_power_mw: 24, verified_adjustable_up_mw: 1.2, verified_adjustable_down_mw: 9.8, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 1, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'MG-NJ-23', site_id: 'SITE-NJ-23', name: '南京江北微电网', resource_type: 'microgrid', longitude: 118.8, latitude: 32.06, region_code: '320000', region_name: '江苏省', operation_status: 'normal', online_status: true, current_power_mw: 4.7, rated_power_mw: 11, verified_adjustable_up_mw: 2.6, verified_adjustable_down_mw: 3.4, sustainable_duration_h: 1.5, soc_pct: 71, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-HF-24', site_id: 'SITE-HF-24', name: '合肥光伏电站', resource_type: 'pv', longitude: 117.23, latitude: 31.82, region_code: '340000', region_name: '安徽省', operation_status: 'normal', online_status: true, current_power_mw: 4.3, rated_power_mw: 10, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 4.1, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-FZ-25', site_id: 'SITE-FZ-25', name: '福州光储充场站', resource_type: 'charging', longitude: 119.3, latitude: 26.08, region_code: '350000', region_name: '福建省', operation_status: 'normal', online_status: true, current_power_mw: 2.6, rated_power_mw: 6, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 1.5, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-NC-26', site_id: 'SITE-NC-26', name: '南昌光伏电站', resource_type: 'pv', longitude: 115.86, latitude: 28.68, region_code: '360000', region_name: '江西省', operation_status: 'normal', online_status: true, current_power_mw: 3.9, rated_power_mw: 9, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 3.7, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'VPP-ZZ-27', site_id: 'SITE-ZZ-27', name: '郑州虚拟电厂', resource_type: 'vpp', longitude: 113.62, latitude: 34.75, region_code: '410000', region_name: '河南省', operation_status: 'normal', online_status: true, current_power_mw: 12.4, rated_power_mw: 30, verified_adjustable_up_mw: 7.8, verified_adjustable_down_mw: 9.2, sustainable_duration_h: 1.5, soc_pct: null, active_dispatch_count: 1, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-CS-28', site_id: 'SITE-CS-28', name: '长沙储能电站', resource_type: 'storage', longitude: 112.94, latitude: 28.23, region_code: '430000', region_name: '湖南省', operation_status: 'warning', online_status: true, current_power_mw: 5.7, rated_power_mw: 13, verified_adjustable_up_mw: 5.9, verified_adjustable_down_mw: 5.3, sustainable_duration_h: 1.8, soc_pct: 42, active_dispatch_count: 0, highest_alert_severity: 'medium', as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'CP-NN-29', site_id: 'SITE-NN-29', name: '南宁充换电枢纽', resource_type: 'charging', longitude: 108.32, latitude: 22.82, region_code: '450000', region_name: '广西壮族自治区', operation_status: 'normal', online_status: true, current_power_mw: 2.4, rated_power_mw: 6, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 1.7, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'MG-HK-30', site_id: 'SITE-HK-30', name: '海口园区微电网', resource_type: 'microgrid', longitude: 110.2, latitude: 20.04, region_code: '460000', region_name: '海南省', operation_status: 'normal', online_status: true, current_power_mw: 3.3, rated_power_mw: 8, verified_adjustable_up_mw: 1.8, verified_adjustable_down_mw: 2.4, sustainable_duration_h: 1.4, soc_pct: 63, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'ESS-CQ-31', site_id: 'SITE-CQ-31', name: '重庆两江储能电站', resource_type: 'storage', longitude: 106.55, latitude: 29.56, region_code: '500000', region_name: '重庆市', operation_status: 'normal', online_status: true, current_power_mw: 6.1, rated_power_mw: 15, verified_adjustable_up_mw: 6.8, verified_adjustable_down_mw: 6.2, sustainable_duration_h: 2.0, soc_pct: 72, active_dispatch_count: 1, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'AIDC-GY-32', site_id: 'SITE-GY-32', name: '贵阳算力中心', resource_type: 'aidc', longitude: 106.63, latitude: 26.65, region_code: '520000', region_name: '贵州省', operation_status: 'warning', online_status: true, current_power_mw: 8.2, rated_power_mw: 16, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 2.5, sustainable_duration_h: 0.5, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: 'high', as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-KM-33', site_id: 'SITE-KM-33', name: '昆明光伏电站', resource_type: 'pv', longitude: 102.71, latitude: 25.04, region_code: '530000', region_name: '云南省', operation_status: 'normal', online_status: true, current_power_mw: 5.3, rated_power_mw: 13, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 5.1, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-LS-34', site_id: 'SITE-LS-34', name: '拉萨高原光伏电站', resource_type: 'pv', longitude: 91.13, latitude: 29.65, region_code: '540000', region_name: '西藏自治区', operation_status: 'normal', online_status: true, current_power_mw: 6.6, rated_power_mw: 18, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 6.4, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'WIND-XN-35', site_id: 'SITE-XN-35', name: '西宁风储基地', resource_type: 'wind', longitude: 101.78, latitude: 36.62, region_code: '630000', region_name: '青海省', operation_status: 'normal', online_status: true, current_power_mw: 10.2, rated_power_mw: 26, verified_adjustable_up_mw: 1.6, verified_adjustable_down_mw: 10.8, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
  { resource_id: 'PV-YC-36', site_id: 'SITE-YC-36', name: '银川光伏电站', resource_type: 'pv', longitude: 106.23, latitude: 38.49, region_code: '640000', region_name: '宁夏回族自治区', operation_status: 'normal', online_status: true, current_power_mw: 7.1, rated_power_mw: 19, verified_adjustable_up_mw: 0, verified_adjustable_down_mw: 7.4, sustainable_duration_h: null, soc_pct: null, active_dispatch_count: 0, highest_alert_severity: null, as_of: demoNow(), quality_status: 'demo' },
]

function demoClusters(): ResourceCluster[] {
  const groups = new Map<string, ResourceMarker[]>()
  for (const r of DEMO_RESOURCES) {
    const list = groups.get(r.region_name) ?? []
    list.push(r)
    groups.set(r.region_name, list)
  }
  return Array.from(groups.entries()).map(([regionName, list]) => {
    const lons = list.map(r => r.longitude)
    const lats = list.map(r => r.latitude)
    const severity = list
      .map(r => r.highest_alert_severity)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => severityRank(b) - severityRank(a))[0] ?? null
    return {
      cluster_id: `cluster-${regionName}`,
      resource_count: list.length,
      site_count: new Set(list.map(r => r.site_id)).size,
      total_current_power_mw: Math.round(list.reduce((s, r) => s + (r.current_power_mw ?? 0), 0) * 10) / 10,
      total_verified_adjustable_mw: Math.round(list.reduce((s, r) => s + (r.verified_adjustable_down_mw ?? 0) + (r.verified_adjustable_up_mw ?? 0), 0) * 10) / 10,
      bounds: { min_lon: Math.min(...lons), min_lat: Math.min(...lats), max_lon: Math.max(...lons), max_lat: Math.max(...lats) },
      region_code: list[0].region_code,
      region_name: regionName,
      operation_status: list.some(r => r.operation_status === 'alarm') ? 'alarm' : list.some(r => r.operation_status === 'warning') ? 'warning' : 'normal',
      online_count: list.filter(r => r.online_status).length,
      alarm_count: list.filter(r => r.highest_alert_severity === 'critical' || r.highest_alert_severity === 'high').length,
      highest_alert_severity: severity,
      as_of: demoNow(),
      quality_status: 'demo',
    }
  })
}

function severityRank(s: string): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1
}

function demoBootstrap(): BootstrapData {
  const now = demoNow(3)
  return {
    contract_version: COCKPIT_CONTRACT_VERSION,
    scope: { type: 'all', id: 'all', name: '全部资源' },
    as_of: now,
    generated_at: demoNow(),
    overall_quality_status: 'demo',
    data_version: 'demo-20260811-v1',
    scope_id: 'all',
    indicators: [
      {
        key: 'verified_adjustable_power_mw',
        label: '已核验可调能力',
        value: 38.5,
        display_value: '38.5',
        unit: 'MW',
        compare_value: 45.2,
        compare_label: '注册容量',
        value_status: 'verified',
        quality_status: 'demo',
        as_of: now,
        source_system: 'capability-snapshot',
        source_refs: ['capability-demo-v1'],
        calculation_version: 'capability-v1',
        sub_value: { label: '可持续时长', value: 1.6, unit: 'h' },
        sparkline: null,
      },
      {
        key: 'current_net_load_mw',
        label: '当前净负荷',
        value: 31.2,
        display_value: '31.2',
        unit: 'MW',
        compare_value: -1.2,
        compare_label: '较15分钟前',
        value_status: 'realtime',
        quality_status: 'demo',
        as_of: now,
        source_system: 'metering',
        source_refs: ['meter-demo-batch'],
        calculation_version: 'net-load-v1',
        sub_value: null,
        sparkline: demoSeries(60, 31, 3.2, 0.6, 1),
      },
      {
        key: 'green_consumption_rate_pct',
        label: '今日绿电消纳率',
        value: 86.4,
        display_value: '86.4',
        unit: '%',
        compare_value: 4.5,
        compare_label: '较昨日',
        value_status: 'realtime',
        quality_status: 'demo',
        as_of: now,
        source_system: 'metering-green',
        source_refs: ['green-demo-20260811'],
        calculation_version: 'green-rate-v2',
        sub_value: { label: '绿电量', value: 12.8, unit: 'MWh' },
        sparkline: null,
      },
      {
        key: 'today_total_value_cny',
        label: '今日综合价值',
        value: 128600,
        display_value: '12.86',
        unit: '万元',
        compare_value: 6.2,
        compare_label: '同比',
        value_status: 'estimated',
        quality_status: 'demo',
        as_of: now,
        source_system: 'value-aggregation',
        source_refs: ['value-demo-20260811'],
        calculation_version: 'value-v1',
        sub_value: { label: '已结算', value: 96200, unit: '元' },
        sparkline: null,
      },
      {
        key: 'today_carbon_reduction_tco2e',
        label: '今日碳减排量',
        value: 126.8,
        display_value: '126.8',
        unit: 'tCO₂e',
        compare_value: 6.7,
        compare_label: '同比',
        value_status: 'estimated',
        quality_status: 'demo',
        as_of: now,
        source_system: 'carbon-accounting',
        source_refs: ['carbon-demo-20260811'],
        calculation_version: 'carbon-factor-v2.1',
        sub_value: null,
        sparkline: null,
      },
    ],
    resource_summary: [
      { resource_type: 'storage', resource_count: 5, online_count: 5, current_power_mw: 19.6, installed_capacity_mw: 41, verified_adjustable_power_mw: 38.7, sustainable_duration_h: 1.6, availability_pct: 98.2, energy_capacity_mwh: 82.4, soc_avg_pct: 62.6, connected_terminal_count: null, controllable_terminal_count: null, baseline_power_mw: null, curtailable_power_mw: null },
      { resource_type: 'pv', resource_count: 3, online_count: 3, current_power_mw: 9.5, installed_capacity_mw: 21, verified_adjustable_power_mw: 9.0, sustainable_duration_h: null, availability_pct: null, energy_capacity_mwh: null, soc_avg_pct: null, connected_terminal_count: null, controllable_terminal_count: null, baseline_power_mw: null, curtailable_power_mw: null },
      { resource_type: 'charging', resource_count: 3, online_count: 3, current_power_mw: 5.4, installed_capacity_mw: 13, verified_adjustable_power_mw: 3.0, sustainable_duration_h: 0.5, availability_pct: null, energy_capacity_mwh: null, soc_avg_pct: null, connected_terminal_count: 86, controllable_terminal_count: 42, baseline_power_mw: null, curtailable_power_mw: null },
      { resource_type: 'load', resource_count: 1, online_count: 1, current_power_mw: 12.6, installed_capacity_mw: 20, verified_adjustable_power_mw: 6.8, sustainable_duration_h: 1.0, availability_pct: null, energy_capacity_mwh: null, soc_avg_pct: null, connected_terminal_count: null, controllable_terminal_count: null, baseline_power_mw: 15.2, curtailable_power_mw: 6.8 },
      { resource_type: 'aidc', resource_count: 1, online_count: 1, current_power_mw: 6.8, installed_capacity_mw: 12, verified_adjustable_power_mw: 1.6, sustainable_duration_h: 0.5, availability_pct: null, energy_capacity_mwh: null, soc_avg_pct: null, connected_terminal_count: null, controllable_terminal_count: null, baseline_power_mw: 7.4, curtailable_power_mw: 1.6 },
    ],
    dispatch_summary: {
      active_event_count: 2,
      target_response_mw: 18.6,
      actual_response_mw: 17.2,
      fulfillment_rate_pct: 92.5,
      max_deviation_pct: 8.4,
      avg_response_seconds: 42,
      unconfirmed_event_count: 1,
      estimated_penalty_cny: 3200,
      rule_version: 'dispatch-rule-v1',
      quality_status: 'demo',
      as_of: now,
    },
    market_summary: {
      market_type: 'spot',
      day_ahead_price_cny_mwh: demoSeries(24, 480, 180, -1.2, 60),
      realtime_price_cny_mwh: demoSeries(24, 520, 200, -1.0, 60),
      tou_price_cny_kwh: null,
      current_price_cny_mwh: 680,
      peak_valley_spread_cny_kwh: 0.42,
      next_opportunity_start: '19:00',
      next_opportunity_end: '21:00',
      opportunity_type: '储能放电',
      price_source: '交易中心（演示）',
      unit: '元/MWh',
      quality_status: 'demo',
      as_of: now,
    },
    value_summary: [
      { type: 'energy', label: VALUE_TYPE_LABEL['energy'], value_cny: 62400, value_status: 'settled', calculation_version: 'energy-value-v1', source_refs: ['settle-demo-01'], as_of: now, quality_status: 'demo' },
      { type: 'capacity', label: VALUE_TYPE_LABEL['capacity'], value_cny: 21800, value_status: 'settled', calculation_version: 'capacity-value-v1', source_refs: ['settle-demo-02'], as_of: now, quality_status: 'demo' },
      { type: 'regulation', label: VALUE_TYPE_LABEL['regulation'], value_cny: 28500, value_status: 'estimated', calculation_version: 'regulation-value-v1', source_refs: ['estimate-demo-01'], as_of: now, quality_status: 'demo' },
      { type: 'green', label: VALUE_TYPE_LABEL['green'], value_cny: 15900, value_status: 'estimated', calculation_version: 'green-value-v2', source_refs: ['estimate-demo-02'], as_of: now, quality_status: 'demo' },
      { type: 'quality', label: VALUE_TYPE_LABEL['quality'], value_cny: null, value_status: 'unavailable', calculation_version: null, source_refs: [], as_of: now, quality_status: 'demo' },
    ],
    top_alerts: [
      { alert_id: 'AL-001', severity: 'critical', category: '储能', title: '武汉储能电站 SOC 过低', description: 'SOC 降至 18%，可下调能力受限，存在晚高峰缺额风险。', resource_id: 'ESS-WH-09', region_name: '湖北省', started_at: demoNow(28), duration_seconds: 1680, status: 'open', impact_value: 4.4, impact_unit: 'MW', handler_path: '/app/ops/storage' },
      { alert_id: 'AL-002', severity: 'high', category: 'AIDC', title: '上海 AIDC 需量超限预警', description: '当前负荷 6.8MW，预计 20:00 达到 7.6MW，建议提前启动需量控制。', resource_id: 'CP-SH-03', region_name: '上海市', started_at: demoNow(15), duration_seconds: 900, status: 'open', impact_value: 1.6, impact_unit: 'MW', handler_path: '/app/data/monitor' },
      { alert_id: 'AL-003', severity: 'medium', category: '可调负荷', title: '苏州可调负荷响应偏差偏大', description: '当前事件最大偏差 8.4%，超过 5% 阈值，请复核基线。', resource_id: 'LOAD-SU-13', region_name: '江苏省', started_at: demoNow(42), duration_seconds: 2520, status: 'acknowledged', impact_value: null, impact_unit: null, handler_path: '/app/ops/deviation' },
    ],
    top_decisions: [
      {
        suggestion_id: 'SUG-001',
        title: '晚高峰储能放电建议',
        summary: '预计 19:00-21:00 进入晚高峰，建议释放储能 8.6MWh，优先使用已结算容量。',
        evidence: [
          { label: '日前价格', value: '780 元/MWh', source_ref: 'price-demo-20260811' },
          { label: '储能 SOC', value: '62.6%（平均）', source_ref: 'meter-demo-batch' },
          { label: '事件约束', value: '无冲突调度事件', source_ref: 'dispatch-demo-v1' },
        ],
        expected_revenue_cny: 42800,
        expected_carbon_reduction_tco2e: 3.6,
        risk_level: 'low',
        confidence: 0.86,
        model_version: 'dispatch-model-v3',
        rule_version: 'dispatch-rule-v1',
        review_status: 'approved',
        valid_until: demoNow(-120),
        handler_path: '/app/ops/bidding',
      },
      {
        suggestion_id: 'SUG-002',
        title: 'AIDC 需量控制建议',
        summary: '上海 AIDC 负荷预计 20:00 达到 7.6MW，建议提前启动需量控制策略。',
        evidence: [
          { label: '负荷预测', value: '7.6MW @ 20:00', source_ref: 'forecast-demo-01' },
          { label: '合约需量', value: '7.0MW', source_ref: 'contract-demo-01' },
        ],
        expected_revenue_cny: 18600,
        expected_carbon_reduction_tco2e: 1.2,
        risk_level: 'medium',
        confidence: 0.78,
        model_version: 'forecast-model-v2',
        rule_version: 'demand-rule-v1',
        review_status: 'pending',
        valid_until: demoNow(-60),
        handler_path: '/app/ops/deviation',
      },
    ],
    todos: [
      { todo_id: 'TODO-001', title: '待确认调度事件', count: 1, handler_path: '/app/ops/deviation' },
      { todo_id: 'TODO-002', title: '待复核 AI 建议', count: 2, handler_path: '/app/ops/bidding' },
    ],
    source_health: { total: 8, healthy: 6, delayed: 1, unavailable: 1 },
  }
}

function demoPowerSeries(): PowerBalanceData {
  return {
    load_total_mw: demoSeries(24, 34, 6, 0.4, 15),
    renewable_generation_mw: demoSeries(24, 12, 5, -1.2, 15),
    storage_power_mw: demoSeries(24, 3.5, 4.5, 2.0, 15),
    grid_exchange_mw: demoSeries(24, 16, 7, 0.8, 15),
    charging_load_mw: demoSeries(24, 6.4, 3, 1.2, 15, 18),
    balance_error_mw: 1.8,
    data_gap_minutes: 15,
    granularity_minutes: 15,
    range_hours: 6,
    as_of: demoNow(),
    quality_status: 'demo',
  }
}

function demoMarket(): MarketSummary {
  const b = demoBootstrap()
  return b.market_summary as MarketSummary
}

function demoDispatch(): DispatchSummary {
  const b = demoBootstrap()
  return b.dispatch_summary as DispatchSummary
}

function demoResourceMap(): ResourceMapData {
  return {
    scope_id: 'all',
    data_version: 'demo-20260811-v1',
    view_mode: 'resource',
    markers: DEMO_RESOURCES,
    clusters: demoClusters(),
    quality_status: 'demo',
    as_of: demoNow(),
  }
}

function demoResourceDetail(resourceId: string): ResourceDetail {
  const r = DEMO_RESOURCES.find(x => x.resource_id === resourceId) ?? DEMO_RESOURCES[0]
  return {
    resource_id: r.resource_id,
    site_id: r.site_id,
    name: r.name,
    resource_type: r.resource_type,
    organization_name: '睿策智能（演示）',
    site_name: r.site_id,
    region_name: r.region_name,
    operation_status: r.operation_status,
    online_status: r.online_status,
    as_of: demoNow(),
    quality_status: 'demo',
    current_power_mw: r.current_power_mw,
    rated_power_mw: r.rated_power_mw,
    load_rate_pct: r.rated_power_mw ? Math.round(((r.current_power_mw ?? 0) / r.rated_power_mw) * 1000) / 10 : null,
    verified_adjustable_up_mw: r.verified_adjustable_up_mw,
    verified_adjustable_down_mw: r.verified_adjustable_down_mw,
    sustainable_duration_h: r.sustainable_duration_h,
    available_window: r.sustainable_duration_h ? `未来 ${r.sustainable_duration_h}h` : null,
    soc_pct: r.soc_pct,
    soh_pct: r.resource_type === 'storage' ? 92 : null,
    energy_capacity_mwh: r.resource_type === 'storage' ? 16 : null,
    today_energy_mwh: Math.round(((r.current_power_mw ?? 1) * 12 + 8) * 10) / 10,
    today_revenue_cny: Math.round((r.current_power_mw ?? 1) * 3200 + 1200),
    today_carbon_reduction_tco2e: Math.round((r.current_power_mw ?? 1) * 0.62 * 10) / 10,
    alerts: demoBootstrap().top_alerts.filter(a => a.resource_id === r.resource_id),
    active_dispatch_events: r.active_dispatch_count > 0
      ? [{ event_id: `EVT-${r.resource_id}`, title: '晚高峰响应事件', target_mw: 2.5, status: '进行中' }]
      : [],
  }
}

function demoSearch(query: string): ResourceMarker[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return DEMO_RESOURCES.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.resource_id.toLowerCase().includes(q) ||
    r.site_id.toLowerCase().includes(q) ||
    r.region_name.includes(query.trim()),
  )
}

function demoDecisions(): DecisionSuggestion[] {
  const b = demoBootstrap()
  return b.top_decisions
}

// ============ 对外接口 ============

export interface ResourceMapParams {
  scope_type?: string
  scope_id?: string
  view_mode?: string
  zoom_level?: number
  resource_types?: string
  statuses?: string
  cluster?: boolean
}

export async function fetchCockpitConfig(): Promise<CockpitFeatureFlags> {
  if (isDemoMode()) {
    return {
      cockpit_v2_enabled: true,
      cockpit_v2_user_allowlist: [],
      cockpit_v2_org_allowlist: [],
      cockpit_v2_real_data_enabled: false,
      cockpit_v2_sse_enabled: false,
      cockpit_v2_legacy_fallback: true,
    }
  }
  try {
    return await getCockpit<CockpitFeatureFlags>('/config')
  } catch {
    // 后端未部署时使用前端默认值；开关优先级仍以后端为准
    return {
      cockpit_v2_enabled: import.meta.env.VITE_COCKPIT_V2_ENABLED !== 'false',
      cockpit_v2_user_allowlist: [],
      cockpit_v2_org_allowlist: [],
      cockpit_v2_real_data_enabled: false,
      cockpit_v2_sse_enabled: import.meta.env.VITE_COCKPIT_SSE_ENABLED !== 'false',
      cockpit_v2_legacy_fallback: true,
    }
  }
}

export async function fetchBootstrap(scope: CockpitScope): Promise<BootstrapData> {
  if (isDemoMode()) return demoBootstrap()
  return getCockpit<BootstrapData>('/bootstrap', { scope_type: scope.type, scope_id: scope.id })
}

export async function fetchResourceMap(params: ResourceMapParams): Promise<ResourceMapData> {
  if (isDemoMode()) return demoResourceMap()
  return getCockpit<ResourceMapData>('/resources/map', params as Record<string, string | number | boolean | undefined>)
}

export async function fetchResourceDetail(resourceId: string): Promise<ResourceDetail> {
  if (isDemoMode()) return demoResourceDetail(resourceId)
  return getCockpit<ResourceDetail>(`/resources/${encodeURIComponent(resourceId)}`)
}

export async function fetchPowerSeries(scope: CockpitScope, rangeHours = 6): Promise<PowerBalanceData> {
  if (isDemoMode()) return demoPowerSeries()
  return getCockpit<PowerBalanceData>('/power-series', { scope_type: scope.type, scope_id: scope.id, range_hours: rangeHours })
}

export async function fetchMarket(scope: CockpitScope): Promise<MarketSummary> {
  if (isDemoMode()) return demoMarket()
  return getCockpit<MarketSummary>('/market', { scope_type: scope.type, scope_id: scope.id })
}

export async function fetchDispatch(scope: CockpitScope): Promise<DispatchSummary> {
  if (isDemoMode()) return demoDispatch()
  return getCockpit<DispatchSummary>('/dispatch', { scope_type: scope.type, scope_id: scope.id })
}

export async function fetchAlerts(scope: CockpitScope): Promise<import('../types/cockpit').CockpitAlert[]> {
  if (isDemoMode()) return demoBootstrap().top_alerts
  return getCockpit<import('../types/cockpit').CockpitAlert[]>('/alerts', { scope_type: scope.type, scope_id: scope.id })
}

export async function fetchDecisions(scope: CockpitScope): Promise<DecisionSuggestion[]> {
  if (isDemoMode()) return demoDecisions()
  return getCockpit<DecisionSuggestion[]>('/decisions', { scope_type: scope.type, scope_id: scope.id })
}

export async function searchCockpitResources(query: string): Promise<ResourceMarker[]> {
  if (isDemoMode()) return demoSearch(query)
  return getCockpit<ResourceMarker[]>('/search', { q: query })
}

export async function createEmbedTicket(nonce: string): Promise<{ ticket: string; expires_in: number } | null> {
  try {
    return await postCockpit<{ ticket: string; expires_in: number }>('/embed-ticket', { nonce })
  } catch {
    return null
  }
}

export async function exchangeSession(ticket: string, nonce: string): Promise<{ expires_in: number } | null> {
  try {
    return await postCockpit<{ expires_in: number }>('/session/exchange', { ticket, nonce })
  } catch {
    return null
  }
}

/** SSE 事件流（§8.5）：断线后使用 Last-Event-ID 补拉，连续失败由 useCockpitEvents 降级为轮询 */
export function openCockpitEventStream(scope: CockpitScope, lastEventId: string | null, handlers: {
  onEvent: (event: CockpitStreamEvent) => void
  onOpen: () => void
  onError: () => void
}): () => void {
  const base = `${window.location.origin}/api/v1/cockpit/events?scope_type=${encodeURIComponent(scope.type)}&scope_id=${encodeURIComponent(scope.id)}`
  const url = lastEventId ? `${base}&last_event_id=${encodeURIComponent(lastEventId)}` : base
  const es = new EventSource(url, { withCredentials: true })
  es.onopen = handlers.onOpen
  es.onerror = () => handlers.onError()
  es.onmessage = (ev) => {
    try {
      const event = JSON.parse(ev.data) as CockpitStreamEvent
      if (ev.lastEventId) {
        // 由 store 保存最后事件 ID
        ;(event as unknown as { _last_event_id: string })._last_event_id = ev.lastEventId
      }
      handlers.onEvent(event)
    } catch {
      /* 忽略无法解析的事件 */
    }
  }
  return () => es.close()
}





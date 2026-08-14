<!--
  Map2DStage —— 2D 地图下钻替换原型（方案 A）
  - 借鉴 TangSY/echarts-map-demo（MIT）的 registerMap + setOption 下钻模式
  - 行政区数据：本地 china.json / zhejiang.json + DataV GeoAtlas 运行时加载（mapDataAdapter）
  - 与 3D 地球共用同一 store（markers / viewMode / highlightType / mapScope）
  - 交互：点击省份/城市下钻 → 点击站点打开详情抽屉 → 滚轮缩放、返回按钮
-->
<template>
  <div ref="container" class="map2d-stage">
    <div ref="chartEl" class="map2d-chart" />
    <button
      v-if="stack.length > 1"
      type="button"
      class="m2d-back"
      @click="drillBack"
    >↑ 返回{{ stack[stack.length - 2].name }}</button>
    <div class="m2d-tip">{{ scopeLabel }} · 滚轮缩放 · 点击区域下钻 · 点击站点查看详情</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { MapChart, ScatterChart, EffectScatterChart } from 'echarts/charts'
import { GeoComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { EChartsType } from 'echarts/core'
import china from '../../assets/maps/china.json'
import { loadMapLevel } from './mapDataAdapter'
import { useCockpitStore } from '../../stores/cockpit'
import { useHostBridge } from '../../composables/useHostBridge'
import { fetchResourceDetail } from '../../api/cockpit'
import { formatNullable } from '../../utils/format'
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit'
import type { GeoFeatureCollection, GeoFeature } from '../../types/geo'
import type { ResourceMarker } from '../../types/cockpit'

echarts.use([MapChart, ScatterChart, EffectScatterChart, GeoComponent, TooltipComponent, CanvasRenderer])

type DrillLevel = 'country' | 'province' | 'city' | 'district'

interface DrillLevelState {
  level: DrillLevel
  adcode: string
  name: string
  geo: GeoFeatureCollection
  center?: [number, number]
}

const container = ref<HTMLElement | null>(null)
const chartEl = ref<HTMLElement | null>(null)
const store = useCockpitStore()
const bridge = useHostBridge()

let chart: EChartsType | null = null
let resizeObserver: ResizeObserver | null = null
let lastZoom = 1.1

const registeredMaps = new Set<string>()

const stack = ref<DrillLevelState[]>([
  { level: 'country', adcode: '100000', name: '中国', geo: china as unknown as GeoFeatureCollection },
])

const scopeLabel = computed(() => {
  const parts = stack.value.map((state) => state.name)
  return parts.join(' / ')
})

function mapNameOf(adcode: string): string {
  return `vpp_${adcode}`
}

function zoomForLevel(level: DrillLevel): number {
  switch (level) {
    case 'country': return 1.1
    case 'province': return 6
    case 'city': return 12
    case 'district': return 24
  }
}

const COUNTRY_CENTER: [number, number] = [105.5, 36.5]

function registerMap(adcode: string, geo: GeoFeatureCollection) {
  const name = mapNameOf(adcode)
  if (registeredMaps.has(name)) return
  echarts.registerMap(name, geo as Parameters<typeof echarts.registerMap>[1])
  registeredMaps.add(name)
}

function featureName(feature: GeoFeature): string {
  return String(feature.properties.fullname ?? feature.properties.name ?? '')
}

function featureCenter(feature: GeoFeature): [number, number] | undefined {
  const center = feature.properties.center as unknown as [number, number] | undefined
  const centroid = feature.properties.centroid as unknown as [number, number] | undefined
  if (Array.isArray(center) && center.length === 2) return [Number(center[0]), Number(center[1])]
  if (Array.isArray(centroid) && centroid.length === 2) return [Number(centroid[0]), Number(centroid[1])]
  return undefined
}

function hasChildren(feature: GeoFeature): boolean {
  const props = feature.properties
  const childrenNum = props.childrenNum as number | undefined
  if (typeof childrenNum === 'number') return childrenNum > 0
  const level = props.level as number | string | undefined
  if (typeof level === 'number') return level >= 2
  return level !== 'district'
}

function nextLevel(feature: GeoFeature): DrillLevel | null {
  const level = feature.properties.level as number | string | undefined
  if (level === 'country') return 'province'
  if (level === 'province') return 'city'
  if (level === 'city') return 'district'
  if (level === 'district') return null
  if (typeof level === 'number') {
    if (level >= 3) return null
    if (level === 2) return 'district'
    return 'city'
  }
  return null
}

// ===== 标记过滤 =====

const inScopeMarkers = computed(() => {
  const state = stack.value[stack.value.length - 1]
  return store.markers.filter((marker) => {
    if (state.level === 'country') return true
    const code = marker.region_code ?? ''
    if (state.level === 'province') return code.startsWith(state.adcode.slice(0, 2))
    if (state.level === 'city') return code.startsWith(state.adcode.slice(0, 4))
    return code.startsWith(state.adcode.slice(0, 6))
  })
})

const visibleMarkers = computed(() => {
  return inScopeMarkers.value
})

// ===== 样式 =====

const STATUS_COLORS: Record<string, string> = {
  normal: '#35D6C4',
  warning: '#E7B34F',
  alarm: '#F0645B',
  offline: '#5C6A7D',
  maintenance: '#5C6A7D',
}

function powerBucket(marker: ResourceMarker): 'low' | 'mid' | 'high' {
  const power = marker.current_power_mw ?? 0
  const rated = marker.rated_power_mw ?? 0
  const ratio = rated > 0 ? power / rated : 0
  if (ratio >= 0.7) return 'high'
  if (ratio >= 0.35) return 'mid'
  return 'low'
}

const POWER_COLORS: Record<'low' | 'mid' | 'high', string> = {
  low: '#45627F',
  mid: '#68A2D8',
  high: '#A7D8FF',
}

function colorFor(marker: ResourceMarker): string {
  switch (store.viewMode) {
    case 'power':
      return POWER_COLORS[powerBucket(marker)]
    case 'dispatch':
      return marker.active_dispatch_count > 0 ? '#D8AD60' : '#39465A'
    case 'alert':
      return marker.highest_alert_severity === 'critical' ? '#F0645B' : '#E7B34F'
    default:
      return STATUS_COLORS[marker.operation_status] ?? STATUS_COLORS.normal
  }
}

function sizeFor(marker: ResourceMarker): number {
  const power = marker.current_power_mw ?? 0
  const base = 7 + Math.min(13, Math.sqrt(Math.max(0, power)) * 2.4)
  if (store.viewMode === 'alert') return base + 3
  if (store.viewMode === 'dispatch' && marker.active_dispatch_count > 0) return base + 2
  return base
}

function isAlarmMarker(marker: ResourceMarker): boolean {
  if (store.viewMode === 'alert') return true
  return marker.operation_status === 'alarm'
}

function tooltipHtml(marker: ResourceMarker): string {
  const statusLabel: Record<string, string> = {
    normal: '正常', warning: '关注', alarm: '告警', offline: '离线', maintenance: '检修',
  }
  const soc = marker.soc_pct != null ? ` · SOC ${formatNullable(marker.soc_pct, 0)}%` : ''
  const adjust = marker.verified_adjustable_up_mw != null
    ? `<div>可调上调 ${formatNullable(marker.verified_adjustable_up_mw, 1)} MW / 下调 ${formatNullable(marker.verified_adjustable_down_mw, 1)} MW</div>`
    : ''
  return [
    `<div style="font-weight:600;color:#E8EEF3;margin-bottom:2px">${marker.name}</div>`,
    `<div>${RESOURCE_TYPE_LABEL[marker.resource_type]} · ${statusLabel[marker.operation_status] ?? marker.operation_status}</div>`,
    `<div>当前功率 ${formatNullable(marker.current_power_mw, 1)} MW${soc}</div>`,
    `<div>${marker.region_name}</div>`,
    adjust,
  ].join('')
}

// ===== 图表构建 =====

function buildGeoOption(state: DrillLevelState, zoom?: number, center?: [number, number]): Record<string, unknown> {
  return {
    map: mapNameOf(state.adcode),
    roam: true,
    zoom: zoom ?? zoomForLevel(state.level),
    center: center ?? state.center ?? COUNTRY_CENTER,
    layoutCenter: ['50%', '53%'],
    layoutSize: '96%',
    label: {
      show: true,
      color: '#9FB4C7',
      fontSize: 11,
      textBorderColor: 'rgba(5, 7, 9, 0.85)',
      textBorderWidth: 2,
    },
    itemStyle: {
      areaColor: '#0E1A2B',
      borderColor: '#2B4257',
      borderWidth: 1,
    },
    emphasis: {
      label: { color: '#E8EEF3' },
      itemStyle: { areaColor: '#16344A' },
    },
    select: { disabled: true },
  }
}

function scatterPoint(marker: ResourceMarker) {
  return {
    name: marker.name,
    value: [marker.longitude, marker.latitude],
    marker,
    symbolSize: sizeFor(marker),
    itemStyle: { color: colorFor(marker), borderColor: '#0B1117', borderWidth: 1.2, opacity: 0.96 },
  }
}

function buildSeries() {
  const normal: unknown[] = []
  const alarms: unknown[] = []
  for (const marker of visibleMarkers.value) {
    if (isAlarmMarker(marker)) alarms.push(scatterPoint(marker))
    else normal.push(scatterPoint(marker))
  }
  const series: unknown[] = []
  if (normal.length) {
    series.push({
      type: 'scatter',
      coordinateSystem: 'geo',
      data: normal,
      symbol: store.viewMode === 'dispatch' ? 'diamond' : 'circle',
      zlevel: 2,
      tooltip: {
        formatter: (params: { data: { marker?: ResourceMarker } }) => {
          const marker = params.data?.marker
          return marker ? tooltipHtml(marker) : ''
        },
      },
    })
  }
  if (alarms.length) {
    series.push({
      type: 'effectScatter',
      coordinateSystem: 'geo',
      data: alarms,
      symbol: 'circle',
      rippleEffect: { brushType: 'stroke', scale: 3.2, period: 3 },
      zlevel: 3,
      tooltip: {
        formatter: (params: { data: { marker?: ResourceMarker } }) => {
          const marker = params.data?.marker
          return marker ? tooltipHtml(marker) : ''
        },
      },
    })
  }
  return series
}

function buildOption(state: DrillLevelState, zoom?: number, center?: [number, number]): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(13, 18, 24, 0.95)',
      borderColor: 'rgba(53, 214, 196, 0.35)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#C6D2DD', fontSize: 12 },
      extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.5);',
    },
    geo: buildGeoOption(state, zoom, center),
    series: buildSeries(),
  }
}

function render(zoom?: number, center?: [number, number]) {
  if (!chart) return
  const state = stack.value[stack.value.length - 1]
  chart.setOption(buildOption(state, zoom, center), { notMerge: true, lazyUpdate: false })
}

function syncScope() {
  if (stack.value.length === 1) {
    store.setMapScope('country')
  } else {
    store.setMapScope(stack.value.slice(1).map((state) => state.name).join('/'))
  }
}

// ===== 下钻 / 返回 =====

async function drillToAdcode(level: DrillLevel, adcode: string, name: string, center?: [number, number]) {
  try {
    const geo = await loadMapLevel(level, adcode)
    registerMap(adcode, geo)
    const previousZoom = lastZoom
    stack.value.push({ level, adcode, name, geo, center })
    syncScope()
    render(previousZoom, center ?? COUNTRY_CENTER)
    requestAnimationFrame(() => {
      chart?.dispatchAction({ type: 'geoRoam', geoIndex: 0, zoom: zoomForLevel(level) })
    })
    lastZoom = zoomForLevel(level)
  } catch (error) {
    console.warn(`[Map2D] 下钻失败 ${adcode}:`, error)
  }
}

async function handleRegionClick(name: string) {
  const state = stack.value[stack.value.length - 1]
  const feature = state.geo.features.find(
    (item) => item.properties.name === name || item.properties.fullname === name,
  )
  if (!feature) return
  const target = nextLevel(feature)
  if (!target || !hasChildren(feature)) return
  const adcode = String(feature.properties.adcode ?? feature.properties.code ?? '')
  if (!adcode) return
  await drillToAdcode(target, adcode, featureName(feature), featureCenter(feature))
}

async function drillTo(name: string) {
  const state = stack.value[stack.value.length - 1]
  const feature = state.geo.features.find(
    (item) => item.properties.name === name || item.properties.fullname === name,
  )
  if (!feature) return
  const target = nextLevel(feature)
  const adcode = String(feature.properties.adcode ?? feature.properties.code ?? '')
  if (!target || !adcode) return
  await drillToAdcode(target, adcode, featureName(feature), featureCenter(feature))
}

async function resetToCountry() {
  if (stack.value.length === 1) {
    render()
    return
  }
  stack.value = [stack.value[0]]
  syncScope()
  render()
  lastZoom = zoomForLevel('country')
}

function drillBack() {
  if (stack.value.length <= 1) return
  stack.value.pop()
  const state = stack.value[stack.value.length - 1]
  syncScope()
  render(lastZoom)
  requestAnimationFrame(() => {
    chart?.dispatchAction({ type: 'geoRoam', geoIndex: 0, zoom: zoomForLevel(state.level) })
  })
  lastZoom = zoomForLevel(state.level)
}

function canGoBack(): boolean {
  return stack.value.length > 1
}

function getScope(): string {
  return stack.value[stack.value.length - 1].name
}

// ===== 定位 =====

function provinceAdcodeFor(regionCode: string): string {
  const chinaGeo = china as unknown as GeoFeatureCollection
  if (chinaGeo.features.some((feature) => String(feature.properties.adcode ?? '') === regionCode)) {
    return regionCode
  }
  return `${regionCode.slice(0, 2)}0000`
}

function provinceNameFor(adcode: string): string {
  const chinaGeo = china as unknown as GeoFeatureCollection
  const feature = chinaGeo.features.find((item) => String(item.properties.adcode ?? '') === adcode)
  return feature ? featureName(feature) : ''
}

function chinaFeatureCenter(adcode: string): [number, number] | undefined {
  const chinaGeo = china as unknown as GeoFeatureCollection
  const feature = chinaGeo.features.find((item) => String(item.properties.adcode ?? '') === adcode)
  return feature ? featureCenter(feature) : undefined
}

function nearestMarker(lng: number, lat: number): ResourceMarker | undefined {
  let best: ResourceMarker | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const marker of store.markers) {
    const dx = marker.longitude - lng
    const dy = marker.latitude - lat
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = marker
    }
  }
  return best
}

function flyTo(lng: number, lat: number) {
  if (!chart) return
  chart.setOption({ geo: { center: [lng, lat] } })
  const targetZoom = Math.max(lastZoom, 8)
  requestAnimationFrame(() => {
    chart?.dispatchAction({ type: 'geoRoam', geoIndex: 0, zoom: targetZoom })
  })
  lastZoom = targetZoom
}

async function locateTo(lng: number, lat: number, name: string, region?: string) {
  const marker = store.markers.find((m) => m.resource_id === name || m.name === name)
    ?? nearestMarker(lng, lat)
  await resetToCountry()
  if (marker?.region_code) {
    const adcode = provinceAdcodeFor(marker.region_code)
    if (adcode) {
      await drillToAdcode('province', adcode, provinceNameFor(adcode) || '省级区域', chinaFeatureCenter(adcode))
    }
  }
  flyTo(lng, lat)
  if (region) store.setMapScope(region)
}

// ===== 站点点击 =====

function fallbackDetail(marker: ResourceMarker) {
  return {
    resource_id: marker.resource_id,
    site_id: marker.site_id,
    name: marker.name,
    resource_type: marker.resource_type,
    organization_name: '--',
    site_name: marker.site_id,
    region_name: marker.region_name,
    operation_status: marker.operation_status,
    online_status: marker.online_status,
    as_of: marker.as_of,
    quality_status: marker.quality_status,
    current_power_mw: marker.current_power_mw,
    rated_power_mw: marker.rated_power_mw,
    load_rate_pct: marker.rated_power_mw ? Math.round(((marker.current_power_mw ?? 0) / marker.rated_power_mw) * 1000) / 10 : null,
    verified_adjustable_up_mw: marker.verified_adjustable_up_mw,
    verified_adjustable_down_mw: marker.verified_adjustable_down_mw,
    sustainable_duration_h: marker.sustainable_duration_h,
    available_window: null,
    soc_pct: marker.soc_pct,
    soh_pct: null,
    energy_capacity_mwh: null,
    today_energy_mwh: null,
    today_revenue_cny: null,
    today_carbon_reduction_tco2e: null,
    alerts: [],
    active_dispatch_events: [],
  }
}

async function onMarkerClick(marker: ResourceMarker) {
  bridge.notifyResourceSelected(marker.resource_id, store.scope.id)
  try {
    const detail = await fetchResourceDetail(marker.resource_id)
    store.selectResource(detail, marker)
  } catch {
    store.selectResource(fallbackDetail(marker) as never, marker)
  }
}

// ===== 生命周期 =====

function handleChartClick(params: any) {
  ;(params.event?.event as Event | undefined)?.stopPropagation()
  const data = params.data as { marker?: ResourceMarker } | undefined
  if (params.componentType === 'geo' && params.name) {
    void handleRegionClick(params.name)
  } else if ((params.seriesType === 'scatter' || params.seriesType === 'effectScatter') && data?.marker) {
    void onMarkerClick(data.marker)
  }
}

onMounted(() => {
  if (!chartEl.value) return
  registerMap('100000', china as unknown as GeoFeatureCollection)
  chart = echarts.init(chartEl.value)
  chart.on('click', handleChartClick)
  syncScope()
  render()
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value as HTMLElement)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})

// store 数据 / 视图模式变化 → 仅刷新散点
watch(
  [() => store.markers, () => store.viewMode, () => store.highlightType],
  () => {
    if (chart && stack.value.length) {
      chart.setOption({ series: buildSeries() })
    }
  },
)

defineExpose({
  locateTo,
  drillBack,
  canGoBack,
  getScope,
  drillTo,
  getZoomState: () => ({
    distance: lastZoom,
    min: 1,
    max: 40,
    atMin: lastZoom <= 1,
    atMax: lastZoom >= 40,
  }),
  zoomBy: (deltaY: number) => {
    if (!chart) return
    const factor = deltaY < 0 ? 1.15 : 0.87
    const next = Math.min(40, Math.max(1, lastZoom * factor))
    chart.dispatchAction({ type: 'geoRoam', geoIndex: 0, zoom: next })
    lastZoom = next
  },
  getHoveredFeature: () => '',
  projectGeoToScreen: () => ({ x: 0, y: 0, visible: false }),
  isEarthMode: () => false,
})
</script>

<style scoped>
.map2d-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #0A0D12 0%, #050709 100%);
}
.map2d-chart {
  position: absolute;
  inset: 0;
}
.m2d-back {
  position: absolute;
  top: 64px;
  left: 14px;
  z-index: 20;
  background: rgba(13, 18, 24, 0.92);
  border: 1px solid rgba(53, 214, 196, 0.4);
  border-radius: 5px;
  color: var(--cockpit-power);
  font-size: 12.5px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.m2d-back:hover { background: rgba(53, 214, 196, 0.16); }
.m2d-tip {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  font-size: 11.5px;
  color: rgba(145, 160, 174, 0.85);
  background: rgba(13, 18, 24, 0.75);
  border: 1px solid var(--cockpit-border);
  border-radius: 4px;
  padding: 4px 12px;
  white-space: nowrap;
}
</style>

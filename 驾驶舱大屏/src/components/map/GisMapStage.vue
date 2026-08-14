<!--
  GisMapStage —— 电网 GIS 一张图（MapLibre GL JS，MIT 可商用）
  - 深色 GIS 底图 + 省级行政边界，仿南网/国网电网 GIS 平台交互：
    区域点击下钻、站点符号化、电压等级线路分层、潮流动画、站点设备弹窗
  - 技术栈：MapLibre GL JS（WebGIS 引擎）+ GeoJSON 本地底图（无在线瓦片依赖）
  - 与 EarthStage 共用 cockpit store：markers / viewMode / highlightType / mapScope
-->
<template>
  <div ref="container" class="gis-stage">
    <div ref="mapEl" class="gis-map" />
    <button type="button" class="gis-reset" title="恢复全国视图并显示全部场站" @click="resetMapView">⌂ 全国</button>
    <button v-if="stack.length > 1" type="button" class="gis-back" @click="drillBack">← 返回{{ stack[stack.length - 2].name }}</button>
    <div class="gis-source-status">
      <i class="gis-source-dot" />
      <span>MapLibre GIS</span>
      <span class="gis-source-sep">·</span>
      <span>{{ TIANDITU_TOKEN ? '天地图影像' : '离线矢量底图' }}</span>
    </div>
    <div v-if="initError" class="gis-error">{{ initError }}</div>
    <div v-if="unsupported" class="gis-error">当前浏览器不支持 WebGL，GIS 地图无法渲染，已自动切换 2D 兼容地图。请开启浏览器硬件加速后刷新页面。</div>
    <div class="gis-info">
      <span>{{ infoZoom }}</span>
      <span>{{ infoLngLat }}</span>
    </div>
    <div v-show="hoverTip.show" class="gis-hover-tip" :style="{ left: hoverTip.x + 'px', top: hoverTip.y + 'px' }">{{ hoverTip.name }}</div>
    <div v-if="popup" class="gis-popup" :class="`popup-${popup.status}`" :style="{ left: popup.x + 'px', top: popup.y + 'px' }">
      <div class="gp-head">
        <span class="gp-title">{{ popup.marker.name }}</span>
        <span class="gp-type">{{ RESOURCE_TYPE_LABEL[popup.marker.resource_type] }}</span>
        <button type="button" class="gp-close" title="关闭" @click="closePopup">×</button>
      </div>
      <div class="gp-sub">{{ popup.regionName }} · {{ statusLabel(popup.marker.operation_status) }} · 数据 {{ popup.marker.as_of }}</div>
      <div class="gp-kpis">
        <div class="gp-kpi"><span class="gp-kpi-label">当前功率</span><span class="gp-kpi-value">{{ formatNullable(popup.marker.current_power_mw, 1) }} MW</span></div>
        <div class="gp-kpi"><span class="gp-kpi-label">额定容量</span><span class="gp-kpi-value">{{ formatNullable(popup.marker.rated_power_mw, 1) }} MW</span></div>
        <div class="gp-kpi" v-if="popup.marker.soc_pct != null"><span class="gp-kpi-label">SOC</span><span class="gp-kpi-value">{{ formatNullable(popup.marker.soc_pct, 0) }}%</span></div>
        <div class="gp-kpi"><span class="gp-kpi-label">可调容量</span><span class="gp-kpi-value">{{ formatNullable(popup.marker.verified_adjustable_up_mw, 1) }}/{{ formatNullable(popup.marker.verified_adjustable_down_mw, 1) }} MW</span></div>
      </div>
      <div class="gp-coordinates">
        <span>经度 {{ popup.marker.longitude.toFixed(4) }}°E</span>
        <span>纬度 {{ popup.marker.latitude.toFixed(4) }}°N</span>
      </div>
      <div class="gp-devices">
        <div class="gp-devices-title">站内一次设备</div>
        <div class="gp-device-row" v-for="device in popup.devices" :key="device.name">
          <i class="gp-device-dot" :class="`dv-${device.status}`" />
          <span class="gp-device-name">{{ device.name }}</span>
          <span class="gp-device-spec">{{ device.spec }}</span>
        </div>
      </div>
      <div class="gp-foot">
        <button type="button" class="gp-detail" @click="openDetail">查看运行详情 →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Map as MaplibreMap, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import type { FeatureCollection as GeoJsonFC } from 'geojson'
import china from '../../assets/maps/china.json'
import { loadMapLevel } from './mapDataAdapter'
import { useCockpitStore } from '../../stores/cockpit'
import { useHostBridge } from '../../composables/useHostBridge'
import { fetchResourceDetail } from '../../api/cockpit'
import { formatNullable } from '../../utils/format'
import { isLiangzhuStation, jumpToLiangzhuCockpit } from '../../utils/liangzhu'
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit'
import type { GeoFeatureCollection, GeoFeature } from '../../types/geo'
import type { ResourceMarker } from '../../types/cockpit'

type DrillLevel = 'country' | 'province' | 'city' | 'district'

interface DrillLevelState {
  level: DrillLevel
  adcode: string
  name: string
  geo: GeoFeatureCollection
  center?: [number, number]
}

interface PopupDevice {
  name: string
  spec: string
  status: 'normal' | 'warning' | 'alarm'
}

interface SitePopup {
  marker: ResourceMarker
  x: number
  y: number
  regionName: string
  status: string
  devices: PopupDevice[]
}

const container = ref<HTMLElement | null>(null)
const mapEl = ref<HTMLElement | null>(null)
const store = useCockpitStore()
const bridge = useHostBridge()

let map: MaplibreMap | null = null
let ready = false
let resizeObserver: ResizeObserver | null = null
let popupMarkerId: string | null = null
let arrowTimer: number | undefined
let arrowFrame = 0
let cursorLngLat: [number, number] | null = null
let hoveredRegion: { source: 'province-summary' | 'region'; id: string | number } | null = null

const stack = ref<DrillLevelState[]>([
  { level: 'country', adcode: '100000', name: '中国', geo: china as unknown as GeoFeatureCollection },
])

const popup = ref<SitePopup | null>(null)
const hoverTip = ref<{ show: boolean; x: number; y: number; name: string }>({ show: false, x: 0, y: 0, name: '' })
const infoZoom = ref('缩放 3.5')
const infoLngLat = ref('116.40°E · 39.90°N')
const currentZoom = ref(3.5)
const unsupported = ref(false)
const initError = ref('')
const emit = defineEmits<{ (event: 'unsupported'): void }>()

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

const ARROW_FRAMES = 20
// ===== 电网配色（国网 GIS 图例风格，深色底优化）=====

const STATUS_COLORS: Record<string, string> = {
  normal: '#35D6C4',
  warning: '#E7B34F',
  alarm: '#F0645B',
  offline: '#5C6A7D',
  maintenance: '#5C6A7D',
}

const PROVINCE_STATUS_COLORS: Record<string, string> = {
  normal: '#123238',
  warning: '#4A3B1D',
  alarm: '#482125',
  offline: '#1A2430',
  maintenance: '#25303A',
}

const TYPE_COLORS: Record<string, string> = {
  storage: '#35D6C4',
  pv: '#FFC53D',
  wind: '#58D68D',
  charging: '#49B6F0',
  load: '#C792EA',
  aidc: '#7EC8FF',
  microgrid: '#F06292',
  vpp: '#FF8A3D',
}

const POWER_COLORS: Record<'low' | 'mid' | 'high', string> = {
  low: '#45627F',
  mid: '#68A2D8',
  high: '#A7D8FF',
}

const VOLTAGE_STYLES: Record<number, { color: string; width: number; dash?: number[]; label: string }> = {
  1000: { color: '#F06292', width: 2.6, label: '1000kV' },
  800: { color: '#FF8A3D', width: 2.3, label: '±800kV' },
  750: { color: '#FF8A3D', width: 2.1, label: '750kV' },
  500: { color: '#F2635A', width: 1.7, label: '500kV' },
  220: { color: '#FFC53D', width: 1.2, label: '220kV' },
  110: { color: '#49B6F0', width: 1, label: '110kV' },
  35: { color: '#4FD1A5', width: 0.8, dash: [2, 2], label: '35kV' },
  10: { color: '#5C7A8F', width: 0.6, dash: [1.5, 3], label: '10kV' },
}

// ===== 站点类型专属 SVG 符号（64x64，stroke 风格）=====

function typeIconSvg(type: string): string {
  const c = TYPE_COLORS[type] ?? '#9FB4C7'
  const sw = 3.5
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">`
  switch (type) {
    case 'storage':
      return `${base}
        <rect x="10" y="16" width="18" height="34" rx="3" /><rect x="36" y="16" width="18" height="34" rx="3" />
        <path d="M16 8v8M44 8v8M16 30h6M44 30h6M16 42h6M44 42h6" /></svg>`
    case 'pv':
      return `${base}
        <rect x="8" y="18" width="48" height="34" rx="2" /><path d="M8 28h48M8 38h48M22 18v34M36 18v34" />
        <circle cx="50" cy="9" r="5" /><path d="M50 1v3M50 14v3M42 9h3M55 9h3" /></svg>`
    case 'wind':
      return `${base}
        <line x1="32" y1="30" x2="32" y2="56" /><circle cx="32" cy="30" r="4.5" />
        <path d="M32 30C16 24 12 36 32 30C30 14 40 12 32 30C50 20 52 32 32 30" /></svg>`
    case 'charging':
      return `${base}
        <rect x="24" y="8" width="16" height="48" rx="3" /><path d="M28 14h8" />
        <path d="M31 26h6l-4 8h5l-8 10 3-10h-4z" fill="${c}" stroke="none" /></svg>`
    case 'load':
      return `${base}
        <path d="M8 46V22h16v24" /><rect x="24" y="18" width="24" height="28" rx="2" />
        <path d="M48 28h10v18H48" /><path d="M8 52h50" /><path d="M34 32h4" /></svg>`
    case 'aidc':
      return `${base}
        <rect x="12" y="10" width="40" height="44" rx="3" />
        <rect x="18" y="17" width="28" height="7" rx="1.5" /><rect x="18" y="28.5" width="28" height="7" rx="1.5" /><rect x="18" y="40" width="28" height="7" rx="1.5" /></svg>`
    case 'microgrid':
      return `${base}
        <circle cx="32" cy="32" r="24" /><path d="M32 14v10M32 40v10M14 32h10M40 32h10" />
        <path d="M29 26h6l-4 8h5l-7 9 2-9h-4z" fill="${c}" stroke="none" /></svg>`
    case 'vpp':
      return `${base}
        <rect x="24" y="24" width="16" height="16" rx="3" transform="rotate(45 32 32)" />
        <path d="M32 8v12M32 44v12M8 32h12M44 32h12" /></svg>`
    default:
      return `${base}<circle cx="32" cy="32" r="22" /><path d="M32 14v36M14 32h36" /></svg>`
  }
}

// ===== 省级行政区域工具 =====

function normalizeName(name: string): string {
  return name
    .replace(/维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区/g, '')
    .replace(/省|市$/g, '')
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

const chinaFeatures = (china as unknown as GeoFeatureCollection).features

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function pointInPolygon(point: [number, number], polygon: [number, number][][]): boolean {
  if (!polygon.length || !pointInRing(point, polygon[0])) return false
  return !polygon.slice(1).some((hole) => pointInRing(point, hole))
}

function featureContainsPoint(feature: GeoFeature, point: [number, number]): boolean {
  if (feature.geometry.type === 'Polygon') {
    return pointInPolygon(point, feature.geometry.coordinates as [number, number][][])
  }
  return (feature.geometry.coordinates as [number, number][][][])
    .some((polygon) => pointInPolygon(point, polygon))
}

function regionFeatureAt(lng: number, lat: number): GeoFeature | undefined {
  const current = stack.value[stack.value.length - 1]
  const features = current.level === 'country' ? chinaFeatures : current.geo.features
  return features.find((feature) => featureContainsPoint(feature, [lng, lat]))
}

function clearHoveredRegion() {
  if (!map || !hoveredRegion) return
  try {
    map.setFeatureState(hoveredRegion, { hover: false })
  } catch {
    // Source may have changed during drill animation.
  }
  hoveredRegion = null
}

function setHoveredRegion(source: 'province-summary' | 'region', id: string | number) {
  if (!map) return
  if (hoveredRegion?.source === source && hoveredRegion.id === id) return
  clearHoveredRegion()
  map.setFeatureState({ source, id }, { hover: true })
  hoveredRegion = { source, id }
}

function buildProvinceGeoJson(): GeoJsonFC {
  const summaries = new Map(store.provinceSummaries.map((item) => [item.region_code, item]))
  const maxCapacity = Math.max(1, ...store.provinceSummaries.map((item) => item.total_capacity_mw))
  const features = chinaFeatures.map((feature) => {
    const adcode = String(feature.properties.adcode ?? '')
    const summary = summaries.get(adcode)
    const capacity = summary?.total_capacity_mw ?? 0
    const relativeHeight = capacity > 0 ? Math.sqrt(capacity / maxCapacity) : 0
    return {
      ...feature,
      properties: {
        ...feature.properties,
        capacity_mw: capacity,
        station_count: summary?.station_count ?? 0,
        generation_mwh: summary?.generation_mwh ?? 0,
        operation_status: summary?.status ?? 'normal',
        status_color: PROVINCE_STATUS_COLORS[summary?.status ?? 'normal'],
        extrusion_height_m: capacity > 0 ? Math.round(6000 + relativeHeight * 52000) : 0,
      },
    }
  })
  return { type: 'FeatureCollection', features } as unknown as GeoJsonFC
}

function provinceIndex(): Map<string, GeoFeature> {
  const index = new Map<string, GeoFeature>()
  for (const feature of chinaFeatures) {
    index.set(normalizeName(featureName(feature)), feature)
  }
  return index
}

function provinceFeatureOf(regionCode: string): GeoFeature | undefined {
  const adcode = `${regionCode.slice(0, 2)}0000`
  return chinaFeatures.find((feature) => String(feature.properties.adcode ?? '') === adcode)
}

function hasChildren(feature: GeoFeature): boolean {
  const childrenNum = feature.properties.childrenNum as number | undefined
  if (typeof childrenNum === 'number') return childrenNum > 0
  const level = feature.properties.level as number | string | undefined
  if (typeof level === 'number') return level >= 2
  return level !== 'district'
}

function nextLevel(level: DrillLevel): DrillLevel | null {
  if (level === 'country') return 'province'
  if (level === 'province') return 'city'
  if (level === 'city') return 'district'
  return null
}
// ===== 电网主干网架（仿国网/南网省际主网架，电压等级分层）=====

interface BackboneLine {
  from: string
  to: string
  kv: number
}

const BACKBONE_LINES: BackboneLine[] = [
  // 东北电网 500kV 主网架
  { from: '黑龙江', to: '吉林', kv: 500 },
  { from: '吉林', to: '辽宁', kv: 500 },
  // 华北电网（特高压 1000kV + 500kV）
  { from: '辽宁', to: '内蒙古', kv: 500 },
  { from: '内蒙古', to: '北京', kv: 500 },
  { from: '北京', to: '河北', kv: 500 },
  { from: '河北', to: '天津', kv: 500 },
  { from: '天津', to: '山东', kv: 500 },
  { from: '河北', to: '山东', kv: 1000 },
  { from: '河北', to: '山西', kv: 500 },
  { from: '山西', to: '内蒙古', kv: 500 },
  { from: '山西', to: '陕西', kv: 500 },
  { from: '山东', to: '河南', kv: 500 },
  { from: '河南', to: '河北', kv: 500 },
  // 华东电网（特高压 + 500kV）
  { from: '河南', to: '安徽', kv: 1000 },
  { from: '安徽', to: '江苏', kv: 1000 },
  { from: '江苏', to: '上海', kv: 500 },
  { from: '上海', to: '浙江', kv: 500 },
  { from: '浙江', to: '安徽', kv: 500 },
  { from: '浙江', to: '江西', kv: 500 },
  { from: '江西', to: '福建', kv: 500 },
  { from: '江苏', to: '山东', kv: 500 },
  { from: '江苏', to: '浙江', kv: 500 },
  // 华中电网
  { from: '河南', to: '湖北', kv: 500 },
  { from: '湖北', to: '湖南', kv: 500 },
  { from: '湖南', to: '江西', kv: 500 },
  { from: '湖北', to: '重庆', kv: 500 },
  { from: '重庆', to: '四川', kv: 500 },
  { from: '四川', to: '陕西', kv: 500 },
  { from: '四川', to: '贵州', kv: 500 },
  // 西北电网 750kV 主网架
  { from: '四川', to: '甘肃', kv: 750 },
  { from: '陕西', to: '甘肃', kv: 750 },
  { from: '甘肃', to: '青海', kv: 750 },
  { from: '青海', to: '新疆', kv: 750 },
  { from: '甘肃', to: '宁夏', kv: 750 },
  { from: '宁夏', to: '内蒙古', kv: 500 },
  { from: '陕西', to: '宁夏', kv: 500 },
  { from: '甘肃', to: '内蒙古', kv: 500 },
  // 青藏 / 川藏联网
  { from: '青海', to: '西藏', kv: 800 },
  { from: '四川', to: '西藏', kv: 500 },
  // 南方电网（西电东送）
  { from: '广东', to: '广西', kv: 500 },
  { from: '广西', to: '云南', kv: 500 },
  { from: '云南', to: '贵州', kv: 500 },
  { from: '贵州', to: '湖南', kv: 500 },
  { from: '贵州', to: '广西', kv: 500 },
  { from: '贵州', to: '广东', kv: 500 },
  { from: '云南', to: '广东', kv: 800 },
  { from: '广东', to: '海南', kv: 500 },
  { from: '广东', to: '福建', kv: 500 },
  { from: '广东', to: '江西', kv: 500 },
]

function buildBackboneGeoJson() {
  const index = provinceIndex()
  const features: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const line of BACKBONE_LINES) {
    const from = index.get(line.from)
    const to = index.get(line.to)
    if (!from || !to) continue
    const a = featureCenter(from)
    const b = featureCenter(to)
    if (!a || !b) continue
    const key = [line.from, line.to].sort().join('-')
    if (seen.has(key)) continue
    seen.add(key)
    features.push({
      type: 'Feature',
      properties: { kv: line.kv, name: `${line.from}—${line.to} ${VOLTAGE_STYLES[line.kv]?.label ?? ''}联络线` },
      geometry: { type: 'LineString', coordinates: [a, b] },
    })
  }
  return { type: 'FeatureCollection', features } as unknown as GeoJsonFC
}

// ===== 站点数据构建 =====

function inScope(marker: ResourceMarker): boolean {
  const top = stack.value[stack.value.length - 1]
  if (top.level === 'country') return true
  const code = marker.region_code ?? ''
  if (top.level === 'province') return code.startsWith(top.adcode.slice(0, 2))
  if (top.level === 'city') return code.startsWith(top.adcode.slice(0, 4))
  return code.startsWith(top.adcode.slice(0, 6))
}

function visibleMarkers(): ResourceMarker[] {
  return store.markers.filter(inScope)
}

function isMarkerEmphasized(marker: ResourceMarker): boolean {
  if (store.highlightType && marker.resource_type !== store.highlightType) return false
  if (store.viewMode === 'alert') {
    return marker.highest_alert_severity === 'critical' || marker.highest_alert_severity === 'high'
  }
  if (store.viewMode === 'dispatch') return marker.active_dispatch_count > 0
  return true
}

function powerBucket(marker: ResourceMarker): 'low' | 'mid' | 'high' {
  const power = marker.current_power_mw ?? 0
  const rated = marker.rated_power_mw ?? 0
  const ratio = rated > 0 ? power / rated : 0
  if (ratio >= 0.7) return 'high'
  if (ratio >= 0.35) return 'mid'
  return 'low'
}

function markerColor(marker: ResourceMarker): string {
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

function markerRadius(marker: ResourceMarker): number {
  const power = marker.current_power_mw ?? 0
  const base = 9 + Math.min(12, Math.sqrt(Math.max(0, power)) * 2.2)
  if (store.viewMode === 'alert') return base + 4
  if (store.viewMode === 'dispatch' && marker.active_dispatch_count > 0) return base + 2
  return base
}

function voltageForPower(mw: number | null): number {
  const power = mw ?? 0
  if (power >= 300) return 500
  if (power >= 100) return 220
  if (power >= 20) return 110
  if (power >= 5) return 35
  return 10
}

function buildSiteGeoJson() {
  const features: Array<Record<string, unknown>> = []
  for (const marker of visibleMarkers()) {
    features.push({
      type: 'Feature',
      id: marker.resource_id,
      properties: {
        id: marker.resource_id,
        name: marker.name,
        type: marker.resource_type,
        icon: `icon-${marker.resource_type}`,
        c: markerColor(marker),
        s: markerRadius(marker),
        emphasized: isMarkerEmphasized(marker) ? 1 : 0,
        power: marker.current_power_mw,
      },
      geometry: { type: 'Point', coordinates: [marker.longitude, marker.latitude] },
    })
  }
  return { type: 'FeatureCollection', features } as unknown as GeoJsonFC
}

function buildFeederGeoJson() {
  const features: Array<Record<string, unknown>> = []
  for (const marker of visibleMarkers()) {
    const province = provinceFeatureOf(marker.region_code ?? '')
    const center = province ? featureCenter(province) : undefined
    if (!center) continue
    const kv = voltageForPower(marker.rated_power_mw ?? marker.current_power_mw)
    features.push({
      type: 'Feature',
      properties: {
        kv,
        name: `${marker.name} 接入 ${VOLTAGE_STYLES[kv]?.label ?? ''}线路`,
        from: marker.resource_id,
      },
      geometry: { type: 'LineString', coordinates: [[marker.longitude, marker.latitude], center] },
    })
  }
  return { type: 'FeatureCollection', features } as unknown as GeoJsonFC
}

// ===== 潮流箭头（沿线流动动画）=====

function buildArrowGeoJson() {
  const features: Array<Record<string, unknown>> = []
  const backbone = buildBackboneGeoJson() as unknown as { features: Array<{ properties: { kv: number }; geometry: { coordinates: [number, number][] } }> }
  for (const line of backbone.features) {
    if ((line.properties.kv ?? 0) < 500) continue
    const [a, b] = line.geometry.coordinates
    if (!a || !b) continue
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length < 0.4) continue
    const count = Math.min(ARROW_FRAMES, Math.max(1, Math.floor(length / 0.55)))
    for (let i = 0; i < count; i += 1) {
      const t = (i + 1) / (count + 1)
      features.push({
        type: 'Feature',
        properties: { i },
        geometry: { type: 'LineString', coordinates: [a, [a[0] + dx * t, a[1] + dy * t]] },
      })
    }
  }
  return { type: 'FeatureCollection', features } as unknown as GeoJsonFC
}

function arrowFilter(): any {
  return ['==', ['%', ['+', ['get', 'i'], arrowFrame], ARROW_FRAMES], 0]
}
// ===== 站点设备清单（仿电网 GIS 设备台账）=====

function deviceListFor(marker: ResourceMarker): PopupDevice[] {
  const normal: PopupDevice['status'] = marker.operation_status === 'normal' ? 'normal' : 'warning'
  const alarm: PopupDevice['status'] = marker.operation_status === 'alarm' ? 'alarm' : normal
  switch (marker.resource_type) {
    case 'storage':
      return [
        { name: '主变压器', spec: '10kV / 0.4kV · 2500kVA', status: normal },
        { name: 'PCS 储能变流器', spec: '500kW × 4 台', status: alarm },
        { name: '电池簇 BMS', spec: '8 组 · 单体均衡中', status: normal },
        { name: '高压开关柜', spec: '10kV · 1 面', status: normal },
        { name: '智能电能表', spec: '关口计量 · 0.2S 级', status: normal },
        { name: '保护测控装置', spec: '线路保护 + 测控', status: normal },
      ]
    case 'pv':
      return [
        { name: '光伏组件阵列', spec: '12 串 · 峰值功率正常', status: normal },
        { name: '组串逆变器', spec: '110kW × 6 台', status: alarm },
        { name: '升压箱变', spec: '0.4kV / 10kV · 1000kVA', status: normal },
        { name: '直流汇流箱', spec: '4 台 · 支路监测正常', status: normal },
        { name: '并网断路器', spec: '10kV · 真空断路器', status: normal },
        { name: '电能计量表', spec: '关口计量 · 0.2S 级', status: normal },
      ]
    case 'wind':
      return [
        { name: '风力发电机组', spec: '2.5MW × 2 台', status: alarm },
        { name: '箱式变压器', spec: '35kV / 0.69kV · 2750kVA', status: normal },
        { name: '汇集线路', spec: '35kV · 1 回', status: normal },
        { name: 'SVG 无功补偿', spec: '±5Mvar', status: normal },
        { name: '并网断路器', spec: '35kV · GIS 组合电器', status: normal },
      ]
    case 'charging':
      return [
        { name: '10kV 箱变', spec: '10kV / 0.4kV · 2000kVA', status: normal },
        { name: '充电模块', spec: '30kW × 8 台', status: alarm },
        { name: '直流充电终端', spec: '16 枪 · 双枪快充', status: normal },
        { name: '智能计量表', spec: '2 只 · 0.2S 级', status: normal },
        { name: '保护装置', spec: '过流 + 漏保', status: normal },
      ]
    case 'load':
      return [
        { name: '10kV 进线柜', spec: '双回路供电', status: normal },
        { name: '计量柜', spec: '关口计量 · 0.2S 级', status: normal },
        { name: '无功补偿装置', spec: 'SVG 动态补偿', status: normal },
        { name: '配电变压器', spec: '10kV / 0.4kV · 1600kVA × 2', status: alarm },
        { name: '低压开关柜', spec: 'MNS 抽屉式', status: normal },
      ]
    case 'aidc':
      return [
        { name: '10kV 进线', spec: '双回路 · 一主一备', status: normal },
        { name: '电力变压器', spec: '10kV / 0.4kV · 2500kVA × 2', status: normal },
        { name: 'UPS 电源', spec: '600kVA × 4 套', status: alarm },
        { name: '母线联络开关', spec: '0.4kV · 联络运行', status: normal },
        { name: '智能电表', spec: '关口计量 · 0.2S 级', status: normal },
      ]
    case 'microgrid':
      return [
        { name: '微网控制器', spec: 'MGCC · 并网/孤岛切换', status: normal },
        { name: '并网开关', spec: '400V · 快速切换', status: alarm },
        { name: '储能 PCS', spec: '100kW', status: normal },
        { name: '光伏逆变器', spec: '60kW × 2 台', status: normal },
        { name: '通信网关', spec: 'IEC 61850 / 104', status: normal },
      ]
    default:
      return [
        { name: '聚合调控终端', spec: 'RTU · 四遥', status: normal },
        { name: '通信网关', spec: 'IEC 104 / Modbus', status: normal },
        { name: '电能计量表', spec: '关口计量 · 0.2S 级', status: normal },
        { name: '保护装置', spec: '防孤岛保护', status: normal },
      ]
  }
}

function statusLabel(status: string): string {
  return ({ normal: '正常', warning: '关注', alarm: '告警', offline: '离线', maintenance: '检修' } as Record<string, string>)[status] ?? status
}

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

// ===== 弹窗 =====

function updatePopupPosition() {
  if (!map || !popup.value) return
  const { marker } = popup.value
  const point = map.project([marker.longitude, marker.latitude])
  const host = container.value
  if (!host) return
  const x = point.x - 170
  const y = point.y - 330
  popup.value.x = Math.max(8, Math.min(host.clientWidth - 348, x))
  popup.value.y = Math.max(8, Math.min(host.clientHeight - 80, y))
}

function showHoverTip(feature: { properties?: unknown; geometry?: { type?: string; coordinates?: unknown } } | undefined) {
  if (!map || !feature?.geometry || feature.geometry.type !== 'Point') {
    hideHoverTip()
    return
  }
  const coordinates = (feature.geometry.coordinates as [number, number])
  const point = map.project(coordinates)
  const host = container.value
  if (!host) return
  const props = (feature.properties ?? {}) as Record<string, unknown>
  hoverTip.value = {
    show: true,
    x: Math.max(4, Math.min(host.clientWidth - 130, point.x - 60)),
    y: Math.max(4, point.y - 34),
    name: String(props.name ?? ''),
  }
}

function showRegionHover(
  event: { point: { x: number; y: number } },
  feature: { properties?: Record<string, unknown> | null },
  includeSummary: boolean,
) {
  const props = feature.properties
  if (!props) return
  const name = String(props.fullname ?? props.name ?? '')
  const details = includeSummary && Number(props.station_count ?? 0) > 0
    ? ` · 装机 ${Number(props.capacity_mw ?? 0).toFixed(1)} MW · ${Number(props.station_count)} 场站`
    : ''
  hoverTip.value = {
    show: true,
    x: event.point.x + 10,
    y: event.point.y - 8,
    name: `${name}${details}`,
  }
}

function hideHoverTip() {
  hoverTip.value.show = false
}

function openPopup(marker: ResourceMarker) {
  if (!map) return
  popupMarkerId = marker.resource_id
  popup.value = {
    marker,
    x: 0,
    y: 0,
    regionName: marker.region_name,
    status: marker.operation_status,
    devices: deviceListFor(marker),
  }
  updatePopupPosition()
}

function closePopup() {
  popup.value = null
  popupMarkerId = null
}

async function openDetail() {
  const marker = popup.value?.marker
  if (!marker) return
  bridge.notifyResourceSelected(marker.resource_id, store.scope.id)
  try {
    const detail = await fetchResourceDetail(marker.resource_id)
    store.selectResource(detail, marker)
  } catch {
    store.selectResource(fallbackDetail(marker) as never, marker)
  }
}

function onSiteClick(feature: { properties: Record<string, unknown> }) {
  const id = String(feature.properties.id ?? '')
  // 余杭良渚光伏储能电站：点击即下钻跳转专题页
  if (isLiangzhuStation(id)) {
    jumpToLiangzhuCockpit()
    return
  }
  const marker = store.markers.find((item) => item.resource_id === id)
  if (!marker) return
  map?.flyTo({ center: [marker.longitude, marker.latitude], zoom: Math.max(map.getZoom(), 8.5), duration: 700 })
  openPopup(marker)
}

/**
 * MapLibre receives coordinates in the map's logical pixel space. The cockpit
 * shell is scaled from 1920x1080, so convert the browser event back into that
 * space before querying layers or unprojecting geographic coordinates.
 */
function mapPointFromEvent(event: MapMouseEvent): [number, number] {
  if (!map || !event.originalEvent || !('clientX' in event.originalEvent)) return [event.point.x, event.point.y]
  const rect = map.getCanvas().getBoundingClientRect()
  const width = map.getCanvas().clientWidth || rect.width
  const height = map.getCanvas().clientHeight || rect.height
  return [
    (event.originalEvent.clientX - rect.left) * (width / Math.max(1, rect.width)),
    (event.originalEvent.clientY - rect.top) * (height / Math.max(1, rect.height)),
  ]
}

function siteFeatureAt(point: [number, number]) {
  if (!map) return undefined
  const pad = 12
  return map.queryRenderedFeatures(
    [[point[0] - pad, point[1] - pad], [point[0] + pad, point[1] + pad]],
    { layers: ['site-ring', 'site-icon'] },
  )[0]
}
// ===== 地图初始化与图层 =====

const COUNTRY_CENTER: [number, number] = [105.5, 36]
const COUNTRY_ZOOM = 3.5
const TIANDITU_TOKEN = (import.meta.env.VITE_TIANDITU_TOKEN as string | undefined)?.trim()

function initMap() {
  if (!detectWebGL()) {
    unsupported.value = true
    emit('unsupported')
    return
  }
  if (!mapEl.value) return
  let instance!: MaplibreMap
  try {
    instance = new MaplibreMap({
    container: mapEl.value,
    style: { version: 8, sources: {}, layers: [] },
    center: COUNTRY_CENTER,
    zoom: COUNTRY_ZOOM,
    pitch: 48,
    bearing: -8,
    minZoom: 2.4,
    maxZoom: 14,
    attributionControl: false,
    antialias: true,
  })
  map = instance
  instance.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'bottom-right')
  instance.addControl(new ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left')
    instance.on('error', (event) => {
      const sourceId = (event as { sourceId?: string }).sourceId
      const errorObject = (event as { error?: Error }).error
      const message = errorObject?.message ?? '未知错误'
      if (sourceId?.startsWith('tianditu-')) {
        console.warn(`[GisMap] optional basemap ${sourceId} unavailable:`, message)
        return
      }
      console.error('[GisMap] maplibre error:', message)
      initError.value = `GIS 地图渲染异常：${message}`
      if (/WebGL/.test(message)) {
        unsupported.value = true
        emit('unsupported')
      }
    })
    instance.on('load', () => {
      void buildLayers().then(() => {
        ready = true
        updateSiteData()
      }).catch((error) => {
        console.error('[GisMap] buildLayers failed:', error)
      })
    })
  instance.on('move', () => {
    if (!map || !instance) return
    try {
      currentZoom.value = instance.getZoom()
      infoZoom.value = `缩放 ${currentZoom.value.toFixed(1)}`
      const center = instance.getCenter()
      infoLngLat.value = `${center.lng.toFixed(2)}°E · ${center.lat.toFixed(2)}°N`
      updatePopupPosition()
    } catch {
      // 渲染上下文未就绪时忽略
    }
  })
  instance.on('mousemove', (event: MapMouseEvent) => {
    try {
      const lngLat = instance.unproject(mapPointFromEvent(event))
      cursorLngLat = [lngLat.lng, lngLat.lat]
      infoLngLat.value = `${lngLat.lng.toFixed(4)}°E · ${lngLat.lat.toFixed(4)}°N`
    } catch {
      // 渲染上下文未就绪时忽略
    }
  })
  instance.on('mouseout', () => {
    cursorLngLat = null
  })
    resizeObserver = new ResizeObserver(() => instance?.resize())
    resizeObserver.observe(container.value as HTMLElement)
  } catch (error) {
    console.error('[GisMap] 地图初始化失败:', error)
    initError.value = 'GIS 地图初始化失败，已自动切换 2D 兼容地图。'
    unsupported.value = true
    emit('unsupported')
  }
}

async function registerIconImages(): Promise<void> {
  const m = map
  if (!m) return
  const types = ['storage', 'pv', 'wind', 'charging', 'load', 'aidc', 'microgrid', 'vpp', 'unknown']
  const images: Array<{ name: string; svg: string }> = types.map((type) => ({
    name: `icon-${type}`,
    svg: typeIconSvg(type),
  }))
  await Promise.all(
    images.map((image) => {
      const img = new Image()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.svg)}`
      return img.decode().then(() => {
        if (!m.hasImage(image.name)) m.addImage(image.name, img)
      }).catch(() => undefined)
    }),
  )
}

async function buildLayers() {
  const m = map
  if (!m) return
  await registerIconImages()
  // 底图填充：全球暗色底
  m.addSource('ocean', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]],
        },
      }],
    } as unknown as GeoJsonFC,
  })
  m.addLayer({
    id: 'ocean-fill',
    type: 'fill',
    source: 'ocean',
    paint: { 'fill-color': '#070B12' },
  })

  if (TIANDITU_TOKEN) {
    m.addSource('tianditu-img', {
      type: 'raster',
      tiles: [`https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(TIANDITU_TOKEN)}`],
      tileSize: 256,
    })
    m.addLayer({
      id: 'tianditu-img',
      type: 'raster',
      source: 'tianditu-img',
      minzoom: 0,
      maxzoom: 18,
      paint: { 'raster-opacity': 0.76, 'raster-saturation': -0.38, 'raster-brightness-max': 0.58 },
    })
    m.addSource('tianditu-cva', {
      type: 'raster',
      tiles: [`https://t0.tianditu.gov.cn/DataServer?T=cva_w&x={x}&y={y}&l={z}&tk=${encodeURIComponent(TIANDITU_TOKEN)}`],
      tileSize: 256,
    })
  }

  // 中国省界
  m.addSource('china', {
    type: 'geojson',
    data: china as unknown as GeoJsonFC,
    promoteId: 'adcode',
  })
  m.addSource('province-summary', {
    type: 'geojson',
    data: buildProvinceGeoJson(),
    promoteId: 'adcode',
  })
  m.addLayer({
    id: 'china-fill',
    type: 'fill',
    source: 'province-summary',
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#123047',
        '#0B1626',
      ],
      'fill-opacity': TIANDITU_TOKEN ? 0.34 : 0.94,
    },
  })
  m.addLayer({
    id: 'province-extrude',
    type: 'fill-extrusion',
    source: 'province-summary',
    maxzoom: 5.55,
    paint: {
      'fill-extrusion-base': 0,
      'fill-extrusion-height': ['get', 'extrusion_height_m'],
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#123047',
        ['get', 'status_color'],
      ],
      'fill-extrusion-opacity': TIANDITU_TOKEN ? 0.46 : 0.72,
    },
  })
  m.addLayer({
    id: 'china-line',
    type: 'line',
    source: 'china',
    paint: {
      'line-color': '#2B4257',
      'line-width': 0.9,
      'line-opacity': 0.9,
    },
  })
  // 省界发光外描边
  m.addLayer({
    id: 'china-glow',
    type: 'line',
    source: 'china',
    paint: {
      'line-color': '#2E5E7A',
      'line-width': 2.2,
      'line-opacity': 0.16,
    },
  })

  // 下钻区域边界（省市县）
  m.addSource('region', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC,
    promoteId: 'adcode',
  })
  m.addLayer({
    id: 'region-fill',
    type: 'fill',
    source: 'region',
    paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#0F2A3D', '#0A1422'],
      'fill-opacity': 0.6,
    },
  })
  m.addLayer({
    id: 'region-line',
    type: 'line',
    source: 'region',
    paint: {
      'line-color': '#3E7B9E',
      'line-width': 1.1,
      'line-opacity': 0.95,
    },
  })

  if (TIANDITU_TOKEN) {
    m.addLayer({
      id: 'tianditu-cva',
      type: 'raster',
      source: 'tianditu-cva',
      minzoom: 0,
      maxzoom: 18,
      paint: { 'raster-opacity': 0.78, 'raster-brightness-max': 0.74 },
    })
  }

  // 电压等级线路（主干网 + 站点接入）
  m.addSource('grid-lines', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC,
  })
  m.addLayer({
    id: 'grid-line',
    type: 'line',
    source: 'grid-lines',
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'match', ['get', 'kv'],
        1000, VOLTAGE_STYLES[1000].color,
        800, VOLTAGE_STYLES[800].color,
        750, VOLTAGE_STYLES[750].color,
        500, VOLTAGE_STYLES[500].color,
        220, VOLTAGE_STYLES[220].color,
        110, VOLTAGE_STYLES[110].color,
        35, VOLTAGE_STYLES[35].color,
        VOLTAGE_STYLES[10].color,
      ],
      'line-width': [
        'match', ['get', 'kv'],
        1000, 2.6,
        800, 2.3,
        750, 2.1,
        500, 1.7,
        220, 1.2,
        110, 1,
        35, 0.8,
        0.6,
      ],
      'line-opacity': 0.9,
    },
  })

  // 线路发光
  m.addLayer({
    id: 'grid-glow',
    type: 'line',
    source: 'grid-lines',
    layout: { visibility: 'none' },
    paint: {
      'line-color': ['match', ['get', 'kv'], 1000, '#F06292', 800, '#FF8A3D', 750, '#FF8A3D', 500, '#F2635A', '#2E5E7A'],
      'line-width': ['match', ['get', 'kv'], 1000, 5.5, 800, 4.6, 750, 4.2, 500, 3.4, 0],
      'line-opacity': 0.14,
    },
  })

  // 潮流箭头
  m.addSource('flow-arrow', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC,
  })
  if (!m.hasImage('flow-triangle')) {
    const arrowImg = new Image()
    arrowImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M11 3 L20 17 H2 Z" fill="rgba(140,240,225,0.9)"/></svg>',
    )}`
    try {
      await arrowImg.decode()
      if (!m.hasImage('flow-triangle')) m.addImage('flow-triangle', arrowImg)
    } catch {
      // 箭头图标加载失败时忽略
    }
  }
  m.addLayer({
    id: 'flow-arrow',
    type: 'symbol',
    source: 'flow-arrow',
    layout: {
      visibility: 'none',
      'symbol-placement': 'line',
      'icon-image': 'flow-triangle',
      'icon-size': 0.55,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-pitch-alignment': 'map',
    },
    paint: { 'icon-opacity': 0.85 },
  })

  // 站点聚类 + 符号
  m.addSource('sites', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC,
  })
  // 功率越高光晕越大，等效表达点状场站的 3D 高度感。
  m.addLayer({
    id: 'site-glow',
    type: 'circle',
    source: 'sites',
    paint: {
      'circle-radius': ['+', ['get', 's'], 8],
      'circle-color': ['get', 'c'],
      'circle-opacity': ['case', ['==', ['get', 'emphasized'], 1], 0.3, 0.08],
      'circle-blur': 0.82,
    },
  })
  // 站点状态圆环
  m.addLayer({
    id: 'site-ring',
    type: 'circle',
    source: 'sites',
    paint: {
      'circle-radius': ['get', 's'],
      'circle-color': '#0B1522',
      'circle-stroke-color': ['get', 'c'],
      'circle-stroke-width': 2.6,
      'circle-opacity': ['case', ['==', ['get', 'emphasized'], 1], 0.96, 0.55],
    },
  })
  // 站点类型图标
  m.addLayer({
    id: 'site-icon',
    type: 'symbol',
    source: 'sites',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 0.42,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': ['case', ['==', ['get', 'emphasized'], 1], 1, 0.42],
    },
  })
  // 点击与悬停事件
  m.on('click', (event) => {
    const point = mapPointFromEvent(event)
    const siteFeature = siteFeatureAt(point)
    if (siteFeature) {
      event.originalEvent?.stopPropagation()
      onSiteClick(siteFeature as unknown as { properties: Record<string, unknown> })
      return
    }
    closePopup()
    const lngLat = m.unproject(point)
    const feature = regionFeatureAt(lngLat.lng, lngLat.lat)
    if (!feature) return
    event.originalEvent?.stopPropagation()
    const layerId = stack.value[stack.value.length - 1].level === 'country' ? 'china-fill' : 'region-fill'
    void handleRegionClick(feature as unknown as GeoFeature, layerId)
  })
  m.on('mousemove', (event) => {
    const point = mapPointFromEvent(event)
    const siteFeature = siteFeatureAt(point)
    if (siteFeature) {
      m.getCanvas().style.cursor = 'pointer'
      clearHoveredRegion()
      showHoverTip(siteFeature)
      return
    }
    const lngLat = m.unproject(point)
    const feature = regionFeatureAt(lngLat.lng, lngLat.lat)
    if (!feature) {
      hideHoverTip()
      clearHoveredRegion()
      m.getCanvas().style.cursor = ''
      return
    }
    m.getCanvas().style.cursor = 'pointer'
    const isCountry = stack.value[stack.value.length - 1].level === 'country'
    showRegionHover({ point: { x: point[0], y: point[1] } }, feature, isCountry)
    const adcode = feature?.properties?.adcode
    if (adcode !== undefined) {
      setHoveredRegion(isCountry ? 'province-summary' : 'region', adcode as string | number)
    }
  })
  m.on('mouseout', () => {
    if (m) m.getCanvas().style.cursor = ''
    hideHoverTip()
    clearHoveredRegion()
  })
}
// ===== 下钻 / 返回 =====

function syncScope() {
  if (stack.value.length === 1) {
    store.setMapScope('country')
  } else {
    store.setMapScope(stack.value.slice(1).map((state) => state.name).join('/'))
  }
}

function regionCenter(state: DrillLevelState): [number, number] {
  return state.center ?? featureCenter(state.geo.features[0]) ?? COUNTRY_CENTER
}

function zoomForLevel(level: DrillLevel): number {
  switch (level) {
    case 'country': return 3.5
    case 'province': return 5.6
    case 'city': return 7.6
    case 'district': return 9.2
  }
}

async function drillToAdcode(level: DrillLevel, adcode: string, name: string, center?: [number, number]) {
  try {
    const geo = await loadMapLevel(level, adcode)
    stack.value.push({ level, adcode, name, geo, center })
    try {
      const regionSource = map?.getSource('region') as GeoJSONSource | undefined
      regionSource?.setData(geo as unknown as GeoJsonFC)
    } catch (error) {
      console.error('[GisMap] region setData failed:', error)
    }
    syncScope()
    map?.flyTo({ center: center ?? regionCenter(stack.value[stack.value.length - 1]), zoom: zoomForLevel(level), duration: 900 })
    updateSiteData()
  } catch (error) {
    console.warn(`[GisMap] 下钻失败 ${adcode}:`, error)
  }
}

function featureOf(geo: GeoFeatureCollection, name: string): GeoFeature | undefined {
  return geo.features.find((item) => featureName(item) === name)
}

async function handleRegionClick(feature: GeoFeature, layerId: string) {
  const current = stack.value[stack.value.length - 1]
  const level = layerId === 'china-fill' ? 'province' : nextLevel(current.level)
  if (!level || !hasChildren(feature)) return
  const adcode = String(feature.properties.adcode ?? feature.properties.code ?? '')
  if (!adcode) return
  await drillToAdcode(level, adcode, featureName(feature), featureCenter(feature))
}

async function drillTo(name: string) {
  const current = stack.value[stack.value.length - 1]
  const feature = featureOf(current.geo, name) ?? chinaFeatures.find((item) => featureName(item) === name)
  if (!feature) return
  const level = current.level === 'country' ? 'province' : nextLevel(current.level)
  const adcode = String(feature.properties.adcode ?? feature.properties.code ?? '')
  if (!level || !adcode) return
  await drillToAdcode(level, adcode, featureName(feature), featureCenter(feature))
}

function resetMapView() {
  stack.value = [stack.value[0]]
  syncScope()
  store.setHighlightType(null)
  store.clearSelectedResource()
  closePopup()
  const regionSource = map?.getSource('region') as GeoJSONSource | undefined
  regionSource?.setData({ type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC)
  map?.flyTo({ center: COUNTRY_CENTER, zoom: COUNTRY_ZOOM, pitch: 48, bearing: -8, duration: 800 })
  updateSiteData()
}

function drillBack() {
  if (stack.value.length <= 1 || !map) return
  stack.value.pop()
  const state = stack.value[stack.value.length - 1]
  syncScope()
  const regionSource = map.getSource('region') as GeoJSONSource | undefined
  regionSource?.setData(
    state.level === 'country'
      ? ({ type: 'FeatureCollection', features: [] } as unknown as GeoJsonFC)
      : (state.geo as unknown as GeoJsonFC),
  )
  map.flyTo({ center: regionCenter(state), zoom: zoomForLevel(state.level), duration: 800 })
  updateSiteData()
}

function canGoBack(): boolean {
  return stack.value.length > 1
}

function getScope(): string {
  return stack.value[stack.value.length - 1].name
}

// ===== 数据更新 =====

function updateSiteData() {
  if (!map || !ready) return
  try {
    const provinceSource = map.getSource('province-summary') as GeoJSONSource | undefined
    provinceSource?.setData(buildProvinceGeoJson())
  } catch (error) {
    console.error('[GisMap] province summary setData failed:', error)
  }
  try {
    const sitesSource = map.getSource('sites') as GeoJSONSource | undefined
    sitesSource?.setData(buildSiteGeoJson())
  } catch (error) {
    console.error('[GisMap] sites setData failed:', error)
  }
  try {
    const linesSource = map.getSource('grid-lines') as GeoJSONSource | undefined
    const backbone = buildBackboneGeoJson()
    const merged = {
      type: 'FeatureCollection',
      // 仅呈现电压等级主干网架；潮流方向和站点馈线不在驾驶舱前端展示。
      features: [...(backbone as { features: unknown[] }).features],
    } as unknown as GeoJsonFC
    linesSource?.setData(merged)
  } catch (error) {
    console.error('[GisMap] lines setData failed:', error)
  }
  try {
    const arrowSource = map.getSource('flow-arrow') as GeoJSONSource | undefined
    arrowSource?.setData(buildArrowGeoJson())
  } catch (error) {
    console.error('[GisMap] arrow setData failed:', error)
  }
  if (popupMarkerId && !store.markers.some((marker) => marker.resource_id === popupMarkerId)) {
    closePopup()
  } else if (popupMarkerId) {
    const marker = store.markers.find((item) => item.resource_id === popupMarkerId)
    if (marker) openPopup(marker)
  }
}

function startArrowAnimation() {
  stopArrowAnimation()
  arrowTimer = window.setInterval(() => {
    arrowFrame = (arrowFrame + 1) % ARROW_FRAMES
    map?.setFilter('flow-arrow', arrowFilter() as never)
  }, 130)
}

function stopArrowAnimation() {
  if (arrowTimer !== undefined) {
    window.clearInterval(arrowTimer)
    arrowTimer = undefined
  }
}

// ===== 定位 =====

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

async function locateTo(lng: number, lat: number, name: string, _region?: string) {
  if (!map) return
  const marker = store.markers.find((item) => item.resource_id === name || item.name === name)
    ?? nearestMarker(lng, lat)
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 8.5), duration: 900 })
  if (marker) {
    openPopup(marker)
  }
}

function projectGeoToScreen(lng: number, lat: number) {
  if (!map || !container.value) return { x: 0, y: 0, visible: false }
  const point = map.project([lng, lat])
  return {
    x: point.x,
    y: point.y,
    visible: point.x >= 0 && point.y >= 0 && point.x <= container.value.clientWidth && point.y <= container.value.clientHeight,
  }
}

// ===== 生命周期 =====

onMounted(() => {
  initMap()
})

onBeforeUnmount(() => {
  stopArrowAnimation()
  resizeObserver?.disconnect()
  map?.remove()
  map = null
  ready = false
})

watch(
  [() => store.markers, () => store.viewMode, () => store.highlightType],
  () => {
    updateSiteData()
  },
)

defineExpose({
  locateTo,
  resetMapView,
  drillBack,
  canGoBack,
  getScope,
  drillTo,
  getZoomState: () => ({
    distance: map?.getZoom() ?? COUNTRY_ZOOM,
    min: 2.4,
    max: 14,
    atMin: (map?.getZoom() ?? COUNTRY_ZOOM) <= 2.4,
    atMax: (map?.getZoom() ?? COUNTRY_ZOOM) >= 14,
  }),
  zoomBy: (deltaY: number) => {
    if (!map) return
    const factor = deltaY < 0 ? 1 : -1
    map.zoomTo(Math.min(14, Math.max(2.4, map.getZoom() + factor * 0.8)), { duration: 200 })
  },
  getHoveredFeature: () => '',
  projectGeoToScreen,
  isEarthMode: () => false,
})
</script>

<style scoped>
.gis-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #060A10;
}
.gis-map {
  position: absolute;
  inset: 0;
}
.gis-map :deep(.maplibregl-canvas) {
  outline: none;
}
.gis-map :deep(.maplibregl-ctrl-bottom-right) {
  bottom: 92px;
  right: 10px;
}
.gis-map :deep(.maplibregl-ctrl-group) {
  background: rgba(13, 20, 28, 0.92);
  border: 1px solid rgba(53, 214, 196, 0.35);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
.gis-map :deep(.maplibregl-ctrl-group button) {
  background: transparent;
  width: 30px;
  height: 30px;
}
.gis-map :deep(.maplibregl-ctrl-group button + button) {
  border-top: 1px solid rgba(53, 214, 196, 0.2);
}
.gis-map :deep(.maplibregl-ctrl-group button span) {
  filter: invert(0.75) sepia(0.2) saturate(2);
}
.gis-map :deep(.maplibregl-ctrl-scale) {
  background: rgba(10, 16, 24, 0.85);
  color: #8FA6BC;
  border-color: rgba(120, 150, 170, 0.5);
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 2px;
}
.gis-back,
.gis-reset {
  position: absolute;
  top: 12px;
  z-index: 20;
  background: rgba(13, 18, 24, 0.92);
  border: 1px solid rgba(53, 214, 196, 0.4);
  border-radius: 4px;
  color: var(--cockpit-power);
  font-size: 12.5px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.gis-reset { left: 150px; }
.gis-back { left: 224px; }
.gis-back:hover,
.gis-reset:hover { background: rgba(53, 214, 196, 0.16); }
.gis-source-status {
  position: absolute;
  top: 52px;
  left: 14px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid rgba(53, 214, 196, 0.26);
  border-radius: 4px;
  background: rgba(8, 14, 21, 0.86);
  color: var(--cockpit-text-2);
  font-size: 11px;
  line-height: 1;
  pointer-events: none;
}
.gis-source-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cockpit-power);
  box-shadow: 0 0 7px rgba(53, 214, 196, 0.68);
}
.gis-source-sep { color: var(--cockpit-text-3); }
.gis-error {
  position: absolute;
  top: 46px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  max-width: 70%;
  font-size: 12px;
  color: #FFB4AE;
  background: rgba(80, 16, 16, 0.92);
  border: 1px solid rgba(240, 100, 91, 0.6);
  border-radius: 4px;
  padding: 6px 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  text-align: center;
}
.gis-info {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: rgba(145, 160, 174, 0.9);
  background: rgba(10, 16, 24, 0.8);
  border: 1px solid rgba(53, 214, 196, 0.2);
  border-radius: 3px;
  padding: 3px 12px;
  pointer-events: none;
  white-space: nowrap;
}
.gis-hover-tip {
  position: absolute;
  z-index: 28;
  pointer-events: none;
  background: rgba(8, 14, 21, 0.92);
  border: 1px solid rgba(53, 214, 196, 0.45);
  border-radius: 3px;
  color: #E8EEF3;
  font-size: 12px;
  padding: 3px 10px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  transform: translateY(-100%);
}
.gis-popup {
  position: absolute;
  z-index: 30;
  width: 340px;
  background: linear-gradient(180deg, rgba(14, 22, 32, 0.97), rgba(10, 16, 24, 0.97));
  border: 1px solid rgba(53, 214, 196, 0.45);
  border-left: 3px solid var(--cockpit-power);
  border-radius: 5px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.65);
  font-size: 12px;
  pointer-events: auto;
}
.gis-popup.popup-alarm { border-left-color: #F0645B; }
.gis-popup.popup-warning { border-left-color: #E7B34F; }
.gp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 6px;
}
.gp-title {
  font-size: 14px;
  font-weight: 600;
  color: #E8EEF3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gp-type {
  font-size: 11px;
  color: var(--cockpit-power);
  border: 1px solid rgba(53, 214, 196, 0.4);
  border-radius: 3px;
  padding: 1px 6px;
  flex-shrink: 0;
}
.gp-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: #7C90A3;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.gp-close:hover { color: #E8EEF3; }
.gp-sub {
  padding: 0 12px 7px;
  font-size: 11px;
  color: #7C90A3;
}
.gp-kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: rgba(53, 214, 196, 0.12);
  border-top: 1px solid rgba(53, 214, 196, 0.18);
  border-bottom: 1px solid rgba(53, 214, 196, 0.18);
}
.gp-kpi {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(8, 14, 21, 0.9);
  padding: 7px 12px;
}
.gp-kpi-label { font-size: 10.5px; color: #7C90A3; }
.gp-kpi-value { font-size: 13px; font-weight: 600; color: #E8EEF3; }
.gp-coordinates {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  color: #A8C4D6;
  font-family: Consolas, monospace;
  font-size: 11.5px;
  border-bottom: 1px solid rgba(53, 214, 196, 0.18);
}
.gp-devices {
  padding: 8px 12px;
  max-height: 148px;
  overflow-y: auto;
}
.gp-devices-title {
  font-size: 11px;
  color: #9FB4C7;
  font-weight: 600;
  margin-bottom: 5px;
}
.gp-device-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3.5px 0;
  border-bottom: 1px dashed rgba(47, 66, 86, 0.5);
  font-size: 11.5px;
}
.gp-device-row:last-child { border-bottom: none; }
.gp-device-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #35D6C4;
}
.gp-device-dot.dv-warning { background: #E7B34F; }
.gp-device-dot.dv-alarm { background: #F0645B; animation: gp-blink 1.1s infinite; }
.gp-device-name { color: #C6D6E2; flex-shrink: 0; }
.gp-device-spec { color: #7C90A3; margin-left: auto; text-align: right; }
.gp-foot {
  display: flex;
  justify-content: flex-end;
  padding: 7px 12px 9px;
  border-top: 1px solid rgba(47, 66, 86, 0.6);
}
.gp-detail {
  background: transparent;
  border: 1px solid rgba(53, 214, 196, 0.5);
  border-radius: 4px;
  color: var(--cockpit-power);
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.gp-detail:hover { background: rgba(53, 214, 196, 0.14); }
@keyframes gp-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
</style>

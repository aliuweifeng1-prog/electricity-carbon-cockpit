<!--
  中央 · 地球态势区（§3.6）：
  - 直接挂载 CockpitMap（原地球组件视觉冻结），移除静态 HTML 内第二层 mapFrame iframe
  - 左上范围面包屑、右上资源搜索（P0 服务端检索）、底部中央四段式视图切换、右下图例+数据时间+质量
  - 地球模式渲染省/区域聚合点覆盖层（Three.js 相机投影，不渲染全部站点 DOM）
-->
<template>
  <section class="earth-stage" @click="onStageClick">
    <CockpitMap v-if="renderMode === 'earth'" ref="mapRef" />
    <GisMapStage v-else-if="renderMode === 'gis'" ref="mapRef" @unsupported="onGisUnsupported" />
    <Map2DStage v-else ref="mapRef" />
    <div v-if="gisNotice" class="earth-notice">{{ gisNotice }}</div>

    <!-- 地球聚合点覆盖层（仅地球模式，资源/功率视图） -->
    <div v-if="earthMode && renderMode === 'earth' && showClusters" class="cluster-layer" aria-hidden="false">
      <button
        v-for="pos in clusterPositions"
        :key="pos.cluster.cluster_id"
        type="button"
        class="cluster-dot"
        :class="[`mode-${store.viewMode}`, `sev-${pos.cluster.highest_alert_severity || 'none'}`, { 'is-liangzhu': pos.cluster.cluster_id === LIANGZHU_STATION_ID }]"
        :style="{ left: pos.x + 'px', top: pos.y + 'px', width: pos.size + 'px', height: pos.size + 'px' }"
        :title="clusterTitle(pos.cluster)"
        @click.stop="onClusterClick(pos.cluster)"
      >
        <span class="cluster-num num-font">{{ pos.cluster.resource_count }}</span>
      </button>
    </div>

    <!-- 地球空白侧：资源列表（点击下钻详情，§3.6 数据层） -->
    <div v-if="earthMode || renderMode !== 'earth'" class="earth-resources" :class="{ collapsed: resourcesCollapsed }">
      <div class="er-head">
        <span v-if="!resourcesCollapsed" class="er-title">地球资源</span>
        <span v-if="!resourcesCollapsed" class="er-count num-font">{{ store.markers.length }}</span>
        <button type="button" class="er-toggle" :title="resourcesCollapsed ? '展开资源列表' : '收起资源列表'" @click.stop="resourcesCollapsed = !resourcesCollapsed">
          {{ resourcesCollapsed ? '»' : '«' }}
        </button>
      </div>
      <div v-if="!resourcesCollapsed" class="er-list">
        <button
          v-for="m in store.markers"
          :key="m.resource_id"
          type="button"
          class="er-item"
          @click.stop="onResourceClick(m)"
        >
          <span class="er-name">
            <i class="er-dot" :class="`st-${markerStatus(m)}`" />
            <span class="er-name-text">{{ m.name }}</span>
          </span>
          <span class="er-meta">{{ RESOURCE_TYPE_LABEL[m.resource_type] }} · {{ formatNullable(m.current_power_mw, 1) }} MW</span>
          <span class="er-coord">{{ m.longitude.toFixed(4) }}, {{ m.latitude.toFixed(4) }}</span>
        </button>
        <div v-if="!store.markers.length" class="er-empty">暂无资源</div>
      </div>
    </div>
    <!-- 3D/2D 渲染模式切换（原型） -->
    <div class="earth-controls render-switch">
      <button type="button" :class="{ active: renderMode === 'earth' }" @click.stop="setRenderMode('earth')">3D 地球</button>
      <button type="button" :class="{ active: renderMode === 'gis' }" @click.stop="setRenderMode('gis')">GIS 地图</button>
      <button type="button" :class="{ active: renderMode === 'map2d' }" @click.stop="setRenderMode('map2d')">2D 地图</button>
    </div>
    <!-- 左上：范围面包屑 -->
    <div class="earth-controls breadcrumb">
      <span class="crumb-item" :class="{ current: store.mapScope === 'country' }">全国</span>
      <template v-for="(part, i) in mapScopeParts" :key="i">
        <span class="crumb-sep">/</span>
        <span class="crumb-item" :class="{ current: i === mapScopeParts.length - 1 }">{{ part }}</span>
      </template>
    </div>

    <!-- 右上：资源搜索（P0） -->
    <div class="earth-controls search-box">
      <input
        v-model="query"
        class="search-input"
        type="text"
        placeholder="搜索资源名称 / 编码 / 站点 / 区域"
        @input="onSearchInput"
        @keydown.enter="runSearch"
        @focus="openSearch = true"
        @blur="delayCloseSearch"
      />
      <div v-if="openSearch && (searching || results.length)" class="search-results">
        <div v-if="searching" class="sr-loading">搜索中…</div>
        <button
          v-for="r in results"
          :key="r.resource_id"
          type="button"
          class="sr-item"
          @mousedown.prevent="onPickResult(r)"
        >
          <span class="sr-name">{{ r.name }}</span>
          <span class="sr-meta">{{ RESOURCE_TYPE_LABEL[r.resource_type] }} · {{ r.region_name }}</span>
        </button>
        <div v-if="!searching && !results.length && query" class="sr-empty">未找到匹配资源</div>
      </div>
    </div>

    <!-- 底部中央：四段式视图切换 -->
    <div class="earth-controls view-tabs"><EarthViewTabs /></div>

    <!-- 右下：图例 + 数据时间 + 质量 -->
    <div class="earth-controls legend-box">
      <div class="legend-items">
        <template v-if="store.viewMode === 'resource'">
          <span class="lg-item"><i class="lg-dot" style="background:#35D6C4" />正常</span>
          <span class="lg-item"><i class="lg-dot" style="background:#E7B34F" />关注</span>
          <span class="lg-item"><i class="lg-dot" style="background:#F0645B" />告警</span>
          <span class="lg-item"><i class="lg-dot" style="background:#5C6A7D" />离线</span>
        </template>
        <template v-else-if="store.viewMode === 'power'">
          <span class="lg-item"><i class="lg-bar lg-low" />低</span>
          <span class="lg-item"><i class="lg-bar lg-mid" />中</span>
          <span class="lg-item"><i class="lg-bar lg-high" />高（MW）</span>
        </template>
        <template v-else-if="store.viewMode === 'dispatch'">
          <span class="lg-item"><i class="lg-dot" style="background:#35D6C4" />生效调度事件</span>
        </template>
        <template v-else>
          <span class="lg-item"><i class="lg-dot lg-breathe" style="background:#F0645B" />严重告警</span>
          <span class="lg-item"><i class="lg-dot" style="background:#E7B34F" />高告警</span>
        </template>
      </div>
      <div class="legend-meta">
        <span>数据时间 {{ formatShortClock(store.mapAsOf) }}</span>
        <span :style="{ color: qualityColor(store.resourceMapQuality) }">{{ qualityLabel(store.resourceMapQuality) }}</span>
      </div>
    </div>

    <!-- 自动巡检标识 -->
    <div v-if="store.ui.autoPatrol" class="patrol-badge">自动巡检中</div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import CockpitMap from '../embed/CockpitMap.vue';
import GisMapStage from '../map/GisMapStage.vue';
import Map2DStage from '../map/Map2DStage.vue';
import EarthViewTabs from './EarthViewTabs.vue';
import { useCockpitStore } from '../../stores/cockpit';
import { useHostBridge } from '../../composables/useHostBridge';
import { fetchResourceDetail, searchCockpitResources } from '../../api/cockpit';
import { formatNullable, formatShortClock, qualityColor, qualityLabel } from '../../utils/format';
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit';
import type { ResourceCluster, ResourceDetail, ResourceMarker } from '../../types/cockpit';
import { LIANGZHU_LAT, LIANGZHU_LNG, LIANGZHU_STATION_ID, isLiangzhuStation, jumpToLiangzhuCockpit, makeLiangzhuCluster } from '../../utils/liangzhu';

type MapApi = {
  locateTo?: (lng: number, lat: number, name: string, region?: string) => void;
  projectGeoToScreen?: (lon: number, lat: number) => { x: number; y: number; visible: boolean };
  isEarthMode?: () => boolean;
};

const store = useCockpitStore();
const bridge = useHostBridge();
const mapRef = ref<MapApi | null>(null);

const earthMode = ref(true);
const savedMode = localStorage.getItem('cockpit.renderMode');
const webglOk = (() => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
})();
const renderMode = ref<'earth' | 'gis' | 'map2d'>(savedMode === 'earth' ? 'earth' : (webglOk ? 'gis' : 'map2d'));

function setRenderMode(mode: 'earth' | 'gis' | 'map2d') {
  renderMode.value = mode
  localStorage.setItem('cockpit.renderMode', mode)
}
const query = ref('');
const openSearch = ref(false);
const searching = ref(false);
const results = ref<ResourceMarker[]>([]);
const clusterPositions = ref<Array<{ cluster: ResourceCluster; x: number; y: number; size: number }>>([]);

let searchTimer: number | undefined;
let closeTimer: number | undefined;
let raf = 0;

const mapScopeParts = computed(() => {
  const scope = store.mapScope
  if (!scope || scope === 'country') return []
  const parts = scope.split('/').filter(Boolean)
  return parts
})

const showClusters = computed(() => store.viewMode === 'resource' || store.viewMode === 'power')

function clusterTitle(cluster: ResourceCluster): string {
  return `${cluster.region_name} · ${cluster.resource_count} 个资源 · ${cluster.online_count} 在线 · 当前 ${cluster.total_current_power_mw ?? '--'} MW`
}

function onStageClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.device-marker-3d, .earth-controls, .cluster-layer, .earth-resources')) return
  store.clearSelectedResource()
  store.setHighlightType(null)
}

function onClusterClick(cluster: ResourceCluster) {
  // 余杭良渚光伏储能电站：点击即下钻跳转专题页
  if (isLiangzhuStation(cluster.cluster_id)) {
    jumpToLiangzhuCockpit();
    return;
  }
  const lng = (cluster.bounds.min_lon + cluster.bounds.max_lon) / 2
  const lat = (cluster.bounds.min_lat + cluster.bounds.max_lat) / 2
  mapRef.value?.locateTo?.(lng, lat, cluster.region_name, cluster.region_name)
  store.setMapScope(cluster.region_name)
}

async function onPickResult(r: ResourceMarker) {
  openSearch.value = false
  query.value = r.name
  mapRef.value?.locateTo?.(r.longitude, r.latitude, r.name, r.region_name)
  store.setMapScope(r.region_name)
  bridge.notifyResourceSelected(r.resource_id, store.scope.id)
  try {
    const detail = await fetchResourceDetail(r.resource_id)
    store.selectResource(detail, r)
  } catch {
    /* 详情失败保持搜索结果 */
  }
}

function onSearchInput() {
  if (searchTimer !== undefined) window.clearTimeout(searchTimer)
  const q = query.value.trim()
  if (!q) {
    results.value = []
    openSearch.value = false
    return
  }
  openSearch.value = true
  searching.value = true
  searchTimer = window.setTimeout(async () => {
    try {
      results.value = await searchCockpitResources(q)
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 300)
}

function runSearch() { onSearchInput() }
function delayCloseSearch() {
  if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(() => { openSearch.value = false }, 180)
}

const resourcesCollapsed = ref(false)

function markerStatus(m: ResourceMarker): string {
  return m.operation_status ?? 'normal'
}

function fallbackDetail(m: ResourceMarker): ResourceDetail {
  return {
    resource_id: m.resource_id,
    site_id: m.site_id,
    name: m.name,
    resource_type: m.resource_type,
    organization_name: '--',
    site_name: m.site_id,
    region_name: m.region_name,
    operation_status: m.operation_status,
    online_status: m.online_status,
    as_of: m.as_of,
    quality_status: m.quality_status,
    current_power_mw: m.current_power_mw,
    rated_power_mw: m.rated_power_mw,
    load_rate_pct: m.rated_power_mw ? Math.round(((m.current_power_mw ?? 0) / m.rated_power_mw) * 1000) / 10 : null,
    verified_adjustable_up_mw: m.verified_adjustable_up_mw,
    verified_adjustable_down_mw: m.verified_adjustable_down_mw,
    sustainable_duration_h: m.sustainable_duration_h,
    available_window: null,
    soc_pct: m.soc_pct,
    soh_pct: null,
    energy_capacity_mwh: null,
    today_energy_mwh: null,
    today_revenue_cny: null,
    today_carbon_reduction_tco2e: null,
    alerts: [],
    active_dispatch_events: [],
  }
}

const gisNotice = ref('')

function onGisUnsupported() {
  gisNotice.value = '当前浏览器不支持 WebGL，GIS 专业地图不可用，已自动切换 2D 兼容地图（可点击「GIS 地图」重试）。'
  setRenderMode('map2d')
}

async function onResourceClick(m: ResourceMarker) {
  // 余杭良渚光伏储能电站：点击即下钻跳转专题页
  if (isLiangzhuStation(m.resource_id)) {
    jumpToLiangzhuCockpit();
    return;
  }
  store.setHighlightType(null)
  mapRef.value?.locateTo?.(m.longitude, m.latitude, m.name, m.region_name)
  bridge.notifyResourceSelected(m.resource_id, store.scope.id)
  try {
    const detail = await fetchResourceDetail(m.resource_id)
    store.selectResource(detail, m)
  } catch {
    store.selectResource(fallbackDetail(m), m)
  }
}

/** 地球聚合点投影循环（只读投影，不重建 Three 场景） */
function updateClusterProjection() {
  raf = requestAnimationFrame(updateClusterProjection)
  const api = mapRef.value
  if (!api?.projectGeoToScreen || !api?.isEarthMode) return
  const isEarth = api.isEarthMode()
  earthMode.value = isEarth
  if (!isEarth || !showClusters.value) {
    if (clusterPositions.value.length) clusterPositions.value = []
    return
  }
  const next: Array<{ cluster: ResourceCluster; x: number; y: number; size: number }> = []
  for (const cluster of store.clusters) {
    if (store.highlightType) {
      // 类型高亮时聚合层仅保留该类型资源（由地图组件处理过滤，这里隐藏聚合层避免误导）
      continue
    }
    const lng = (cluster.bounds.min_lon + cluster.bounds.max_lon) / 2
    const lat = (cluster.bounds.min_lat + cluster.bounds.max_lat) / 2
    const pos = api.projectGeoToScreen(lng, lat)
    if (!pos.visible) continue
    const size = Math.max(14, Math.min(32, 10 + (cluster.resource_count * 3)))
    next.push({ cluster, x: pos.x, y: pos.y, size })
  }
  // 余杭良渚光伏储能电站：3D 地球上的独立站点标记（下钻跳转专题页）
  if (!store.highlightType) {
    const lzPos = api.projectGeoToScreen(LIANGZHU_LNG, LIANGZHU_LAT)
    if (lzPos.visible) {
      next.push({ cluster: makeLiangzhuCluster(), x: lzPos.x, y: lzPos.y, size: 24 })
    }
  }
  clusterPositions.value = next
}

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (searchTimer !== undefined) window.clearTimeout(searchTimer)
  if (closeTimer !== undefined) window.clearTimeout(closeTimer)
})

updateClusterProjection()
</script>

<style scoped>
.earth-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--cockpit-border);
  border-radius: 6px;
  background: var(--cockpit-bg);
  cursor: default;
}

.earth-notice {
  position: absolute;
  top: 46px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  font-size: 12px;
  color: #FFD9A8;
  background: rgba(70, 44, 8, 0.92);
  border: 1px solid rgba(231, 179, 79, 0.6);
  border-radius: 4px;
  padding: 6px 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}
.cluster-layer { position: absolute; inset: 0; pointer-events: none; z-index: 12; }
.cluster-dot {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1.5px solid rgba(232, 238, 243, 0.5);
  background: rgba(53, 214, 196, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  transition: background 0.15s;
}
.cluster-dot:hover { background: rgba(53, 214, 196, 0.4); }
.cluster-num { font-size: 12.5px; font-weight: 600; color: var(--cockpit-text-1); }

.cluster-dot.sev-critical { background: rgba(240, 100, 91, 0.3); border-color: rgba(240, 100, 91, 0.7); }
.cluster-dot.sev-high { background: rgba(231, 179, 79, 0.28); border-color: rgba(231, 179, 79, 0.7); }
.cluster-dot.mode-power { background: rgba(104, 162, 216, 0.28); border-color: rgba(104, 162, 216, 0.7); }
.cluster-dot.is-liangzhu {
  background: rgba(240, 180, 70, 0.35);
  border-color: rgba(255, 214, 120, 0.95);
  box-shadow: 0 0 16px rgba(255, 196, 90, 0.6);
  animation: liangzhu-pulse 1.6s ease-in-out infinite;
}
@keyframes liangzhu-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(255, 196, 90, 0.45); }
  50% { box-shadow: 0 0 22px rgba(255, 196, 90, 0.85); }
}

.earth-controls {
  position: absolute;
  z-index: 20;
  pointer-events: auto;
}

.breadcrumb {
  top: 12px;
  left: 14px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(13, 18, 24, 0.9);
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  padding: 5px 10px;
  font-size: 13px;
}
.crumb-item { color: var(--cockpit-text-2); }
.crumb-item.current { color: var(--cockpit-text-1); font-weight: 600; }
.crumb-sep { color: var(--cockpit-text-3); }

.search-box {
  top: 12px;
  right: 14px;
  width: 240px;
}
.search-input {
  width: 100%;
  background: rgba(13, 18, 24, 0.92);
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  color: var(--cockpit-text-1);
  font-size: 13.5px;
  padding: 6px 10px;
  outline: none;
}
.search-input:focus { border-color: rgba(53, 214, 196, 0.5); }
.search-results {
  margin-top: 4px;
  background: var(--cockpit-bg-panel);
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  max-height: 240px;
  overflow-y: auto;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.sr-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(32, 40, 51, 0.6);
  padding: 7px 10px;
  cursor: pointer;
}
.sr-item:hover { background: rgba(53, 214, 196, 0.08); }
.sr-name { font-size: 13.5px; color: var(--cockpit-text-1); }
.sr-meta { font-size: 12px; color: var(--cockpit-text-3); }
.sr-loading, .sr-empty { padding: 8px 10px; font-size: 13px; color: var(--cockpit-text-3); }

.view-tabs { bottom: 14px; left: 50%; transform: translateX(-50%); }
.render-switch {
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  background: rgba(13, 18, 24, 0.92);
  border: 1px solid var(--cockpit-border);
  border-radius: 6px;
  padding: 3px;
}
.render-switch button {
  border: none;
  background: transparent;
  color: var(--cockpit-text-2);
  font-size: 12.5px;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.render-switch button:hover { color: var(--cockpit-text-1); }
.render-switch button.active { background: rgba(53, 214, 196, 0.14); color: var(--cockpit-power); font-weight: 500; }

.legend-box {
  right: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(13, 18, 24, 0.9);
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  padding: 7px 10px;
  font-size: 12px;
  color: var(--cockpit-text-2);
}
.legend-items { display: flex; gap: 10px; flex-wrap: wrap; }
.lg-item { display: inline-flex; align-items: center; gap: 4px; }
.lg-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.lg-bar { width: 14px; height: 4px; border-radius: 2px; display: inline-block; }
.lg-low { background: rgba(104, 162, 216, 0.35); }
.lg-mid { background: rgba(104, 162, 216, 0.7); }
.lg-high { background: #68A2D8; }
.lg-breathe { animation: lg-breathe 1.6s ease-out 3; }
.legend-meta { display: flex; justify-content: space-between; gap: 12px; }

.earth-resources {
  position: absolute;
  left: 12px;
  top: 96px;
  bottom: 92px;
  width: 176px;
  z-index: 18;
  display: flex;
  flex-direction: column;
  background: rgba(13, 18, 24, 0.86);
  border: 1px solid var(--cockpit-border);
  border-radius: 8px;
  overflow: hidden;
  pointer-events: auto;
}
.earth-resources.collapsed { width: 42px; }
.er-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--cockpit-border);
  flex-shrink: 0;
}
.earth-resources.collapsed .er-head { border-bottom: none; padding: 8px; justify-content: center; }
.er-title { font-size: 13.5px; font-weight: 600; color: var(--cockpit-text-1); flex: 1; white-space: nowrap; }
.er-count { font-size: 12px; color: var(--cockpit-power); }
.er-toggle {
  background: transparent;
  border: none;
  color: var(--cockpit-text-3);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 2px;
}
.er-toggle:hover { color: var(--cockpit-text-1); }
.er-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.er-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 8px 10px;
  cursor: pointer;
}
.er-item:hover { background: rgba(53, 214, 196, 0.08); border-color: rgba(53, 214, 196, 0.35); }
.er-name { display: flex; align-items: center; gap: 5px; max-width: 100%; }
.er-name-text { font-size: 13px; color: var(--cockpit-text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.er-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.er-dot.st-normal { background: #35D6C4; }
.er-dot.st-warning { background: #E7B34F; }
.er-dot.st-alarm { background: #F0645B; }
.er-dot.st-offline, .er-dot.st-maintenance { background: #5C6A7D; }
.er-meta { font-size: 11.5px; color: var(--cockpit-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.er-coord { font-family: Consolas, monospace; font-size: 10.5px; color: #6F8799; white-space: nowrap; }
.er-empty { font-size: 12px; color: var(--cockpit-text-3); padding: 8px; }
.patrol-badge {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(13, 18, 24, 0.9);
  border: 1px solid rgba(53, 214, 196, 0.4);
  color: var(--cockpit-power);
  font-size: 12.5px;
  padding: 4px 12px;
  border-radius: 5px;
  z-index: 25;
}

@keyframes lg-breathe {
  0% { box-shadow: 0 0 0 0 rgba(240, 100, 91, 0.6); }
  100% { box-shadow: 0 0 0 8px rgba(240, 100, 91, 0); }
}
</style>

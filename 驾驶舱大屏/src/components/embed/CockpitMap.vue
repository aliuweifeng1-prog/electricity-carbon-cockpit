<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  驾驶舱地图容器（v2 改造，§9.3）：
  - 初始显示地球（3D球体），地球视觉/交互与基线一致
  - 设备标记改为 store 数据注入，删除硬编码数组
  - 跨主平台消息统一走 useHostBridge 严格 origin 协议；定位指令由内部搜索触发
-->
<template>
  <div ref="container" class="cockpit-map">
    <EarthChinaMap
      ref="mapRef"
      :devices="visibleDevices"
      :hide-drill-control="true"
      @device-click="(d: any) => onDeviceClick(d)"
      @scope-change="onScopeChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import EarthChinaMap from '../map/EarthChinaMap.vue';
import { useCockpitStore } from '../../stores/cockpit';
import { fetchResourceDetail } from '../../api/cockpit';
import type { MapDevice, ResourceMarker } from '../../types/cockpit';
import { isLiangzhuStation, jumpToLiangzhuCockpit } from '../../utils/liangzhu';

const container = ref<HTMLElement>();
const mapRef = ref<InstanceType<typeof EarthChinaMap> | null>(null);
const store = useCockpitStore();

function mapStatus(marker: ResourceMarker): string {
  switch (marker.operation_status) {
    case 'normal': return 'online';
    case 'alarm': return 'alert';
    case 'warning': return 'warning';
    case 'offline':
    case 'maintenance': return 'offline';
    default: return 'online';
  }
}

/** 资源点 → 地图设备标记（点颜色=状态，点大小=可调能力由地图组件处理） */
const mapDevices = computed<MapDevice[]>(() =>
  store.markers.map((m) => ({
    id: m.resource_id,
    name: m.name,
    lng: m.longitude,
    lat: m.latitude,
    type: m.resource_type,
    status: mapStatus(m),
    load: m.rated_power_mw ? Math.round(((m.current_power_mw ?? 0) / m.rated_power_mw) * 100) / 100 : undefined,
    power: m.current_power_mw ?? undefined,
    soc: m.soc_pct !== null ? m.soc_pct / 100 : null,
    region: m.region_name,
  })),
);

/** 类型高亮 + 视图模式过滤（§3.5.1 / §3.6.2） */
const visibleDevices = computed<MapDevice[]>(() => {
  return mapDevices.value;
});

// ===== 滚轮交互（保持基线，CockpitMap 全权接管滚轮） =====
let lastTransitionTime = 0;
const TRANSITION_COOLDOWN = 700; // ms 层级切换冷却

function handleWheel(event: WheelEvent) {
  const inst = mapRef.value as {
    isEarthMode: () => boolean;
    enterChina: () => void;
    returnToEarth: () => void;
    drillBack: () => void;
    canGoBack: () => boolean;
    getScope: () => string;
    getZoomState: () => { distance: number; min: number; max: number; atMin: boolean; atMax: boolean };
    zoomBy: (deltaY: number) => void;
  } | null;
  if (!inst) return;

  const now = Date.now();

  if (inst.isEarthMode()) {
    if (event.deltaY < 0) {
      event.preventDefault();
      event.stopPropagation();
      if (now - lastTransitionTime > TRANSITION_COOLDOWN) {
        lastTransitionTime = now;
        inst.enterChina();
      }
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (event.deltaY < 0) {
    inst.zoomBy(event.deltaY);
    return;
  }

  const zoom = inst.getZoomState();
  if (zoom.atMax) {
    if (now - lastTransitionTime > TRANSITION_COOLDOWN) {
      lastTransitionTime = now;
      if (inst.canGoBack()) inst.drillBack();
      else inst.returnToEarth();
    }
  } else {
    inst.zoomBy(event.deltaY);
  }
}

async function onDeviceClick(device: MapDevice) {
  // 余杭良渚光伏储能电站：点击即下钻跳转专题页
  if (isLiangzhuStation(device.id)) {
    jumpToLiangzhuCockpit();
    return;
  }
  const marker = store.markers.find((m) => m.resource_id === device.id);
  if (!marker) return;
  try {
    const detail = await fetchResourceDetail(marker.resource_id);
    store.selectResource(detail, marker);
  } catch {
    // 详情接口失败时仍打开抽屉的基本信息
    store.selectResource({
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
    }, marker);
  }
}

function onScopeChange(scope: string) {
  store.setMapScope(scope);
}

/** 资源定位（搜索/深链使用）：飞行到目标 → 展示标记 → 进入中国地图 → 下钻到省份 */
function locateTo(lng: number, lat: number, name: string, region?: string) {
  const inst = mapRef.value as {
    flyToLocation?: (lon: number, lat: number, label?: string) => void;
    isEarthMode?: () => boolean;
    returnToEarth?: () => void;
    enterChina?: () => void;
    drillToProvince?: (name: string) => void;
  } | null;
  if (!inst) return;

  const provinceName = region ?? '';

  const startFlyAndDrill = () => {
    const flyInst = mapRef.value as {
      flyToLocation?: (lon: number, lat: number, label?: string) => void;
      enterChina?: () => void;
      drillToProvince?: (name: string) => void;
      isEarthMode?: () => boolean;
    } | null;
    if (!flyInst?.flyToLocation) return;
    flyInst.flyToLocation(lng, lat, name);

    const FLY_HOLD_MS = 1800;
    globalThis.setTimeout(() => {
      const enterInst = mapRef.value as {
        enterChina?: () => void;
        drillToProvince?: (name: string) => void;
        isEarthMode?: () => boolean;
      } | null;
      if (!enterInst?.enterChina || !enterInst.isEarthMode?.()) return;
      enterInst.enterChina();
      if (provinceName) {
        const CHINA_LOAD_MS = 1200;
        globalThis.setTimeout(() => {
          const drillInst = mapRef.value as {
            drillToProvince?: (name: string) => void;
            isEarthMode?: () => boolean;
          } | null;
          if (!drillInst?.drillToProvince || drillInst.isEarthMode?.()) return;
          drillInst.drillToProvince(provinceName);
        }, CHINA_LOAD_MS);
      }
    }, FLY_HOLD_MS);
  };

  if (inst.isEarthMode && !inst.isEarthMode()) {
    inst.returnToEarth?.();
    const retryFly = (attempt: number) => {
      if (attempt > 10) return;
      const earthInst = mapRef.value as {
        flyToLocation?: (lon: number, lat: number, label?: string) => void;
        isEarthMode?: () => boolean;
      } | null;
      if (!earthInst || !earthInst.isEarthMode || !earthInst.isEarthMode()) {
        globalThis.setTimeout(() => retryFly(attempt + 1), 500);
        return;
      }
      startFlyAndDrill();
    };
    globalThis.setTimeout(() => retryFly(0), 1000);
    return;
  }

  startFlyAndDrill();
}

onMounted(() => {
  container.value?.addEventListener('wheel', handleWheel, { capture: true, passive: false });
});

onBeforeUnmount(() => {
  container.value?.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions);
});

defineExpose({
  locateTo,
  /** v2 数据层：地球模式屏幕坐标投影透传（只读） */
  projectGeoToScreen: (lon: number, lat: number) => {
    const inst = mapRef.value as {
      projectGeoToScreen?: (lon: number, lat: number) => { x: number; y: number; visible: boolean };
    } | null;
    return inst?.projectGeoToScreen?.(lon, lat) ?? { x: 0, y: 0, visible: false };
  },
  /** v2 数据层：是否处于地球模式 */
  isEarthMode: () => {
    const inst = mapRef.value as { isEarthMode?: () => boolean } | null;
    return inst?.isEarthMode?.() ?? true;
  },
});
</script>

<style scoped>
.cockpit-map {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #0A0D12 0%, #050709 100%);
}
</style>






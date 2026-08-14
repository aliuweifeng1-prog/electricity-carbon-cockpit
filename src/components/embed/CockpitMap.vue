<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  驾驶舱地图容器：
  - 初始显示地球（3D球体）
  - 地球：滚轮向上 → 进入中国
  - 地图内滚轮 = 缩放（放大看城市细节 / 缩小看整体）；缩到最远后再向下滚 → 逐级返回（区县→省→中国→地球）
  - 点击省份/城市 → 下钻；左键拖拽 = 平移查看城市；右键拖拽 = 旋转
  - 设备标记通过 postMessage 通知父级
-->
<template>
  <div ref="container" class="cockpit-map">
    <EarthChinaMap
      ref="mapRef"
      :devices="devices"
      :hide-drill-control="true"
      @device-click="(d: any) => onDeviceClick(d)"
      @scope-change="onScopeChange"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import EarthChinaMap from '../map/EarthChinaMap.vue';
import type { Device } from './types';

const container = ref<HTMLElement>();
const mapRef = ref<InstanceType<typeof EarthChinaMap> | null>(null);

const devices: Device[] = [
  { id: 'ESS-HZ-01', name: '萧山储能电站', lng: 120.27, lat: 30.16, type: 'energy-storage', status: 'online', load: 0.86, power: 4.2, soc: 0.72, revenue: 12400, region: '浙江省' },
  { id: 'PV-WZ-02', name: '温州光伏 A 区', lng: 120.65, lat: 27.99, type: 'photovoltaic', status: 'online', load: 0.58, power: 2.8, soc: null, revenue: 9200, region: '浙江省' },
  { id: 'CP-SH-03', name: '上海数据中心 AIDC', lng: 121.47, lat: 31.23, type: 'data-center', status: 'warning', load: 0.88, power: 6.8, soc: null, revenue: 15600, region: '上海市' },
  { id: 'ESS-NB-04', name: '宁波储能集群', lng: 121.55, lat: 29.86, type: 'energy-storage', status: 'online', load: 0.76, power: 3.6, soc: 0.85, revenue: 8900, region: '浙江省' },
  { id: 'CP-JN-05', name: '济南充电站', lng: 117.00, lat: 36.65, type: 'charging', status: 'online', load: 0.42, power: 1.4, soc: null, revenue: 4120, region: '山东省' },
  { id: 'ESS-CD-06', name: '成都储能电站', lng: 104.07, lat: 30.67, type: 'energy-storage', status: 'online', load: 0.68, power: 3.0, soc: 0.60, revenue: 7500, region: '四川省' },
  { id: 'CP-GZ-07', name: '广州光储充一体', lng: 113.26, lat: 23.13, type: 'charging', status: 'online', load: 0.55, power: 2.2, soc: null, revenue: 6800, region: '广东省' },
  { id: 'PV-XA-08', name: '西安光伏电站', lng: 108.94, lat: 34.34, type: 'photovoltaic', status: 'online', load: 0.63, power: 3.2, soc: null, revenue: 5800, region: '陕西省' },
  { id: 'ESS-WH-09', name: '武汉储能电站', lng: 114.30, lat: 30.59, type: 'energy-storage', status: 'alert', load: 0.94, power: 4.8, soc: 0.18, revenue: 11200, region: '湖北省' },
  { id: 'CP-CQ-10', name: '重庆充电枢纽', lng: 106.55, lat: 29.56, type: 'charging', status: 'online', load: 0.48, power: 1.8, soc: null, revenue: 5200, region: '重庆市' },
  { id: 'PV-BJ-11', name: '北京光伏集群', lng: 116.40, lat: 39.90, type: 'photovoltaic', status: 'online', load: 0.71, power: 3.5, soc: null, revenue: 9800, region: '北京市' },
  { id: 'ESS-TJ-12', name: '天津储能电站', lng: 117.20, lat: 39.13, type: 'energy-storage', status: 'online', load: 0.82, power: 4.0, soc: 0.78, revenue: 10200, region: '天津市' },
];

// ===== 滚轮交互 =====
// CockpitMap 全权接管滚轮：不再交给 OrbitControls 处理缩放。
// - 地球模式：滚轮向上 → 进入中国地图；向下 → 交给地球自身缩放
// - 地图模式：
//   - 向上：手动 zoomBy 放大（查看城市细节）
//   - 向下：手动 zoomBy 缩小；若已缩到最远(atMax)则返回上一级（省→中国→地球）
// 手动 zoomBy 即时修改相机距离，getZoomState 反映的是真实最新值，不受 damping 延迟影响。
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
    // 地球模式：滚轮向上进入中国；向下不拦截，交给地球自身缩放
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

  // 地图模式：拦截所有滚轮事件，手动管理缩放
  event.preventDefault();
  event.stopPropagation();

  if (event.deltaY < 0) {
    // 向上滚 = 放大（查看城市细节）
    inst.zoomBy(event.deltaY);
    return;
  }

  // 向下滚 = 缩小
  const zoom = inst.getZoomState();
  if (zoom.atMax) {
    // 已缩到最远，继续向下滚 → 返回上一级
    if (now - lastTransitionTime > TRANSITION_COOLDOWN) {
      lastTransitionTime = now;
      if (inst.canGoBack()) inst.drillBack();
      else inst.returnToEarth();
    }
  } else {
    // 尚未到最远，继续缩小
    inst.zoomBy(event.deltaY);
  }
}

onMounted(() => {
  container.value?.addEventListener('wheel', handleWheel, { capture: true, passive: false });
});

onBeforeUnmount(() => {
  container.value?.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions);
});

function onDeviceClick(device: Device) {
  try {
    window.parent?.postMessage({ type: 'cockpit:device-click', device }, '*');
  } catch {
    /* ignore */
  }
}

function onScopeChange(scope: string) {
  try {
    window.parent?.postMessage({ type: 'cockpit:scope-change', scope }, '*');
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.cockpit-map {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at center, #0A0D12 0%, #050709 100%);
}
</style>

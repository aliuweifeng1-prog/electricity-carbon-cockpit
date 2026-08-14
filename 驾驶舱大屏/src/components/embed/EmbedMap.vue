<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Embed mode（旧版嵌入路径，仅供原型参考）：
  - 设备标记由 ZhejiangThreeMap 通过 Three.js 相机投影渲染（§9.3-6），不再使用经纬度线性近似覆盖层。
-->
<template>
  <div class="embed-map">
    <ChinaMap :active="true" :devices="devices" @ready="onReady" @device-click="onDeviceClick" />
    <DeviceDetailPanel
      v-if="selectedDevice"
      :device="selectedDevice"
      @close="selectedDevice = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ChinaMap from '../map/ChinaMap.vue';
import DeviceDetailPanel from './DeviceDetailPanel.vue';
import type { Device } from './types';

const ready = ref(false);
const selectedDevice = ref<Device | null>(null);

const onReady = () => {
  ready.value = true;
};

const onDeviceClick = (device: unknown) => {
  selectedDevice.value = device as Device;
};

/**
 * 默认设备示例数据（与旧版保持一致，仅作原型参考；生产使用 CockpitShell + Cockpit API）。
 */
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
</script>

<style scoped>
.embed-map {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, #0A0D12 0%, #050709 100%);
  overflow: hidden;
}
</style>


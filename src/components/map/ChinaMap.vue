<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <ZhejiangThreeMap
    ref="mapRef"
    :active="props.active"
    :devices="props.devices"
    :hide-drill-control="props.hideDrillControl"
    @ready="emit('ready')"
    @device-click="(d) => emit('device-click', d)"
    @scope-change="(s) => emit('scope-change', s)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ZhejiangThreeMap from './ZhejiangThreeMap.vue';

type DeviceMarkerData = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  type?: string;
  status?: string;
  load?: number;
  power?: number;
  soc?: number | null;
  revenue?: number;
  region?: string;
};

const props = withDefaults(defineProps<{
  active?: boolean;
  devices?: DeviceMarkerData[];
  hideDrillControl?: boolean;
}>(), {
  active: true,
  devices: () => [],
  hideDrillControl: false,
});

const emit = defineEmits<{
  ready: [];
  'device-click': [device: DeviceMarkerData];
  'scope-change': [scope: string];
}>();

const mapRef = ref<InstanceType<typeof ZhejiangThreeMap> | null>(null);

// 透传内部 ZhejiangThreeMap 的下钻/返回/层级查询接口，
// 供 EarthChinaMap 的滚轮逐级返回逻辑正确逐层回退（而非直接跳回地球）。
defineExpose({
  drillBack: () => void mapRef.value?.drillBack?.(),
  canGoBack: () => mapRef.value?.canGoBack?.() ?? false,
  getScope: () => mapRef.value?.getScope?.() ?? 'country',
  getHoveredFeature: () => mapRef.value?.getHoveredFeature?.() ?? '',
  drillTo: (name: string) => void mapRef.value?.drillTo?.(name),
  getZoomState: () =>
    mapRef.value?.getZoomState?.() ?? { distance: 0, min: 0, max: 0, atMin: false, atMax: false },
  zoomBy: (deltaY: number) => void mapRef.value?.zoomBy?.(deltaY),
});
</script>

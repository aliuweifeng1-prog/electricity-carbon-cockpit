<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  Copyright (c) 2026 宋夏天Dazzle
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  Source: https://github.com/songsummer920-dazzle/three-scope-map-skill
-->

<template>
  <div class="earth-china-map">
    <div
      v-if="chinaMounted"
      class="china-map-stage"
      :class="{
        'is-active': mode === 'china',
        'is-handoff': handoffActive,
        'is-ready': chinaReady,
      }"
    >
      <ChinaMap
        ref="chinaMapRef"
        key="china"
        :active="mode === 'china'"
        :devices="props.devices"
        :hide-drill-control="props.hideDrillControl"
        @ready="onChinaReady"
        @device-click="(d) => emit('device-click', d)"
        @scope-change="(s) => emit('scope-change', s)"
      />
    </div>
    <EarthView
      v-if="mode === 'earth'"
      key="earth"
      :start-intro="chinaReady"
      @scene-ready="prepareChinaMap"
      @handoff-start="beginChinaHandoff"
      @enter-china="showChinaMap"
    />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import EarthView from './EarthView.vue';

const ChinaMap = defineAsyncComponent(() => import('./ChinaMap.vue'));

export type EarthChinaMapMode = 'earth' | 'china';

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
  devices?: DeviceMarkerData[];
  hideDrillControl?: boolean;
}>(), {
  devices: () => [],
  hideDrillControl: false,
});

const emit = defineEmits<{
  'mode-change': [mode: EarthChinaMapMode];
  'device-click': [device: DeviceMarkerData];
  'scope-change': [scope: string];
}>();

const mode = ref<EarthChinaMapMode>('earth');
const chinaMounted = ref(false);
const chinaReady = ref(false);
const handoffActive = ref(false);
const chinaMapRef = ref<InstanceType<typeof ChinaMap> | null>(null);
let pendingChinaEntry = false;
let pendingHandoff = false;
let handoffCleanupHandle: number | undefined;

function showChinaMap() {
  chinaMounted.value = true;
  if (!chinaReady.value) {
    pendingChinaEntry = true;
    return;
  }
  mode.value = 'china';
  emit('mode-change', mode.value);
  handoffCleanupHandle = globalThis.setTimeout(() => {
    handoffActive.value = false;
  }, 920);
}

function beginChinaHandoff() {
  chinaMounted.value = true;
  if (!chinaReady.value) {
    pendingHandoff = true;
    return;
  }
  handoffActive.value = true;
}

function onChinaReady() {
  chinaReady.value = true;
  if (pendingHandoff) {
    pendingHandoff = false;
    beginChinaHandoff();
  }
  if (!pendingChinaEntry) return;
  pendingChinaEntry = false;
  showChinaMap();
}

function prepareChinaMap() {
  if (chinaMounted.value) return;
  chinaMounted.value = true;
}

/** 编程式返回地球 */
function returnToEarth() {
  if (mode.value !== 'china') return;
  // 卸载中国地图组件，清空其下钻栈与当前层级状态，
  // 确保下次进入中国时从「国家级」重新开始，而非停留在上次下钻的省/市/区县。
  chinaMounted.value = false;
  mode.value = 'earth';
  emit('mode-change', mode.value);
}

onBeforeUnmount(() => {
  if (handoffCleanupHandle !== undefined) globalThis.clearTimeout(handoffCleanupHandle);
});

defineExpose({
  /** 当前模式：earth 或 china */
  getMode: () => mode.value,
  /** 编程式触发地球 → 中国地图过渡 */
  enterChina: () => {
    if (mode.value !== 'earth') return;
    beginChinaHandoff();
    showChinaMap();
  },
  /** 编程式返回地球 */
  returnToEarth: () => returnToEarth(),
  /** 返回上级地图（省 → 中国，或 中国 → 地球） */
  drillBack: () => {
    const inst = chinaMapRef.value as { drillBack?: () => void; canGoBack?: () => boolean } | null;
    if (inst?.canGoBack?.()) {
      inst.drillBack?.();
    } else {
      // 已在中国层级且无下钻栈 → 返回地球
      returnToEarth();
    }
  },
  /** 当前地图层级 */
  getScope: () => {
    const inst = chinaMapRef.value as { getScope?: () => string } | null;
    return inst?.getScope?.() ?? 'country';
  },
  /** 当前悬停的地图要素名（中国层级用于滚轮钻取） */
  getHoveredFeature: () => {
    const inst = chinaMapRef.value as { getHoveredFeature?: () => string } | null;
    return inst?.getHoveredFeature?.() ?? '';
  },
  /** 下钻到指定省份/城市/区县 */
  drillToProvince: (name: string) => {
    const inst = chinaMapRef.value as { drillTo?: (n: string) => void } | null;
    inst?.drillTo?.(name);
  },
  /** 是否在地球模式 */
  isEarthMode: () => mode.value === 'earth',
  /** 是否在中国/省级模式 */
  isMapMode: () => mode.value === 'china',
  /** 是否存在上一级可返回（下钻栈非空） */
  canGoBack: () => {
    const inst = chinaMapRef.value as { canGoBack?: () => boolean } | null;
    return !!inst?.canGoBack?.();
  },
  /** 当前缩放状态（地图模式下有效），供外层滚轮逐级返回判断 */
  getZoomState: () => {
    const inst = chinaMapRef.value as { getZoomState?: () => unknown } | null;
    return inst?.getZoomState?.() ?? { distance: 0, min: 0, max: 0, atMin: false, atMax: false };
  },
  /** 手动缩放（外层 CockpitMap 拦截滚轮后调用） */
  zoomBy: (deltaY: number) => {
    const inst = chinaMapRef.value as { zoomBy?: (deltaY: number) => void } | null;
    inst?.zoomBy?.(deltaY);
  },
});
</script>

<style scoped>
.earth-china-map {
  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
}

.china-map-stage {
  position: absolute;
  inset: 0;
  z-index: 6;
  opacity: 0;
  visibility: hidden;
  transform: translateZ(0) scale(0.78);
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  will-change: transform, opacity;
  contain: layout paint;
  pointer-events: none;
  transition:
    opacity 420ms ease,
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 620ms;
}

.china-map-stage.is-handoff {
  visibility: visible;
  animation: china-cloud-reveal 1.44s cubic-bezier(0.22, 0.72, 0.18, 1) both;
}

.china-map-stage:not(.is-active) :deep(.map-host) {
  filter: none;
}

.china-map-stage:not(.is-active) :deep(.map-label-layer),
.china-map-stage:not(.is-active) :deep(.map-drill-control),
.china-map-stage:not(.is-active) :deep(.south-sea-inset) {
  display: none;
}

.china-map-stage.is-active {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
  pointer-events: auto;
  animation: none;
  transition-delay: 0s;
}

@keyframes china-cloud-reveal {
  0% {
    opacity: 0.06;
    transform: translateZ(0) scale(0.78);
  }
  28% {
    opacity: 0.24;
    transform: translateZ(0) scale(0.83);
  }
  66% {
    opacity: 0.78;
    transform: translateZ(0) scale(0.94);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  设备标记 DOM 覆盖层。
  投影算法：基于中国经纬度范围的线性投影 + 视角透视补偿（近似匹配 Three.js 地图视角）。
  接入真实 lng/lat 数据即可，bounds 和 padding 可按需要微调。
-->
<template>
  <div class="device-markers" aria-hidden="false">
    <button
      v-for="device in positionedDevices"
      :key="device.id"
      type="button"
      class="device-marker"
      :class="[`status-${device.status}`, `type-${device.type}`]"
      :style="{ left: device.x + 'px', top: device.y + 'px' }"
      :title="device.name"
      @click="onClick(device)"
    >
      <span class="marker-dot" />
      <span class="marker-pulse" />
      <span class="marker-ring" />
      <span class="marker-label">{{ device.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Device } from './types';

const props = defineProps<{
  devices: Device[];
}>();

const emit = defineEmits<{
  'device-click': [device: Device];
}>();

const containerSize = ref({ width: 0, height: 0 });

/**
 * 中国大陆经纬度范围（与 GeoJSON 范围近似）。
 * 若使用更精确的 GeoJSON 边界，可通过 props 注入。
 */
const LON_MIN = 73;
const LON_MAX = 135;
const LAT_MIN = 18;
const LAT_MAX = 54;

/** 地图可视区域内边距（px），用于让标记避开边缘。 */
const PADDING_X = 30;
const PADDING_Y = 60;

/**
 * 透视补偿系数：地图从右上方斜视，纬度越高（y 越小）压缩越大。
 * 近似模拟 Three.js 透视相机的纵向畸变。
 */
const PERSPECTIVE_FACTOR = 0.18;

interface PositionedDevice extends Device {
  x: number;
  y: number;
}

const positionedDevices = computed<PositionedDevice[]>(() => {
  const { width, height } = containerSize.value;
  if (!width || !height) return [];

  const mapWidth = Math.max(0, width - PADDING_X * 2);
  const mapHeight = Math.max(0, height - PADDING_Y * 2);

  return props.devices.map((device) => {
    const xRatio = (device.lng - LON_MIN) / (LON_MAX - LON_MIN);
    const yRatio = 1 - (device.lat - LAT_MIN) / (LAT_MAX - LAT_MIN);
    // 上半部分压缩更多（相机俯视）
    const perspective = 1 - PERSPECTIVE_FACTOR * yRatio;

    return {
      ...device,
      x: PADDING_X + xRatio * mapWidth,
      y: PADDING_Y + yRatio * mapHeight * perspective,
    };
  });
});

const onClick = (device: Device) => {
  emit('device-click', device);
};

let resizeObserver: ResizeObserver | undefined;

const measure = () => {
  const el = document.querySelector('.embed-map') as HTMLElement | null;
  if (!el) return;
  containerSize.value = { width: el.clientWidth, height: el.clientHeight };
};

onMounted(() => {
  measure();
  const el = document.querySelector('.embed-map') as HTMLElement | null;
  if (!el) return;
  resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.device-markers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.device-marker {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
  outline: none;
  font: inherit;
  color: inherit;
}

.device-marker:focus-visible .marker-ring {
  border-color: #ffffff;
}

.marker-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--marker-color, #35D6C4);
  box-shadow: 0 0 10px var(--marker-color, #35D6C4), 0 0 2px rgba(0, 0, 0, 0.6);
  transform: translate(-50%, -50%);
  z-index: 3;
}

.marker-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--marker-color, #35D6C4);
  transform: translate(-50%, -50%);
  animation: marker-pulse 2.2s ease-out infinite;
  z-index: 2;
}

.marker-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  transform: translate(-50%, -50%);
  transition: border-color 0.15s, transform 0.15s;
  z-index: 1;
}

.device-marker:hover .marker-ring {
  transform: translate(-50%, -50%) scale(1.6);
  border-color: var(--marker-color, #35D6C4);
}

.marker-label {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  color: #EAF0F5;
  background: rgba(10, 13, 18, 0.88);
  border: 1px solid var(--marker-color, #35D6C4);
  border-radius: 4px;
  padding: 3px 7px;
  font-family: 'Noto Sans SC', sans-serif;
  letter-spacing: 0.2px;
  opacity: 0;
  transition: opacity 0.18s;
  pointer-events: none;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}

.device-marker:hover .marker-label,
.device-marker:focus-visible .marker-label {
  opacity: 1;
}

.status-online { --marker-color: #35D6C4; }
.status-warning { --marker-color: #F0B94A; }
.status-alert { --marker-color: #FF6B5E; }
.status-offline { --marker-color: #5C6A7D; }

@keyframes marker-pulse {
  0% {
    width: 8px;
    height: 8px;
    opacity: 0.9;
  }
  100% {
    width: 32px;
    height: 32px;
    opacity: 0;
  }
}
</style>

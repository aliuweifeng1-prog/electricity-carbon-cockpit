<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
  设备详情面板：在地图覆盖层上展示被点击设备的负荷、电量等数据。
-->
<template>
  <div class="device-detail" role="dialog" aria-label="设备详情">
    <header class="dd-head">
      <div class="dd-title">
        <span class="dd-dot" :class="`status-${device.status}`" />
        <span>{{ device.name }}</span>
        <span class="dd-id">{{ device.id }}</span>
      </div>
      <button class="dd-close" type="button" @click="emit('close')" aria-label="关闭">×</button>
    </header>

    <div class="dd-meta">
      <span class="dd-tag">{{ typeLabel }}</span>
      <span class="dd-region">{{ device.region }}</span>
      <span class="dd-status" :class="`status-${device.status}`">{{ statusLabel }}</span>
    </div>

    <div class="dd-grid">
      <div class="dd-cell">
        <div class="dd-label">负荷率</div>
        <div class="dd-value num">
          {{ (device.load * 100).toFixed(0) }}<span class="dd-unit">%</span>
        </div>
        <div class="dd-bar"><span :style="barStyle(device.load, '#35D6C4')" /></div>
      </div>

      <div class="dd-cell">
        <div class="dd-label">当前功率</div>
        <div class="dd-value num">
          {{ device.power.toFixed(1) }}<span class="dd-unit">MW</span>
        </div>
        <div class="dd-bar"><span :style="barStyle(Math.min(device.power / 8, 1), '#8FD16A')" /></div>
      </div>

      <div class="dd-cell" v-if="device.soc !== null">
        <div class="dd-label">储能 SOC</div>
        <div class="dd-value num">
          {{ (device.soc * 100).toFixed(0) }}<span class="dd-unit">%</span>
        </div>
        <div class="dd-bar"><span :style="barStyle(device.soc, '#F0B94A')" /></div>
      </div>

      <div class="dd-cell dd-revenue">
        <div class="dd-label">今日贡献</div>
        <div class="dd-value num">¥{{ device.revenue.toLocaleString('zh-CN') }}</div>
      </div>
    </div>

    <div class="dd-foot">
      <button class="dd-btn" type="button">查看实时曲线</button>
      <button class="dd-btn dd-btn-primary" type="button">下发调度</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Device, DeviceStatus, DeviceType } from './types';

const props = defineProps<{
  device: Device;
}>();

const emit = defineEmits<{
  close: [];
}>();

const TYPE_LABEL: Record<DeviceType, string> = {
  'energy-storage': '储能',
  'photovoltaic': '光伏',
  'charging': '充电',
  'data-center': '数据中心',
  'wind': '风电',
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  online: '在线',
  warning: '关注',
  alert: '告警',
  offline: '离线',
};

const typeLabel = computed(() => TYPE_LABEL[props.device.type] ?? props.device.type);
const statusLabel = computed(() => STATUS_LABEL[props.device.status] ?? props.device.status);

const barStyle = (ratio: number, color: string) => ({
  width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
  background: color,
});
</script>

<style scoped>
.device-detail {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
  background: rgba(10, 13, 18, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px 12px;
  color: var(--text-1);
  font-family: 'Noto Sans SC', sans-serif;
  z-index: 20;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.device-detail {
  --text-1: #EAF0F5;
  --text-2: #92A0B3;
  --text-3: #5C6A7D;
  --border: #202836;
}

.dd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.dd-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.dd-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.dd-id {
  font-size: 12px;
  color: var(--text-3);
  font-family: 'Roboto Mono', monospace;
  font-weight: 400;
}

.dd-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.dd-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-1);
}

.dd-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-2);
}

.dd-tag {
  background: rgba(53, 214, 196, 0.14);
  color: #35D6C4;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.dd-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  margin-left: auto;
}

.dd-status.status-online { background: rgba(143, 209, 106, 0.14); color: #8FD16A; }
.dd-status.status-warning { background: rgba(240, 185, 74, 0.14); color: #F0B94A; }
.dd-status.status-alert { background: rgba(255, 107, 94, 0.14); color: #FF6B5E; }
.dd-status.status-offline { background: rgba(92, 106, 125, 0.14); color: #5C6A7D; }

.dd-dot.status-online { background: #35D6C4; color: #35D6C4; }
.dd-dot.status-warning { background: #F0B94A; color: #F0B94A; }
.dd-dot.status-alert { background: #FF6B5E; color: #FF6B5E; }
.dd-dot.status-offline { background: #5C6A7D; color: #5C6A7D; }

.dd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.dd-cell {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}

.dd-revenue {
  grid-column: 1 / -1;
}

.dd-label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 3px;
}

.dd-value {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.3px;
  line-height: 1.1;
}

.dd-unit {
  font-size: 12.5px;
  color: var(--text-2);
  margin-left: 2px;
  font-weight: 400;
  font-family: 'Noto Sans SC';
}

.dd-bar {
  margin-top: 6px;
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.dd-bar > span {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.dd-foot {
  display: flex;
  gap: 8px;
}

.dd-btn {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid #35D6C4;
  color: #35D6C4;
  background: transparent;
  cursor: pointer;
  font-family: 'Noto Sans SC';
}

.dd-btn:hover {
  background: rgba(53, 214, 196, 0.14);
}

.dd-btn-primary {
  background: linear-gradient(135deg, #35D6C4, #23B8A8);
  color: #04211D;
  border-color: transparent;
  font-weight: 600;
}
</style>

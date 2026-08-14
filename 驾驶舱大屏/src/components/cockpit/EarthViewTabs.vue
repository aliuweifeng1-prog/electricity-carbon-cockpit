<!--
  地球底部中央 · 四段式视图切换（§3.6.3），默认“资源态势”。
  调度轨迹仅在存在生效事件时可展示，不做常驻装饰飞线。
-->
<template>
  <div class="earth-view-tabs" role="tablist" aria-label="地球视图切换">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      :aria-selected="store.viewMode === tab.key"
      class="evt-btn"
      :class="{ active: store.viewMode === tab.key }"
      @click="store.setViewMode(tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useCockpitStore } from '../../stores/cockpit';
import type { MapViewMode } from '../../types/cockpit';

const store = useCockpitStore();

const tabs: Array<{ key: MapViewMode; label: string }> = [
  { key: 'resource', label: '资源态势' },
  { key: 'power', label: '功率热力' },
  { key: 'dispatch', label: '调度轨迹' },
  { key: 'alert', label: '告警' },
];
</script>

<style scoped>
.earth-view-tabs {
  display: flex;
  gap: 2px;
  background: rgba(13, 18, 24, 0.92);
  border: 1px solid var(--cockpit-border);
  border-radius: 6px;
  padding: 3px;
}

.evt-btn {
  border: none;
  background: transparent;
  color: var(--cockpit-text-2);
  font-size: 13.5px;
  padding: 5px 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.evt-btn:hover { color: var(--cockpit-text-1); }
.evt-btn.active { background: rgba(53, 214, 196, 0.14); color: var(--cockpit-power); font-weight: 500; }
</style>

<!--
  底部状态栏（§3.8）：最后刷新时间、数据源健康、数据质量、生效事件数、版本。
  不做长文本跑马灯；高风险告警以一次性提示处理。
-->
<template>
  <footer class="cockpit-status-bar">
    <span>最后刷新 <b class="num-font">{{ formatClock(store.lastRefreshAt) }}</b></span>
    <span v-if="store.sourceHealth">
      数据源 <b class="num-font">{{ store.sourceHealth.healthy }}/{{ store.sourceHealth.total }}</b>
      <span v-if="store.sourceHealth.delayed" class="warn">延迟 {{ store.sourceHealth.delayed }}</span>
      <span v-if="store.sourceHealth.unavailable" class="alert">不可用 {{ store.sourceHealth.unavailable }}</span>
    </span>
    <span>
      数据质量 <b :style="{ color: qualityColor(store.overallQuality) }">{{ qualityLabel(store.overallQuality) }}</b>
    </span>
    <span>当前生效事件 <b class="num-font">{{ store.bootstrap?.dispatch_summary?.active_event_count ?? 0 }}</b></span>
    <span class="version">驾驶舱 v{{ COCKPIT_APP_VERSION }} · 数据合同 v{{ COCKPIT_CONTRACT_VERSION }}</span>
  </footer>
</template>

<script setup lang="ts">
import { useCockpitStore } from '../../stores/cockpit';
import { formatClock, qualityColor, qualityLabel } from '../../utils/format';
import { COCKPIT_APP_VERSION, COCKPIT_CONTRACT_VERSION } from '../../api/cockpit';

const store = useCockpitStore();
</script>

<style scoped>
.cockpit-status-bar {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 0 24px;
  border-top: 1px solid var(--cockpit-border);
  font-size: 11.5px;
  color: var(--cockpit-text-2);
  white-space: nowrap;
  overflow: hidden;
}

.cockpit-status-bar b { color: var(--cockpit-text-1); font-weight: 500; }
.cockpit-status-bar .warn { color: var(--cockpit-warn); }
.cockpit-status-bar .alert { color: var(--cockpit-alert); }
.version { margin-left: auto; color: var(--cockpit-text-3); }
</style>

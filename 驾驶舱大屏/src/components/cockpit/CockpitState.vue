<!--
  统一数据状态组件（§9.3-9）。
  loading / empty / partial / stale / error / demo 六种状态，与数据可信展示规则一致。
-->
<template>
  <div class="cockpit-state" :class="`state-${status}`">
    <span v-if="status === 'loading'" class="state-spinner" aria-hidden="true" />
    <span class="state-icon" aria-hidden="true">{{ icon }}</span>
    <span class="state-text">
      <template v-if="status === 'loading'">加载中…</template>
      <template v-else-if="status === 'empty'">{{ message || '暂无数据' }}</template>
      <template v-else-if="status === 'error'">{{ message || '数据服务不可用' }}</template>
      <template v-else-if="status === 'stale'">数据已延迟{{ message ? `：${message}` : '' }}</template>
      <template v-else-if="status === 'partial'">{{ message || '部分数据可用' }}</template>
      <template v-else-if="status === 'demo'">演示数据（{{ message || '未接入真实数据源' }}）</template>
    </span>
    <slot name="extra" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type CockpitStateStatus = 'loading' | 'empty' | 'partial' | 'stale' | 'error' | 'demo';

const props = withDefaults(defineProps<{
  status: CockpitStateStatus;
  message?: string | null;
}>(), {
  message: null,
});

const icon = computed(() => {
  switch (props.status) {
    case 'loading': return '';
    case 'error': return '!';
    case 'stale': return '≈';
    case 'partial': return '±';
    case 'demo': return 'D';
    default: return '∅';
  }
});
</script>

<style scoped>
.cockpit-state {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 13.5px;
  color: var(--cockpit-text-2);
  border: 1px dashed var(--cockpit-border);
  border-radius: 6px;
  background: rgba(13, 18, 24, 0.6);
  min-height: 40px;
}

.state-icon {
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
}

.state-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--cockpit-border);
  border-top-color: var(--cockpit-power);
  animation: state-spin 0.8s linear infinite;
}

.state-error { color: var(--cockpit-alert); border-color: rgba(240, 100, 91, 0.4); }
.state-stale { color: var(--cockpit-warn); border-color: rgba(231, 179, 79, 0.4); }
.state-demo { color: var(--cockpit-warn); border-color: rgba(231, 179, 79, 0.4); }
.state-partial { color: var(--cockpit-market); border-color: rgba(104, 162, 216, 0.4); }

@keyframes state-spin {
  to { transform: rotate(360deg); }
}
</style>

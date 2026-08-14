<!--
  右侧 · 五维价值结构（§3.7.2 / §4.8）：
  水平条展示电量/容量/调节/绿色/质量价值；已结算与估算分开展示；
  未接入项显示“未接入”，不显示 0；悬停显示口径、规则版本、来源。
-->
<template>
  <div class="value-breakdown">
    <CockpitState v-if="!items.length && store.bootstrapStatus === 'ready'" status="empty" message="暂无价值数据" />
    <template v-else>
      <div class="vb-row" v-for="item in items" :key="item.type">
        <div class="vb-head">
          <span class="vb-label">{{ item.label }}</span>
          <span class="vb-status" :class="`st-${item.value_status}`">
            {{ item.value_status === 'settled' ? '结' : item.value_status === 'estimated' ? '估' : '未接入' }}
          </span>
          <span class="vb-value num-font" :title="`${formatCurrencyExact(item.value_cny)} · 口径 ${item.calculation_version || '--'} · ${formatClock(item.as_of)}`">
            {{ item.value_status === 'unavailable' ? '未接入' : formatCurrency(item.value_cny) }}
          </span>
        </div>
        <div class="vb-bar">
          <span
            class="vb-fill"
            :class="`fill-${item.value_status}`"
            :style="{ width: barPercent(item) + '%' }"
            :title="tooltip(item)"
          />
        </div>
        <div class="vb-meta">
          <span v-if="item.calculation_version" class="vb-rule">规则版本 {{ item.calculation_version }}</span>
          <span v-else class="vb-rule">暂无结算规则</span>
          <span v-if="item.source_refs.length" class="vb-src">来源 {{ item.source_refs.join('、') }}</span>
        </div>
      </div>
      <div class="vb-total">
        <span>今日价值合计</span>
        <span class="num-font" :title="totalTitle">{{ formatCurrency(totalCny) }}</span>
        <span class="vb-total-note">{{ settledCount > 0 ? `已结算 ${formatCurrency(settledCny)}` : '暂无已结算项' }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import CockpitState from './CockpitState.vue';
import { formatClock, formatCurrency, formatCurrencyExact } from '../../utils/format';
import type { ValueItem } from '../../types/cockpit';

const store = useCockpitStore();

const items = computed<ValueItem[]>(() => store.bootstrap?.value_summary ?? [])

const totalCny = computed(() => {
  const settled = items.value.filter(i => i.value_status === 'settled').reduce((s, i) => s + (i.value_cny ?? 0), 0)
  const estimated = items.value.filter(i => i.value_status === 'estimated').reduce((s, i) => s + (i.value_cny ?? 0), 0)
  const total = settled + estimated
  return total > 0 ? total : null
})

const settledCny = computed(() => items.value.filter(i => i.value_status === 'settled').reduce((s, i) => s + (i.value_cny ?? 0), 0))
const settledCount = computed(() => items.value.filter(i => i.value_status === 'settled').length)
const totalTitle = computed(() => `已结算 ${formatCurrencyExact(settledCny.value)} + 估算项（未含未接入）`)

function barPercent(item: ValueItem): number {
  const max = Math.max(...items.value.map(i => i.value_cny ?? 0), 1)
  if (item.value_status === 'unavailable' || item.value_cny === null) return 0
  return Math.max(3, Math.min(100, (item.value_cny / max) * 100))
}

function tooltip(item: ValueItem): string {
  return `${item.label}：${formatCurrencyExact(item.value_cny)}；口径 ${item.calculation_version || '--'}；来源 ${item.source_refs.join('、') || '--'}；业务时间 ${formatClock(item.as_of)}`
}
</script>

<style scoped>
.value-breakdown { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding-right: 6px; flex: 1; }

.vb-row { display: flex; flex-direction: column; gap: 5px; }
.vb-head { display: flex; align-items: center; gap: 6px; }
.vb-label { font-size: 13px; color: var(--cockpit-text-1); flex: 1; }
.vb-status {
  font-size: 11px;
  padding: 0 5px;
  border-radius: 3px;
  line-height: 15px;
}
.st-settled { background: rgba(216, 173, 96, 0.16); color: var(--cockpit-value); }
.st-estimated { background: rgba(104, 162, 216, 0.16); color: var(--cockpit-market); }
.st-unavailable { background: rgba(145, 160, 174, 0.14); color: var(--cockpit-text-3); }
.vb-value { font-size: 15px; color: var(--cockpit-text-1); min-width: 64px; text-align: right; }

.vb-bar { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); overflow: hidden; }
.vb-fill { display: block; height: 100%; border-radius: 3px; }
.fill-settled { background: var(--cockpit-value); }
.fill-estimated { background: var(--cockpit-market); }

.vb-meta { display: flex; gap: 10px; font-size: 11px; color: var(--cockpit-text-3); }
.vb-rule, .vb-src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.vb-total {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--cockpit-border);
  font-size: 12px;
  color: var(--cockpit-text-2);
}
.vb-total .num-font { font-size: 16px; color: var(--cockpit-value); font-weight: 600; }
.vb-total-note { margin-left: auto; font-size: 11px; color: var(--cockpit-text-3); }
</style>

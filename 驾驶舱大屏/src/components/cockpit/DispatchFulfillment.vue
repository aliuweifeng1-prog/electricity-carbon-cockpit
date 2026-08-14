<!--
  左侧 · 调用与履约（§3.5.3 / §4.6）：
  子弹图/目标-实绩对比条；展示事件数、目标/实际、履约率、最大偏差、待确认、估算罚款。
  不显示无事件模型的固定“执行率”圆形仪表盘。
-->
<template>
  <div class="dispatch-fulfillment">
    <CockpitState v-if="!data && state === 'error'" status="error" message="履约数据不可用" />
    <CockpitState v-else-if="!data && state === 'loading'" status="loading" />
    <CockpitState v-else-if="!data" status="empty" message="暂无调用与履约数据" />
    <template v-else>
      <div class="df-top">
        <span>当前生效事件 <b class="num-font">{{ data.active_event_count }}</b></span>
        <span>待确认 <b class="num-font" :class="{ warn: (data.unconfirmed_event_count ?? 0) > 0 }">{{ data.unconfirmed_event_count }}</b></span>
        <span v-if="data.estimated_penalty_cny !== null" class="penalty" title="按规则版本估算，非结算结果">
          估算罚款 {{ formatCurrency(data.estimated_penalty_cny) }}
        </span>
      </div>

      <div class="df-bar-block">
        <div class="df-bar-head">
          <span>目标响应</span>
          <span class="num-font">{{ formatNullable(data.target_response_mw) }} MW</span>
        </div>
        <div class="df-bullet">
          <span class="df-bullet-fill" :style="{ width: pct(data.target_response_mw, 24) + '%' }" />
          <span class="df-bullet-marker" :style="{ left: pct(data.actual_response_mw, 24) + '%' }" title="实际响应" />
        </div>
        <div class="df-bar-head">
          <span>实际响应</span>
          <span class="num-font">{{ formatNullable(data.actual_response_mw) }} MW</span>
        </div>
      </div>

      <div class="df-metrics">
        <div class="df-metric">
          <span class="df-label">履约率</span>
          <span class="df-value num-font" :class="rateClass">{{ formatPercent(data.fulfillment_rate_pct) }}</span>
        </div>
        <div class="df-metric">
          <span class="df-label">最大偏差</span>
          <span class="df-value num-font" :class="(data.max_deviation_pct ?? 0) > 5 ? 'warn' : ''">{{ formatPercent(data.max_deviation_pct) }}</span>
        </div>
        <div class="df-metric">
          <span class="df-label">平均响应</span>
          <span class="df-value num-font">{{ formatNullable(data.avg_response_seconds, 0) }}s</span>
        </div>
      </div>

      <div class="df-foot">
        <span class="df-rule" title="履约与偏差口径版本">口径 {{ data.rule_version || '--' }}</span>
        <button type="button" class="df-btn" @click="goDeviation">进入偏差考核 →</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import { fetchDispatch } from '../../api/cockpit';
import { useHostBridge } from '../../composables/useHostBridge';
import CockpitState from './CockpitState.vue';
import { formatCurrency, formatNullable, formatPercent } from '../../utils/format';
import type { DispatchSummary } from '../../types/cockpit';

const store = useCockpitStore();
const bridge = useHostBridge();
const data = ref<DispatchSummary | null>(null);
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');

const rateClass = computed(() => {
  const v = data.value?.fulfillment_rate_pct
  if (v === null || v === undefined) return ''
  return v >= 95 ? 'ok' : v >= 90 ? '' : 'warn'
})

function pct(value: number | null, max: number): number {
  if (value === null || value === undefined) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

async function load() {
    state.value = 'loading'
  try {
    data.value = await fetchDispatch(store.scope)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

function goDeviation() {
  bridge.requestNavigate('/app/ops/deviation', {}, '偏差考核与结算')
}

watch(() => [store.scope.id, store.bootstrap?.data_version], () => { void load() }, { immediate: true })
watch(() => store.stream.degraded, () => { if (store.stream.degraded) void load() })
onBeforeUnmount(() => { /* 无定时器 */ })
</script>

<style scoped>
.dispatch-fulfillment { display: flex; flex-direction: column; gap: 7px; font-size: 12px; flex: 1; min-height: 0; overflow: hidden; }

.df-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .8fr); align-items: center; gap: 4px 8px; color: var(--cockpit-text-2); line-height: 16px; }
.df-top > span { min-width: 0; white-space: nowrap; }
.df-top b { color: var(--cockpit-text-1); font-weight: 600; margin-left: 2px; }
.df-top b.warn { color: var(--cockpit-warn); }
.penalty { grid-column: 1 / -1; color: var(--cockpit-warn); font-size: 11px; margin: 0; text-align: right; }

.df-bar-block { display: flex; flex-direction: column; gap: 4px; }
.df-bar-head { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--cockpit-text-3); line-height: 14px; }
.df-bullet { position: relative; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.06); overflow: visible; }
.df-bullet-fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: rgba(104, 162, 216, 0.55); }
.df-bullet-marker {
  position: absolute; top: -3px; width: 3px; height: 12px; border-radius: 2px;
  background: var(--cockpit-carbon); transform: translateX(-50%);
}

.df-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.df-metric { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.df-label { font-size: 11px; color: var(--cockpit-text-3); white-space: nowrap; }
.df-value { font-size: 15px; color: var(--cockpit-text-1); white-space: nowrap; }
.df-value.ok { color: var(--cockpit-carbon); }
.df-value.warn { color: var(--cockpit-warn); }

.df-foot { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
.df-rule { font-size: 10.5px; color: var(--cockpit-text-3); white-space: nowrap; }
.df-btn {
  background: rgba(53, 214, 196, 0.12);
  border: 1px solid rgba(53, 214, 196, 0.4);
  color: var(--cockpit-power);
  font-size: 11px;
  padding: 4px 7px;
  border-radius: 5px;
  cursor: pointer;
}
.df-btn:hover { background: rgba(53, 214, 196, 0.22); }
</style>

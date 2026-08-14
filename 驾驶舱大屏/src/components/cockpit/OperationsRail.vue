<!-- 左侧电力数据看板：电力交易/售电业务与功率平衡/调用履约按业务链路融合。 -->
<template>
  <aside class="operations-rail">
    <header class="rail-titlebar">
      <div>
        <span class="rail-accent" />
        <h2>电力数据看板</h2>
      </div>
      <span>{{ totalCustomers }} 个聚合资源</span>
    </header>

    <section class="op-block block-power">
      <header class="op-head">
        <div>
          <span class="op-kicker">DISPATCH FULFILLMENT</span>
          <h3 class="op-title">功率平衡 · 调用履约</h3>
        </div>
        <span class="op-state">{{ rangeLabel }}</span>
      </header>
      <div class="op-body op-merged">
        <PowerBalanceChart />
        <div class="op-merge-divider">
          <span>调用履约</span>
          <span>{{ streamLabel }}</span>
        </div>
        <DispatchFulfillment />
      </div>
    </section>

    <section class="op-block block-market">
      <header class="op-head">
        <div>
          <span class="op-kicker">POWER MARKET</span>
          <h3 class="op-title">电力交易 · 售电业务</h3>
        </div>
        <span v-if="store.bootstrap?.market_summary" class="op-state" :style="{ color: qualityColor(store.bootstrap.market_summary.quality_status) }">
          {{ qualityLabel(store.bootstrap.market_summary.quality_status) }}
        </span>
      </header>
      <div class="op-body"><MarketPanel /></div>
    </section>

    <section class="op-block block-risk">
      <header class="op-head">
        <div>
          <span class="op-kicker">OPERATION RISK</span>
          <h3 class="op-title">综合风险预警</h3>
        </div>
        <span class="op-state" :class="{ danger: store.criticalAlertCount > 0 }">{{ store.criticalAlertCount }} 条高风险</span>
      </header>
      <div class="op-body"><RiskDecisionQueue /></div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore } from '../../stores/cockpit'
import { qualityColor, qualityLabel } from '../../utils/format'
import DispatchFulfillment from './DispatchFulfillment.vue'
import MarketPanel from './MarketPanel.vue'
import PowerBalanceChart from './PowerBalanceChart.vue'
import RiskDecisionQueue from './RiskDecisionQueue.vue'

const store = useCockpitStore()
const totalCustomers = computed(() => store.bootstrap?.resource_summary.reduce((sum, item) => sum + item.resource_count, 0) ?? 0)
const rangeLabel = computed(() => store.timeRange === 'realtime' ? '实时' : store.timeRange === 'today' ? '今日' : '本月')
const streamLabel = computed(() => store.stream.connected ? '事件流已连接' : store.stream.degraded ? '轮询降级' : '事件流断开')
</script>

<style scoped>
.operations-rail {
  display: grid;
  grid-template-rows: 26px 520px 290px 390px;
  gap: 8px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 5px;
  scrollbar-color: rgba(104, 162, 216, 0.45) transparent;
  scrollbar-width: thin;
}
.rail-titlebar { display: flex; align-items: center; justify-content: space-between; min-width: 0; }
.rail-titlebar > div { display: flex; align-items: center; gap: 8px; }
.rail-accent { width: 3px; height: 18px; background: var(--cockpit-market); }
.rail-titlebar h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--cockpit-text-1); }
.rail-titlebar > span { color: var(--cockpit-text-3); font-size: 10.5px; }
.op-block { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--cockpit-border); border-radius: 5px; background: var(--cockpit-bg-panel); overflow: hidden; }
.op-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 7px; border-bottom: 1px solid var(--cockpit-border); flex-shrink: 0; }
.op-head > div { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.op-kicker { color: var(--cockpit-market); font-size: 8px; white-space: nowrap; }
.op-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--cockpit-text-1); white-space: nowrap; }
.op-state { font-size: 11px; color: var(--cockpit-text-3); white-space: nowrap; }
.op-state.danger { color: var(--cockpit-alert); }
.op-body { flex: 1; min-height: 0; padding: 9px 10px 10px; overflow: hidden; display: flex; flex-direction: column; }
.op-merged { gap: 8px; }
.block-market :deep(.mp-chart) { min-height: 108px; }
.op-merged :deep(.power-balance) { flex: 0 0 250px; overflow: hidden; }
.op-merged :deep(.pb-chart) { min-height: 0; }
.op-merged :deep(.dispatch-fulfillment) { flex: 1 1 0; min-height: 0; gap: 7px; overflow: hidden; }
.op-merged :deep(.df-top) { font-size: 11px; gap: 4px 8px; }
.op-merged :deep(.df-metrics) { gap: 6px; }
.op-merged :deep(.df-value) { font-size: 15px; }
.op-merge-divider { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--cockpit-border); padding-top: 5px; color: var(--cockpit-text-2); font-size: 10px; }
.op-merge-divider span:last-child { color: var(--cockpit-text-3); }
.block-risk :deep(.risk-queue) { gap: 8px; padding-right: 0; overflow: visible; }
.block-risk :deep(.rq-sec-head) { font-size: 11.5px; }
.block-risk :deep(.alert-item) { padding: 7px 8px; gap: 4px; }
.block-risk :deep(.ai-title) { font-size: 12px; }
.block-risk :deep(.ai-desc) { font-size: 11.5px; }
.block-risk :deep(.ai-meta) { font-size: 10.5px; }

@media (max-width: 1480px) {
  .op-kicker { display: none; }
  .op-head { gap: 8px; }
  .op-head > div { overflow: hidden; }
  .op-title { overflow: hidden; text-overflow: ellipsis; }
}
</style>

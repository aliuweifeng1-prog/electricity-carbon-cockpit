<!--
  顶部北极星指标带（§3.4）：固定 5 项，每项由主值、单位、对比、迷你趋势、数据状态组成。
  不使用大面积卡片背景，仅用细线和留白分隔。
-->
<template>
  <section class="north-star" :class="{ 'is-loading': store.bootstrapStatus === 'loading' && !store.bootstrap }">
    <div v-for="ind in indicators" :key="ind.key" class="ns-item">
      <div class="ns-head">
        <span class="ns-label">{{ ind.label }}</span>
        <span v-if="ind.value_status" class="ns-status" :title="'数值状态：' + valueStatusLabel(ind.value_status)">{{ valueStatusLabel(ind.value_status) }}</span>
        <span class="ns-quality" :style="{ color: qualityColor(ind.quality_status) }" :title="'数据质量：' + qualityLabel(ind.quality_status) + ' · 业务时间 ' + formatClock(ind.as_of)">{{ qualityLabel(ind.quality_status) }}</span>
      </div>
      <div class="ns-main">
        <span class="ns-value num-font">{{ ind.display_value }}</span>
        <span class="ns-unit">{{ ind.unit }}</span>
      </div>
      <div class="ns-foot">
        <span v-if="ind.sub_value" class="ns-sub">{{ ind.sub_value.label }} {{ formatNullable(ind.sub_value.value) }} {{ ind.sub_value.unit }}</span>
        <span v-if="ind.compare_value !== null && ind.compare_label" class="ns-comp" :class="{ up: ind.compare_value >= 0, down: ind.compare_value < 0 }">
          {{ ind.compare_value >= 0 ? '↑' : '↓' }}{{ formatNullable(Math.abs(ind.compare_value)) }} {{ ind.compare_label }}
        </span>
      </div>
      <div v-if="ind.sparkline && ind.sparkline.length" ref="sparkHosts" class="ns-spark" :data-key="ind.key" />
    </div>
    <CockpitState v-if="store.bootstrapStatus === 'error' && !store.bootstrap" status="error" message="指标数据不可用" />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import CockpitState from './CockpitState.vue';
import { formatNullable, formatClock, qualityColor, qualityLabel, valueStatusLabel } from '../../utils/format';
import { echarts, CHART_TEXT, CHART_COLORS } from '../../utils/echarts';
import type { ECharts } from 'echarts/core';

const store = useCockpitStore();
const sparkHosts = ref<HTMLElement[]>([]);
const charts: Array<{ el: HTMLElement; chart: ECharts }> = [];

const indicators = computed(() => store.indicators);

function renderSparklines() {
  charts.forEach(({ chart }) => chart.dispose())
  charts.length = 0
  if (!store.bootstrap) return
  nextTick(() => {
    for (const el of sparkHosts.value ?? []) {
      const key = el.dataset.key
      const ind = store.bootstrap?.indicators.find(i => i.key === key)
      if (!ind?.sparkline || !ind.sparkline.length) continue
      const chart = echarts.init(el)
      chart.setOption({
        animation: false,
        grid: { left: 2, right: 2, top: 4, bottom: 2 },
        xAxis: { type: 'category', show: false, data: ind.sparkline.map(p => p.timestamp) },
        yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
        tooltip: { show: false },
        series: [{
          type: 'line',
          data: ind.sparkline.map(p => p.value),
          showSymbol: false,
          lineStyle: { color: CHART_COLORS.power, width: 1.2 },
          areaStyle: { color: 'rgba(53,214,196,0.12)' },
          connectNulls: false,
        }],
      })
      charts.push({ el, chart })
    }
  })
}

watch(() => [store.bootstrap, store.scope.id, store.timeRange], renderSparklines, { deep: false })

function resize() {
  charts.forEach(({ chart }) => chart.resize())
}

window.addEventListener('resize', resize)
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  charts.forEach(({ chart }) => chart.dispose())
  charts.length = 0
})
</script>

<style scoped>
.north-star {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-bottom: 1px solid var(--cockpit-border);
  padding: 0 28px;
  position: relative;
}

.ns-item {
  flex: 1;
  min-width: 0;
  padding: 12px 22px;
  border-right: 1px solid var(--cockpit-border);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  position: relative;
}
.ns-item:first-child { padding-left: 0; }
.ns-item:last-child { border-right: none; padding-right: 0; }

.ns-head { display: flex; align-items: center; gap: 6px; }
.ns-label { font-size: 14px; color: var(--cockpit-text-2); white-space: nowrap; }
.ns-status {
  font-size: 11.5px;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(104, 162, 216, 0.16);
  color: var(--cockpit-market);
}
.ns-quality { font-size: 11.5px; margin-left: auto; white-space: nowrap; }

.ns-main { display: flex; align-items: baseline; gap: 4px; }
.ns-value { font-size: 30px; font-weight: 600; color: var(--cockpit-text-1); line-height: 1.1; letter-spacing: 0.2px; }
.ns-unit { font-size: 13px; color: var(--cockpit-text-2); }

.ns-foot { display: flex; align-items: center; gap: 12px; font-size: 12.5px; color: var(--cockpit-text-3); }
.ns-comp.up { color: var(--cockpit-carbon); }
.ns-comp.down { color: var(--cockpit-alert); }

.ns-spark { position: absolute; right: 20px; bottom: 8px; width: 68px; height: 24px; opacity: 0.9; }

.is-loading { opacity: 0.6; }

@media (max-width: 1400px), (max-height: 860px) {
  .north-star { padding: 0 18px; }
  .ns-item { padding: 8px 14px; gap: 2px; }
  .ns-label { font-size: 11.5px; }
  .ns-quality { font-size: 9.5px; }
  .ns-value { font-size: 25px; }
  .ns-foot { gap: 7px; font-size: 10px; }
  .ns-spark { right: 12px; bottom: 5px; width: 58px; height: 21px; }
}
</style>

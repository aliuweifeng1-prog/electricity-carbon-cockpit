<!--
  右侧 · 市场与价格（§3.7.1 / §4.7）：
  日前/实时价格折线 + 3 个当前值（当前价、峰谷价差、下一机会窗口）。
  无现货时显示代理购电/分时电价并明确类型；单位由后端统一为元/MWh。
-->
<template>
  <div class="market-panel">
    <CockpitState v-if="state === 'error'" status="error" message="市场数据不可用" />
    <CockpitState v-else-if="state === 'loading' && !data" status="loading" />
    <CockpitState v-else-if="!data" status="empty" message="暂无市场价格数据" />
    <template v-else>
      <div class="mp-head">
        <span class="mp-type">{{ marketTypeLabel() }}</span>
        <span class="mp-source" :title="'价格来源：' + (data.price_source || '--')">{{ data.price_source || '--' }}</span>
      </div>
      <div ref="chartHost" class="mp-chart" />
      <div class="mp-values">
        <div class="mp-cell">
          <span class="mp-label">当前价</span>
          <span class="mp-value num-font">{{ formatNullable(data.current_price_cny_mwh, 0) }}</span>
          <span class="mp-unit">{{ data.unit }}</span>
        </div>
        <div class="mp-cell">
          <span class="mp-label">今日峰谷价差</span>
          <span class="mp-value num-font gold">{{ formatNullable(data.peak_valley_spread_cny_kwh, 2) }}</span>
          <span class="mp-unit">元/kWh</span>
        </div>
        <div class="mp-cell wide">
          <span class="mp-label">下一机会窗口</span>
          <span class="mp-value num-font" :title="data.opportunity_type || ''">
            {{ data.next_opportunity_start || '--' }}{{ data.next_opportunity_end ? '–' + data.next_opportunity_end : '' }}
          </span>
          <span class="mp-unit">{{ data.opportunity_type || '' }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import { fetchMarket } from '../../api/cockpit';
import CockpitState from './CockpitState.vue';
import { formatNullable } from '../../utils/format';
import { echarts, CHART_TEXT, CHART_AXIS, CHART_COLORS } from '../../utils/echarts';
import type { ECharts } from 'echarts/core';
import type { MarketSummary } from '../../types/cockpit';

const store = useCockpitStore();
const chartHost = ref<HTMLElement | null>(null);
const data = ref<MarketSummary | null>(null);
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
let chart: ECharts | null = null;
let chartResizeObserver: ResizeObserver | null = null;

const marketTypeLabel = () => {
  if (!data.value) return '市场与价格'
  switch (data.value.market_type) {
    case 'spot': return '现货市场价格'
    case 'agency': return '代理购电价格'
    case 'tou': return '分时电价'
    case 'ancillary': return '辅助服务价格'
    default: return '市场与价格'
  }
}

async function load() {
    state.value = 'loading'
  try {
    data.value = await fetchMarket(store.scope)
    state.value = 'ready'
    render()
  } catch {
    state.value = 'error'
  }
}

function render() {
  if (!chartHost.value || !data.value) return
  if (!chart) {
    chart = echarts.init(chartHost.value)
    const host = chartHost.value
    if (host) {
      chartResizeObserver = new ResizeObserver(() => chart?.resize())
      chartResizeObserver.observe(host)
    }
    requestAnimationFrame(() => chart?.resize())
  }
  const d = data.value
  const spotSeries: Array<{ name: string; points: { timestamp: string; value: number | null }[]; color: string }> = []
  if (d.day_ahead_price_cny_mwh) spotSeries.push({ name: '日前价格', points: d.day_ahead_price_cny_mwh, color: CHART_COLORS.blue })
  if (d.realtime_price_cny_mwh) spotSeries.push({ name: '实时价格', points: d.realtime_price_cny_mwh, color: CHART_COLORS.gold })
  if (d.tou_price_cny_kwh) spotSeries.push({ name: '分时电价', points: d.tou_price_cny_kwh, color: CHART_COLORS.green })

  const timestamps = (spotSeries[0]?.points ?? []).map(p => p.timestamp)
  chart.setOption({
    animation: false,
    grid: { left: 6, right: 6, top: 30, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,18,24,0.95)',
      borderColor: CHART_AXIS,
      textStyle: { color: CHART_TEXT, fontSize: 12 },
      valueFormatter: (v: unknown) => (v === null || v === undefined ? '缺测' : `${v} ${d.unit}`),
    },
    legend: {
      top: 0,
      left: 0,
      right: 0,
      type: 'scroll',
      textStyle: { color: CHART_TEXT, fontSize: 11.5 },
      itemWidth: 12,
      itemHeight: 2,
      data: spotSeries.map(s => s.name),
    },
    xAxis: {
      type: 'category',
      data: timestamps,
      axisLine: { lineStyle: { color: CHART_AXIS } },
      axisLabel: { color: CHART_TEXT, fontSize: 10.5, formatter: (_v: string, i: number) => i % 3 === 0 ? (timestamps[i] || '').slice(11, 16) : '' },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: CHART_TEXT, fontSize: 10.5 },
      splitLine: { lineStyle: { color: 'rgba(32,40,51,0.6)' } },
    },
    series: spotSeries.map(s => ({
      name: s.name,
      type: 'line',
      data: s.points.map(p => p.value),
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: s.color, width: 1.4 },
      itemStyle: { color: s.color },
      emphasis: { disabled: true },
    })),
  }, { notMerge: true })
}

watch(() => [store.scope.id, store.bootstrap?.data_version], () => { void load() }, { immediate: true })

function resize() { chart?.resize() }
window.addEventListener('resize', resize)
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chartResizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.market-panel { display: flex; flex-direction: column; gap: 4px; min-height: 0; flex: 1; overflow: hidden; }
.mp-head { display: flex; align-items: center; justify-content: space-between; }
.mp-type { font-size: 12px; color: var(--cockpit-text-1); font-weight: 500; }
.mp-source { font-size: 10.5px; color: var(--cockpit-text-3); max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-chart { flex: 1; min-height: 60px; }
.mp-values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 10px; }
.mp-cell.wide { grid-column: 1 / -1; }
.mp-cell { display: flex; flex-direction: column; gap: 2px; }
.mp-label { font-size: 11px; color: var(--cockpit-text-3); }
.mp-value { font-size: 15px; color: var(--cockpit-text-1); }
.mp-value.gold { color: var(--cockpit-value); }
.mp-unit { font-size: 10.5px; color: var(--cockpit-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

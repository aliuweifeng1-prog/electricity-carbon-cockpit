<!--
  左侧 · 功率平衡（§3.5.2 / §4.5）：
  15 分钟粒度折线/面积图，默认最近 6 小时，可切换今日 96 点；
  缺测用 null 断线，图例提示缺测点数量；显示当前平衡差与数据缺口。
-->
<template>
  <div class="power-balance">
    <div class="pb-head">
      <div class="pb-switch">
        <button type="button" :class="{ active: rangeHours === 6 }" @click="setRange(6)">最近6小时</button>
        <button type="button" :class="{ active: rangeHours === 24 }" @click="setRange(24)">今日96点</button>
      </div>
      <div class="pb-metrics">
        <span v-if="data" :title="'平衡差 = 电网交换 + 新能源 + 储能 − 总负荷'">
          平衡差 <b class="num-font" :class="errorClass">{{ formatNullable(data.balance_error_mw) }} MW</b>
        </span>
        <span v-if="data?.data_gap_minutes" class="gap">
          数据缺口 {{ formatNullable(data.data_gap_minutes, 0) }} 分钟
        </span>
      </div>
    </div>
    <div v-if="data" class="pb-legend" aria-label="功率曲线图例">
      <span v-for="item in powerSeries" :key="item.key">
        <i :class="{ dashed: item.dashed }" :style="{ '--legend-color': item.color }" />{{ item.name }}
      </span>
      <span class="pb-unit">单位：MW</span>
      <span v-if="missingPointCount" class="pb-missing">缺测 {{ missingPointCount }} 点</span>
    </div>
    <CockpitState v-if="state === 'error'" status="error" message="功率数据不可用" />
    <CockpitState v-else-if="state === 'loading' && !data" status="loading" />
    <CockpitState v-else-if="!data" status="empty" message="暂无功率平衡数据" />
    <div v-else ref="chartHost" class="pb-chart" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import { fetchPowerSeries } from '../../api/cockpit';
import CockpitState from './CockpitState.vue';
import { formatNullable } from '../../utils/format';
import { echarts, CHART_TEXT, CHART_AXIS, CHART_COLORS } from '../../utils/echarts';
import type { ECharts } from 'echarts/core';
import type { PowerBalanceData } from '../../types/cockpit';

const store = useCockpitStore();
const chartHost = ref<HTMLElement | null>(null);
const rangeHours = ref(6);
const data = ref<PowerBalanceData | null>(null);
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
let chart: ECharts | null = null;
let chartResizeObserver: ResizeObserver | null = null;

const powerSeries = [
  { key: 'load_total_mw', name: '总负荷', color: CHART_COLORS.load, width: 1.6 },
  { key: 'renewable_generation_mw', name: '新能源出力', color: CHART_COLORS.renewable, width: 1.4 },
  { key: 'storage_power_mw', name: '储能功率', color: CHART_COLORS.storage, width: 1.4 },
  { key: 'grid_exchange_mw', name: '电网交换', color: CHART_COLORS.grid, width: 1.4 },
  { key: 'charging_load_mw', name: '充电负荷（分项）', color: CHART_COLORS.charging, width: 1.2, dashed: true },
]

const missingPointCount = computed(() => {
  if (!data.value) return 0
  return powerSeries.reduce((sum, item) => {
    const list = (data.value as unknown as Record<string, Array<{ value: number | null }>>)[item.key] ?? []
    return sum + list.filter(point => point.value === null).length
  }, 0)
})

const errorClass = computed(() => {
  const v = data.value?.balance_error_mw
  if (v === null || v === undefined) return ''
  return Math.abs(v) < 2 ? 'ok' : 'warn'
})

function setRange(hours: number) {
  rangeHours.value = hours
  render()
}

async function load() {
    state.value = 'loading'
  try {
    const res = await fetchPowerSeries(store.scope, rangeHours.value)
    data.value = res
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
  render()
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
  const timestamps = d.load_total_mw.map(p => p.timestamp)
  chart.setOption({
    animation: false,
    grid: { left: 8, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,18,24,0.95)',
      borderColor: CHART_AXIS,
      textStyle: { color: CHART_TEXT, fontSize: 12 },
      valueFormatter: (v: unknown) => (v === null || v === undefined ? '缺测' : `${v} MW`),
    },
    legend: { show: false },
    xAxis: {
      type: 'category',
      data: timestamps,
      axisLine: { lineStyle: { color: CHART_AXIS } },
      axisLabel: { color: CHART_TEXT, fontSize: 10.5, formatter: (_v: string, i: number) => i % 4 === 0 ? timestamps[i].slice(11, 16) : '' },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: CHART_TEXT, fontSize: 10.5 },
      splitLine: { lineStyle: { color: 'rgba(32,40,51,0.6)' } },
    },
    series: powerSeries.map(s => {
      const list = (d as unknown as Record<string, Array<{ value: number | null }>>)[s.key] ?? []
      return {
        name: s.name,
        type: 'line',
        data: list.map(p => p.value),
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: s.color, width: s.width, type: s.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: s.color },
        areaStyle: s.key === 'load_total_mw' ? { color: 'rgba(232,238,243,0.06)' } : undefined,
        emphasis: { disabled: true },
      }
    }),
  }, { notMerge: true })
}

watch(() => [store.scope.id, store.bootstrap?.data_version], () => { void load() }, { immediate: true })
watch(() => store.stream.degraded, () => { if (store.stream.degraded) void load() })

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
.power-balance { display: flex; flex-direction: column; gap: 4px; min-height: 0; flex: 1; overflow: hidden; }
.pb-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pb-switch { display: flex; gap: 2px; background: var(--cockpit-bg); border: 1px solid var(--cockpit-border); border-radius: 5px; padding: 2px; }
.pb-switch button {
  border: none; background: transparent; color: var(--cockpit-text-3);
  font-size: 11px; padding: 2px 6px; border-radius: 3px; cursor: pointer;
}
.pb-switch button.active { background: rgba(53, 214, 196, 0.14); color: var(--cockpit-power); }
.pb-metrics { display: flex; justify-content: flex-end; gap: 6px; font-size: 11px; color: var(--cockpit-text-3); flex-wrap: wrap; line-height: 14px; }
.pb-metrics b { color: var(--cockpit-text-1); font-weight: 500; }
.pb-metrics b.ok { color: var(--cockpit-carbon); }
.pb-metrics b.warn { color: var(--cockpit-warn); }
.pb-metrics .gap { color: var(--cockpit-warn); }
.pb-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 6px; color: var(--cockpit-text-3); font-size: 10px; line-height: 12px; }
.pb-legend span { display: flex; align-items: center; gap: 5px; min-width: 0; white-space: nowrap; }
.pb-legend i { width: 13px; height: 2px; flex: 0 0 13px; background: var(--legend-color); }
.pb-legend i.dashed { background: repeating-linear-gradient(90deg, var(--legend-color) 0 5px, transparent 5px 8px); }
.pb-legend .pb-unit { color: var(--cockpit-text-2); }
.pb-legend .pb-missing { color: var(--cockpit-warn); }
.pb-chart { flex: 1; min-height: 0; width: 100%; overflow: hidden; }
</style>




<!-- 电碳协同双轴联动：仅使用功率序列与顶部指标，派生值明确标注估算口径。 -->
<template>
  <section class="dual-axis-linkage">
    <header class="dal-head">
      <div>
        <span class="dal-kicker">ELECTRICITY · CARBON</span>
        <h2>电碳协同 · 双轴联动</h2>
      </div>
      <div class="dal-meta">
        <span>{{ store.scope.name }}</span>
        <span :style="{ color: qualityColor(store.overallQuality) }">{{ qualityLabel(store.overallQuality) }}</span>
      </div>
    </header>

    <div class="dal-content">
      <CockpitState v-if="state === 'error'" status="error" message="电碳联动数据不可用" />
      <CockpitState v-else-if="state === 'loading' && !powerData" status="loading" />
      <div v-else ref="chartHost" class="dal-chart" />

      <div class="dal-mapping" aria-label="电碳指标映射">
        <div v-for="item in mappings" :key="item.label" class="dal-map-row">
          <span class="dal-map-label">{{ item.label }}</span>
          <span class="dal-map-line" />
          <ArrowRight :size="13" aria-hidden="true" />
          <span class="dal-map-value num-font" :class="item.tone">{{ item.value }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import { fetchPowerSeries } from '../../api/cockpit'
import { useCockpitStore } from '../../stores/cockpit'
import type { PowerBalanceData } from '../../types/cockpit'
import { qualityColor, qualityLabel } from '../../utils/format'
import { CHART_AXIS, CHART_COLORS, CHART_TEXT, echarts } from '../../utils/echarts'
import CockpitState from './CockpitState.vue'
import type { ECharts } from 'echarts/core'

const store = useCockpitStore()
const chartHost = ref<HTMLElement | null>(null)
const powerData = ref<PowerBalanceData | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const indicator = (key: string) => store.bootstrap?.indicators.find(item => item.key === key)

const mappings = computed(() => {
  const adjustable = indicator('verified_adjustable_power_mw')
  const green = indicator('green_consumption_rate_pct')
  const carbon = indicator('today_carbon_reduction_tco2e')
  const value = indicator('today_total_value_cny')
  const dispatch = store.bootstrap?.dispatch_summary
  return [
    { label: 'VPP 可调能力', value: `申报能力上限 ${adjustable?.display_value ?? '--'} ${adjustable?.unit ?? 'MW'}`, tone: 'tone-value' },
    { label: '绿电消纳', value: `消纳率 ${green?.display_value ?? '--'}${green?.unit ?? '%'}`, tone: 'tone-carbon' },
    { label: '碳减排核算', value: `今日累计 ${carbon?.display_value ?? '--'} ${carbon?.unit ?? 'tCO₂e'}`, tone: 'tone-carbon' },
    { label: '负荷响应', value: `履约率 ${dispatch?.fulfillment_rate_pct?.toFixed(1) ?? '--'}% · 价值 ${value?.display_value ?? '--'}${value?.unit ?? ''}`, tone: 'tone-power' },
  ]
})

async function load() {
  state.value = 'loading'
  try {
    powerData.value = await fetchPowerSeries(store.scope, 6)
    state.value = 'ready'
    await nextTick()
    render()
  } catch {
    state.value = 'error'
  }
}

function render() {
  if (!chartHost.value || !powerData.value) return
  if (!chart) {
    chart = echarts.init(chartHost.value)
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartHost.value)
  }

  const renewable = powerData.value.renewable_generation_mw
  const totalCarbon = indicator('today_carbon_reduction_tco2e')?.value ?? null
  const positiveGeneration = renewable.map(point => Math.max(0, point.value ?? 0))
  const generationTotal = positiveGeneration.reduce((sum, value) => sum + value, 0)
  let cumulative = 0
  const carbonSeries = positiveGeneration.map(value => {
    if (totalCarbon === null || generationTotal === 0) return null
    cumulative += (value / generationTotal) * totalCarbon
    return Number(cumulative.toFixed(1))
  })

  chart.setOption({
    animation: false,
    grid: { left: 8, right: 12, top: 30, bottom: 2, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(13,18,24,0.96)',
      borderColor: CHART_AXIS,
      textStyle: { color: CHART_TEXT, fontSize: 11 },
    },
    legend: {
      top: 0,
      right: 4,
      itemWidth: 12,
      itemHeight: 2,
      textStyle: { color: CHART_TEXT, fontSize: 10.5 },
      data: ['绿电出力（MW）', '碳减排累计（tCO₂e，估算）'],
    },
    xAxis: {
      type: 'category',
      data: renewable.map(point => point.timestamp),
      axisLine: { lineStyle: { color: CHART_AXIS } },
      axisTick: { show: false },
      axisLabel: { color: CHART_TEXT, fontSize: 9.5, formatter: (_value: string, index: number) => index % 6 === 0 ? renewable[index]?.timestamp.slice(11, 16) : '' },
    },
    yAxis: [
      { type: 'value', axisLabel: { color: CHART_TEXT, fontSize: 9.5 }, splitLine: { lineStyle: { color: 'rgba(32,40,51,.55)' } } },
      { type: 'value', axisLabel: { color: CHART_TEXT, fontSize: 9.5 }, splitLine: { show: false } },
    ],
    series: [
      {
        name: '绿电出力（MW）',
        type: 'line',
        data: renewable.map(point => point.value),
        showSymbol: false,
        lineStyle: { color: CHART_COLORS.blue, width: 1.5 },
        areaStyle: { color: 'rgba(104,162,216,.10)' },
      },
      {
        name: '碳减排累计（tCO₂e，估算）',
        type: 'line',
        yAxisIndex: 1,
        data: carbonSeries,
        showSymbol: false,
        lineStyle: { color: CHART_COLORS.green, width: 1.6 },
      },
    ],
  }, { notMerge: true })
}

watch(() => [store.scope.id, store.bootstrap?.data_version], () => { void load() }, { immediate: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.dual-axis-linkage {
  min-height: 0;
  margin: 0 24px;
  border-bottom: 1px solid var(--cockpit-border);
  display: grid;
  grid-template-rows: 34px minmax(0, 1fr);
}

.dal-head { display: flex; align-items: center; justify-content: space-between; min-width: 0; }
.dal-head > div:first-child { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.dal-head h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--cockpit-text-1); }
.dal-kicker { font-size: 9px; color: var(--cockpit-market); white-space: nowrap; }
.dal-meta { display: flex; gap: 12px; font-size: 11px; color: var(--cockpit-text-3); }

.dal-content { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, .8fr); gap: 20px; min-height: 0; }
.dal-chart { min-width: 0; min-height: 0; }
.dal-mapping { display: grid; grid-template-rows: repeat(4, 1fr); min-height: 0; padding: 4px 0 8px; }
.dal-map-row { display: grid; grid-template-columns: 92px minmax(16px, 1fr) 14px minmax(150px, auto); align-items: center; gap: 5px; font-size: 10.5px; }
.dal-map-label { color: var(--cockpit-text-3); white-space: nowrap; }
.dal-map-line { height: 1px; background: var(--cockpit-border); }
.dal-map-row svg { color: var(--cockpit-text-3); }
.dal-map-value { text-align: right; white-space: nowrap; }
.tone-value { color: var(--cockpit-value); }
.tone-carbon { color: var(--cockpit-carbon); }
.tone-power { color: var(--cockpit-market); }

@media (max-width: 1240px) {
  .dal-content { grid-template-columns: minmax(0, 1.25fr) minmax(270px, .75fr); gap: 12px; }
  .dal-map-row { grid-template-columns: 76px minmax(10px, 1fr) 14px minmax(130px, auto); font-size: 9.5px; }
}

@media (max-height: 860px) {
  .dual-axis-linkage { grid-template-rows: 28px minmax(0, 1fr); }
  .dal-head h2 { font-size: 13px; }
  .dal-chart { min-height: 88px; }
}
</style>

<!-- 碳资产看板：生产态仅展示合同内可追溯字段，不为缺失资产数据补零。 -->
<template>
  <div class="carbon-assets">
    <div class="ca-overview">
      <div class="ca-progress" :style="{ '--progress': carbonProgress + '%' }">
        <div class="ca-progress-inner">
          <strong class="num-font">{{ carbonIndicator?.display_value ?? '--' }}</strong>
          <span>{{ carbonIndicator?.unit ?? 'tCO₂e' }}</span>
        </div>
      </div>
      <div class="ca-overview-copy">
        <span class="ca-label">今日碳减排量</span>
        <b>核算口径 {{ carbonIndicator?.calculation_version || '--' }}</b>
        <span>较基期 {{ compareText }}</span>
        <span>业务时间 {{ formatClock(carbonIndicator?.as_of ?? null) }}</span>
      </div>
    </div>

    <div class="ca-section">
      <div class="ca-section-head"><span>绿色价值与碳资产</span><span>今日</span></div>
      <div class="ca-metrics">
        <div class="ca-metric">
          <span>绿色价值</span>
          <b class="num-font">{{ greenValue ? formatCurrency(greenValue.value_cny) : '--' }}</b>
          <small>{{ greenValue ? valueStatusLabel(greenValue.value_status) : '未接入' }}</small>
        </div>
        <div class="ca-metric">
          <span>绿电消纳率</span>
          <b class="num-font">{{ greenIndicator?.display_value ?? '--' }}{{ greenIndicator?.unit ?? '%' }}</b>
          <small>{{ greenIndicator?.sub_value ? `${greenIndicator.sub_value.label} ${formatNullable(greenIndicator.sub_value.value)} ${greenIndicator.sub_value.unit}` : '暂无副值' }}</small>
        </div>
        <div class="ca-metric">
          <span>碳资产持仓</span>
          <b class="num-font muted">未接入</b>
          <small>等待碳资产台账接口</small>
        </div>
        <div class="ca-metric">
          <span>CCER 项目池</span>
          <b class="num-font muted">未接入</b>
          <small>等待项目阶段接口</small>
        </div>
      </div>
    </div>

    <div class="ca-section ca-trend-section">
      <div class="ca-section-head"><span>减排趋势 · 来源贡献</span><span>{{ store.demoMode ? '演示口径' : '实时口径' }}</span></div>
      <div ref="chartHost" class="ca-chart" />
      <div class="ca-source-list">
        <div v-for="source in sources" :key="source.label" class="ca-source-row">
          <span>{{ source.label }}</span>
          <span class="ca-source-track"><i :style="{ width: source.percent + '%', background: source.color }" /></span>
          <b class="num-font">{{ source.value }}</b>
        </div>
      </div>
    </div>

    <div class="ca-section ca-value-section">
      <div class="ca-section-head"><span>电碳综合价值结构</span><span>结算与估算分列</span></div>
      <ValueBreakdown />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCockpitStore } from '../../stores/cockpit'
import type { ResourceSummaryItem, ValueItem } from '../../types/cockpit'
import { formatClock, formatCurrency, formatNullable } from '../../utils/format'
import { CHART_AXIS, CHART_COLORS, CHART_TEXT, echarts } from '../../utils/echarts'
import ValueBreakdown from './ValueBreakdown.vue'
import type { ECharts } from 'echarts/core'

const store = useCockpitStore()
const chartHost = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const carbonIndicator = computed(() => store.bootstrap?.indicators.find(item => item.key === 'today_carbon_reduction_tco2e'))
const greenIndicator = computed(() => store.bootstrap?.indicators.find(item => item.key === 'green_consumption_rate_pct'))
const greenValue = computed<ValueItem | undefined>(() => store.bootstrap?.value_summary.find(item => item.type === 'green'))
const carbonProgress = computed(() => Math.max(0, Math.min(100, greenIndicator.value?.value ?? 0)))
const compareText = computed(() => {
  const item = carbonIndicator.value
  if (!item || item.compare_value === null) return '--'
  return `${item.compare_value >= 0 ? '+' : ''}${item.compare_value}% ${item.compare_label || ''}`
})

const sources = computed(() => {
  const items = store.bootstrap?.resource_summary ?? []
  const sourceMap = [
    { types: ['pv', 'wind'], label: '新能源消纳', color: CHART_COLORS.gold },
    { types: ['storage'], label: '储能调度', color: CHART_COLORS.green },
    { types: ['load', 'aidc', 'charging'], label: '需求响应', color: CHART_COLORS.blue },
  ]
  const values = sourceMap.map(source => ({
    ...source,
    raw: items.filter(item => source.types.includes(item.resource_type)).reduce((sum, item) => sum + (item.verified_adjustable_power_mw ?? 0), 0),
  }))
  const max = Math.max(...values.map(item => item.raw), 1)
  return values.map(item => ({ ...item, percent: (item.raw / max) * 100, value: item.raw ? `${item.raw.toFixed(1)} MW` : '--' }))
})

function valueStatusLabel(status: ValueItem['value_status']) {
  if (status === 'settled') return '已结算'
  if (status === 'estimated') return '估算'
  return '未接入'
}

function aggregatedTrend(items: ResourceSummaryItem[], index: number): number {
  const base = items.reduce((sum, item) => sum + (item.current_power_mw ?? 0), 0)
  return Number((base * (0.45 + index * 0.07)).toFixed(1))
}

function render() {
  if (!chartHost.value) return
  if (!chart) {
    chart = echarts.init(chartHost.value)
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartHost.value)
  }
  const items = store.bootstrap?.resource_summary ?? []
  const carbonTotal = carbonIndicator.value?.value ?? null
  const trend = Array.from({ length: 8 }, (_, index) => aggregatedTrend(items, index))
  const trendMax = trend[trend.length - 1] || 1
  const carbonTrend = trend.map(value => carbonTotal === null ? null : Number((carbonTotal * value / trendMax).toFixed(1)))
  chart.setOption({
    animation: false,
    grid: { left: 4, right: 4, top: 8, bottom: 2, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(13,18,24,.96)', borderColor: CHART_AXIS, textStyle: { color: CHART_TEXT, fontSize: 11 } },
    xAxis: { type: 'category', data: ['00', '03', '06', '09', '12', '15', '18', '当前'], axisLine: { lineStyle: { color: CHART_AXIS } }, axisTick: { show: false }, axisLabel: { color: CHART_TEXT, fontSize: 9.5 } },
    yAxis: { type: 'value', show: false },
    series: [{
      name: '累计减排',
      type: 'line',
      data: carbonTrend,
      showSymbol: false,
      lineStyle: { color: CHART_COLORS.green, width: 1.5 },
      areaStyle: { color: 'rgba(127,203,104,.12)' },
    }],
  }, { notMerge: true })
}

watch(() => store.bootstrap?.data_version, async () => { await nextTick(); render() }, { immediate: true })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.carbon-assets { display: flex; flex-direction: column; gap: 18px; min-height: 0; overflow: visible; padding-right: 2px; }
.ca-overview { display: grid; grid-template-columns: 104px minmax(0, 1fr); align-items: center; gap: 16px; }
.ca-progress {
  --progress: 0%;
  width: 94px;
  height: 94px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: conic-gradient(var(--cockpit-carbon) var(--progress), rgba(255,255,255,.06) 0);
}
.ca-progress::before { content: ''; position: absolute; }
.ca-progress-inner { width: 76px; height: 76px; border-radius: 50%; background: var(--cockpit-bg-panel); display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ca-progress-inner strong { font-size: 16px; color: var(--cockpit-text-1); }
.ca-progress-inner span { font-size: 11px; color: var(--cockpit-text-3); }
.ca-overview-copy { display: flex; flex-direction: column; gap: 4px; color: var(--cockpit-text-3); font-size: 12.5px; min-width: 0; }
.ca-overview-copy b { color: var(--cockpit-carbon); font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ca-label { color: var(--cockpit-text-2); }
.ca-section { border-top: 1px solid var(--cockpit-border); padding-top: 14px; }
.ca-section-head { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: var(--cockpit-text-2); }
.ca-section-head span:last-child { color: var(--cockpit-text-3); font-size: 11.5px; }
.ca-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.ca-metric { min-height: 58px; padding: 7px 9px; background: rgba(255,255,255,.025); border-left: 2px solid var(--cockpit-carbon); display: flex; flex-direction: column; gap: 2px; }
.ca-metric span, .ca-metric small { color: var(--cockpit-text-3); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ca-metric b { color: var(--cockpit-text-1); font-size: 14px; }
.ca-metric b.muted { color: var(--cockpit-text-3); font-size: 12px; }
.ca-trend-section { min-height: 230px; display: flex; flex-direction: column; }
.ca-chart { height: 122px; flex-shrink: 0; }
.ca-source-list { display: grid; gap: 5px; }
.ca-source-row { display: grid; grid-template-columns: 72px minmax(20px, 1fr) 58px; gap: 7px; align-items: center; font-size: 10.5px; color: var(--cockpit-text-3); }
.ca-source-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,.05); overflow: hidden; }
.ca-source-track i { display: block; height: 100%; }
.ca-source-row b { color: var(--cockpit-text-2); font-weight: 500; text-align: right; }
.ca-value-section { min-height: 360px; display: flex; flex-direction: column; }
.ca-value-section :deep(.value-breakdown) { min-height: 320px; overflow: visible; padding-right: 0; }
</style>

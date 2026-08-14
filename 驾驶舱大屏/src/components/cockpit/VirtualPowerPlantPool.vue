<!-- 虚拟电厂资源池：三类业务视图共享现有资源与履约数据，不新增独立硬编码业务合同。 -->
<template>
  <section class="vpp-pool">
    <header class="vpp-head">
      <div class="vpp-title-wrap">
        <span class="vpp-accent" />
        <div>
          <h2>虚拟电厂资源池</h2>
          <span>资源聚合、履约能力与调度时间尺度</span>
        </div>
      </div>
      <div class="vpp-capacity">
        <span>已核验可调能力</span>
        <strong class="num-font">{{ adjustableIndicator?.display_value ?? '--' }}</strong>
        <span>{{ adjustableIndicator?.unit ?? 'MW' }}</span>
      </div>
    </header>

    <div class="vpp-tabs" role="tablist" aria-label="虚拟电厂资源池视图">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <div class="vpp-body">
      <div v-if="activeTab === 'topology'" class="vpp-topology">
        <div class="topology-visual" aria-label="资源拓扑">
          <div class="topology-core">
            <span>VPP</span>
            <b class="num-font">{{ totalResources }}</b>
            <small>聚合资源</small>
          </div>
          <div
            v-for="(item, index) in topologyItems"
            :key="item.type"
            class="topology-node"
            :style="nodeStyle(index, topologyItems.length)"
          >
            <i :style="{ background: resourceColor(item.type) }" />
            <span>{{ item.label }}</span>
            <b class="num-font">{{ item.adjustable }}</b>
          </div>
        </div>
        <div class="vpp-kpis">
          <div><span>资源在线率</span><b class="num-font">{{ onlineRate }}</b><small>{{ onlineResources }}/{{ totalResources }} 在线</small></div>
          <div><span>当前聚合功率</span><b class="num-font">{{ totalPower }}</b><small>资源侧净功率</small></div>
          <div><span>生效调度事件</span><b class="num-font">{{ dispatch?.active_event_count ?? 0 }}</b><small>待确认 {{ dispatch?.unconfirmed_event_count ?? 0 }}</small></div>
          <div><span>聚合履约率</span><b class="num-font">{{ fulfillmentRate }}</b><small>平均响应 {{ dispatch?.avg_response_seconds ?? '--' }}s</small></div>
        </div>
      </div>

      <div v-else-if="activeTab === 'aggregator'" class="aggregator-view">
        <div class="ag-summary">
          <div><span>接入资源类型</span><b class="num-font">{{ resourceItems.length }}</b></div>
          <div><span>验证响应容量</span><b class="num-font">{{ dispatch?.actual_response_mw?.toFixed(1) ?? '--' }} MW</b></div>
          <div><span>最大履约偏差</span><b class="num-font" :class="{ warn: (dispatch?.max_deviation_pct ?? 0) > 5 }">{{ dispatch?.max_deviation_pct?.toFixed(1) ?? '--' }}%</b></div>
        </div>
        <div class="ag-list"><ResourceSummary /></div>
      </div>

      <div v-else class="timescale-view">
        <div class="ts-title">响应速度 × 可持续时长 × 可调容量</div>
        <div class="ts-chart">
          <div class="ts-gridline line-12"><span>12h</span></div>
          <div class="ts-gridline line-8"><span>8h</span></div>
          <div class="ts-gridline line-4"><span>4h</span></div>
          <div class="ts-gridline line-0"><span>0h</span></div>
          <div v-for="point in timeScalePoints" :key="point.label" class="ts-column">
            <div class="ts-bubble" :class="{ partial: point.partial }" :style="bubbleStyle(point)">
              <span class="num-font">{{ point.capacity > 0 ? point.capacity.toFixed(1) + 'MW' : 'N/A' }}</span>
            </div>
            <b>{{ point.label }}</b>
            <small>{{ point.source }}</small>
          </div>
        </div>
        <div class="ts-legend"><span><i class="covered" />已覆盖</span><span><i class="partial" />部分覆盖</span><span><i class="boundary" />业务边界</span></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCockpitStore } from '../../stores/cockpit'
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit'
import type { ResourceSummaryItem, ResourceType } from '../../types/cockpit'
import ResourceSummary from './ResourceSummary.vue'

type TabKey = 'topology' | 'aggregator' | 'timescale'
type TimeScalePoint = { label: string; source: string; duration: number; capacity: number; partial?: boolean }

const store = useCockpitStore()
const activeTab = ref<TabKey>('topology')
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'topology', label: '资源拓扑' },
  { key: 'aggregator', label: '聚合能力' },
  { key: 'timescale', label: '时间尺度覆盖' },
]

const resourceItems = computed(() => store.bootstrap?.resource_summary ?? [])
const dispatch = computed(() => store.bootstrap?.dispatch_summary)
const adjustableIndicator = computed(() => store.bootstrap?.indicators.find(item => item.key === 'verified_adjustable_power_mw'))
const totalResources = computed(() => resourceItems.value.reduce((sum, item) => sum + item.resource_count, 0))
const onlineResources = computed(() => resourceItems.value.reduce((sum, item) => sum + item.online_count, 0))
const onlineRate = computed(() => totalResources.value ? `${(onlineResources.value / totalResources.value * 100).toFixed(1)}%` : '--')
const totalPower = computed(() => `${resourceItems.value.reduce((sum, item) => sum + (item.current_power_mw ?? 0), 0).toFixed(1)} MW`)
const fulfillmentRate = computed(() => dispatch.value?.fulfillment_rate_pct === null || dispatch.value?.fulfillment_rate_pct === undefined ? '--' : `${dispatch.value.fulfillment_rate_pct.toFixed(1)}%`)

const topologyItems = computed(() => resourceItems.value.slice(0, 6).map(item => ({
  type: item.resource_type,
  label: RESOURCE_TYPE_LABEL[item.resource_type],
  adjustable: `${item.verified_adjustable_power_mw?.toFixed(1) ?? '--'} MW`,
})))

const timeScalePoints = computed<TimeScalePoint[]>(() => {
  const fastest = resourceItems.value.filter(item => ['storage', 'charging'].includes(item.resource_type))
  const load = resourceItems.value.filter(item => ['load', 'aidc'].includes(item.resource_type))
  const renewable = resourceItems.value.filter(item => ['pv', 'wind'].includes(item.resource_type))
  const sumCapacity = (items: ResourceSummaryItem[]) => items.reduce((sum, item) => sum + (item.verified_adjustable_power_mw ?? 0), 0)
  const maxDuration = (items: ResourceSummaryItem[], fallback: number) => Math.max(fallback, ...items.map(item => item.sustainable_duration_h ?? 0))
  return [
    { label: '秒级', source: '储能 / 充换电', duration: Math.min(1, maxDuration(fastest, .5)), capacity: sumCapacity(fastest) },
    { label: '分钟级', source: '储能 / 可调负荷', duration: maxDuration([...fastest, ...load], 1), capacity: sumCapacity([...fastest, ...load]) },
    { label: '小时级', source: '工商业负荷', duration: maxDuration(load, 1), capacity: sumCapacity(load) },
    { label: '日内', source: '新能源出力', duration: 8, capacity: sumCapacity(renewable), partial: true },
    { label: '日级', source: '光伏预测', duration: 12, capacity: sumCapacity(renewable), partial: true },
    { label: '跨区域', source: '电网协同', duration: 0, capacity: 0, partial: true },
  ]
})

const colors: Record<ResourceType, string> = {
  storage: '#35D6C4', pv: '#E7B34F', wind: '#68A2D8', charging: '#7FCB68',
  load: '#D8AD60', aidc: '#F0645B', microgrid: '#68A2D8', vpp: '#D8AD60',
}

function resourceColor(type: ResourceType) { return colors[type] }
function nodeStyle(index: number, total: number) {
  const angle = -90 + (360 / Math.max(total, 1)) * index
  const radius = 36
  return { left: `${50 + Math.cos(angle * Math.PI / 180) * radius}%`, top: `${50 + Math.sin(angle * Math.PI / 180) * radius}%` }
}
function bubbleStyle(point: TimeScalePoint) {
  const size = Math.max(30, Math.min(52, 26 + point.capacity * .55))
  const ratio = Math.max(0, Math.min(1, point.duration / 12))
  return { '--bubble-size': `${size}px`, '--duration-ratio': ratio }
}
</script>

<style scoped>
.vpp-pool { margin: 0 24px; min-height: 0; display: grid; grid-template-columns: 250px minmax(0, 1fr); grid-template-rows: 52px minmax(0, 1fr); column-gap: 24px; border-top: 1px solid var(--cockpit-border); }
.vpp-head { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; min-width: 0; }
.vpp-title-wrap { display: flex; align-items: center; gap: 10px; }
.vpp-accent { width: 3px; height: 25px; background: var(--cockpit-value); }
.vpp-title-wrap h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--cockpit-text-1); }
.vpp-title-wrap div > span { display: block; color: var(--cockpit-text-3); font-size: 9.5px; margin-top: 1px; }
.vpp-capacity { display: flex; align-items: baseline; gap: 5px; font-size: 10.5px; color: var(--cockpit-text-3); }
.vpp-capacity strong { color: var(--cockpit-value); font-size: 15px; }
.vpp-tabs { display: flex; flex-direction: column; gap: 9px; padding: 6px 0 12px; }
.vpp-tabs button { height: 34px; border: 1px solid var(--cockpit-border); border-radius: 5px; background: var(--cockpit-bg-panel); color: var(--cockpit-text-2); font: inherit; font-size: 12px; text-align: left; padding: 0 12px; cursor: pointer; }
.vpp-tabs button.active { border-color: rgba(216,173,96,.55); background: rgba(216,173,96,.10); color: var(--cockpit-value); }
.vpp-body { min-height: 0; overflow: hidden; padding: 4px 0 8px; }
.vpp-topology { height: 100%; display: grid; grid-template-columns: minmax(310px, .9fr) minmax(0, 1.1fr); gap: 18px; }
.topology-visual { position: relative; min-height: 0; }
.topology-visual::before { content: ''; position: absolute; width: 150px; height: 150px; border: 1px dashed var(--cockpit-border); border-radius: 50%; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.topology-core { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 66px; height: 66px; border-radius: 50%; border: 1px solid rgba(216,173,96,.55); background: rgba(216,173,96,.12); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2; }
.topology-core span { color: var(--cockpit-value); font-weight: 600; font-size: 12px; }
.topology-core b { font-size: 14px; color: var(--cockpit-text-1); }
.topology-core small { font-size: 8.5px; color: var(--cockpit-text-3); }
.topology-node { position: absolute; transform: translate(-50%, -50%); display: grid; grid-template-columns: 7px auto; gap: 2px 5px; align-items: center; min-width: 92px; }
.topology-node::after { content: ''; position: absolute; right: calc(50% + 7px); width: 34px; border-top: 1px dashed var(--cockpit-border); z-index: -1; }
.topology-node i { width: 7px; height: 7px; border-radius: 50%; grid-row: 1 / 3; }
.topology-node span { color: var(--cockpit-text-2); font-size: 10px; white-space: nowrap; }
.topology-node b { color: var(--cockpit-text-1); font-size: 10px; font-weight: 500; }
.vpp-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-content: center; }
.vpp-kpis > div { min-height: 62px; border-left: 2px solid var(--cockpit-value); background: rgba(255,255,255,.025); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.vpp-kpis span, .vpp-kpis small { color: var(--cockpit-text-3); font-size: 11px; }
.vpp-kpis b { color: var(--cockpit-text-1); font-size: 15px; }
.aggregator-view { height: 100%; display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; }
.ag-summary { display: grid; gap: 6px; align-content: center; }
.ag-summary > div { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; border-left: 2px solid var(--cockpit-value); background: rgba(255,255,255,.025); }
.ag-summary span { color: var(--cockpit-text-3); font-size: 10px; }
.ag-summary b { color: var(--cockpit-text-1); font-size: 14px; }
.ag-summary b.warn { color: var(--cockpit-warn); }
.ag-list { min-height: 0; display: flex; }
.ag-list :deep(.resource-summary) { gap: 3px; }
.ag-list :deep(.rs-table th) { padding-block: 3px; font-size: 9.5px; }
.ag-list :deep(.rs-row td) { padding-block: 4px; font-size: 10px; }
.ag-list :deep(.rs-name) { font-size: 10.5px; }
.ag-list :deep(.rs-hint) { display: none; }
.timescale-view { height: 100%; display: grid; grid-template-rows: 22px minmax(0, 1fr) 18px; }
.ts-title { color: var(--cockpit-text-2); font-size: 11px; }
.ts-chart { position: relative; display: grid; grid-template-columns: repeat(6, minmax(80px, 1fr)); gap: 10px; min-width: 620px; padding: 0 18px 0 40px; }
.ts-gridline { position: absolute; left: 34px; right: 12px; border-top: 1px solid var(--cockpit-border); }
.ts-gridline span { position: absolute; right: calc(100% + 5px); top: -7px; font-size: 9px; color: var(--cockpit-text-3); }
.line-12 { top: 28px; }.line-8 { top: calc(33.333% - 1px); }.line-4 { top: calc(66.667% - 31px); }.line-0 { bottom: 60px; }
.ts-column { position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.ts-column b { position: absolute; bottom: 28px; color: var(--cockpit-text-2); font-size: 10.5px; font-weight: 500; white-space: nowrap; }
.ts-column small { position: absolute; bottom: 10px; color: var(--cockpit-text-3); font-size: 9px; white-space: nowrap; }
.ts-bubble { position: absolute; width: var(--bubble-size); height: var(--bubble-size); bottom: calc(60px + var(--duration-ratio) * (100% - 88px)); transform: translateY(50%); border-radius: 50%; background: rgba(53,214,196,.25); border: 1px solid rgba(53,214,196,.55); display: grid; place-items: center; }
.ts-bubble.partial { background: rgba(216,173,96,.20); border-color: rgba(216,173,96,.55); }
.ts-bubble span { font-size: 9px; color: var(--cockpit-text-1); white-space: nowrap; }
.ts-legend { display: flex; gap: 16px; font-size: 9px; color: var(--cockpit-text-3); }
.ts-legend span { display: flex; align-items: center; gap: 5px; }
.ts-legend i { width: 7px; height: 7px; border-radius: 50%; }
.ts-legend .covered { background: var(--cockpit-power); }.ts-legend .partial { background: var(--cockpit-value); }.ts-legend .boundary { background: var(--cockpit-text-3); }

</style>

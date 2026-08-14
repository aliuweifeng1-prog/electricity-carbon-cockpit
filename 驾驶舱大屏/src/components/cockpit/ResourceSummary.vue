<!--
  左侧 · 资源运行（§3.5.1 / §4.4）：
  紧凑表格 + 水平能力条；点击类型在地球高亮，再次点击恢复全部。
-->
<template>
  <div class="resource-summary">
    <CockpitState v-if="store.bootstrapStatus === 'error' && !store.bootstrap" status="error" message="资源运行数据不可用" />
    <CockpitState v-else-if="!items.length && store.bootstrap" status="empty" message="暂无资源运行数据" />
    <table v-else class="rs-table">
      <thead>
        <tr>
          <th class="col-type">资源类型</th>
          <th class="col-online">在线/总数</th>
          <th class="col-power">当前功率</th>
          <th class="col-adj">已核验可调能力</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in items"
          :key="item.resource_type"
          class="rs-row"
          :class="{ highlighted: store.highlightType === item.resource_type }"
          @click="toggleHighlight(item.resource_type)"
        >
          <td class="col-type">
            <i class="rs-dot" :class="`dot-${item.resource_type}`" />
            <span class="rs-name">{{ labelFor(item.resource_type) }}</span>
          </td>
          <td class="col-online num-font">{{ item.online_count }}/{{ item.resource_count }}</td>
          <td class="col-power num-font">{{ formatPower(item.current_power_mw) }}</td>
          <td class="col-adj">
            <div class="adj-bar">
              <span class="adj-fill" :style="{ width: adjPercent(item) + '%' }" />
            </div>
            <div class="adj-meta num-font">
              <span>{{ formatPower(item.verified_adjustable_power_mw, 'MW') }}</span>
              <span v-if="item.sustainable_duration_h !== null"> · {{ formatNullable(item.sustainable_duration_h) }}h</span>
              <span v-if="extraBadge(item)" class="rs-extra" :title="tooltipFor(item)">{{ extraBadge(item) }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="rs-hint">点击类型可在地球上高亮；再次点击恢复全部</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import CockpitState from './CockpitState.vue';
import { formatNullable, formatPower } from '../../utils/format';
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit';
import type { ResourceSummaryItem, ResourceType } from '../../types/cockpit';

const store = useCockpitStore();

const items = computed<ResourceSummaryItem[]>(() => store.bootstrap?.resource_summary ?? []);

function labelFor(type: ResourceType) {
  return RESOURCE_TYPE_LABEL[type] ?? type;
}

function toggleHighlight(type: ResourceType) {
  store.setHighlightType(store.highlightType === type ? null : type);
}

function adjPercent(item: ResourceSummaryItem): number {
  const max = 40;
  return Math.min(100, Math.round(((item.verified_adjustable_power_mw ?? 0) / max) * 100));
}

function extraBadge(item: ResourceSummaryItem): string {
  if (item.resource_type === 'storage') return `SOC ${formatNullable(item.soc_avg_pct, 0)}%`
  if (item.resource_type === 'charging') return `${formatNullable(item.connected_terminal_count, 0)} 桩`
  return ''
}

function tooltipFor(item: ResourceSummaryItem): string {
  const parts: string[] = []
  parts.push(`装机/额定：${formatPower(item.installed_capacity_mw)}`)
  if (item.resource_type === 'storage') parts.push(`容量：${formatNullable(item.energy_capacity_mwh)} MWh · SOC ${formatNullable(item.soc_avg_pct, 0)}%`)
  if (item.resource_type === 'charging') parts.push(`接入终端 ${formatNullable(item.connected_terminal_count, 0)} / 可控 ${formatNullable(item.controllable_terminal_count, 0)}`)
  if (item.resource_type === 'load') parts.push(`基线 ${formatPower(item.baseline_power_mw)} · 可削减 ${formatPower(item.curtailable_power_mw)}`)
  if (item.availability_pct !== null) parts.push(`可用率 ${formatNullable(item.availability_pct, 1)}%`)
  return parts.join('；')
}
</script>

<style scoped>
.resource-summary { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }

.rs-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.rs-table th {
  font-size: 12px;
  color: var(--cockpit-text-3);
  font-weight: 500;
  text-align: left;
  padding: 6px 6px;
  border-bottom: 1px solid var(--cockpit-border);
}
.col-type { width: 40%; }
.col-online { width: 15%; }
.col-power { width: 20%; }
.col-adj { width: 25%; }

.rs-row { cursor: pointer; }
.rs-row td {
  padding: 8px 6px;
  border-bottom: 1px solid rgba(32, 40, 51, 0.5);
  font-size: 13px;
  color: var(--cockpit-text-1);
  vertical-align: middle;
}
.rs-row:hover td { background: rgba(53, 214, 196, 0.05); }
.rs-row.highlighted td { background: rgba(53, 214, 196, 0.12); }

.col-type { display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-storage { background: #35D6C4; }
.dot-pv { background: #E7B34F; }
.dot-wind { background: #68A2D8; }
.dot-charging { background: #7FCB68; }
.dot-load { background: #D8AD60; }
.dot-aidc { background: #F0645B; }
.dot-microgrid { background: #68A2D8; }
.dot-vpp { background: #D8AD60; }
.rs-name { font-size: 14px; font-weight: 500; color: var(--cockpit-text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-table td.col-online, .rs-table td.col-power { font-size: 13px; }

.adj-bar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.06); overflow: hidden; margin-bottom: 4px; }
.adj-fill { display: block; height: 100%; background: var(--cockpit-power); border-radius: 2px; }
.adj-meta { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; color: var(--cockpit-text-2); white-space: nowrap; }

.rs-extra { margin-left: auto; font-size: 11.5px; color: var(--cockpit-text-3); cursor: help; flex-shrink: 0; }

.rs-hint { font-size: 12px; color: var(--cockpit-text-3); margin-top: auto; }
</style>


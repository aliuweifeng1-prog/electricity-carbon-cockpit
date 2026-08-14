<!--
  资源详情抽屉（§4.10）：占用右侧栏，不覆盖地球主体。
  操作：查看实时曲线 / 进入源网荷储充监测 / 进入运营工作台（深链）。
  不提供“下发调度”按钮。
-->
<template>
  <Transition name="drawer">
    <div v-if="detail" class="rd-modal">
      <div class="rd-backdrop" @click="store.clearSelectedResource()" />
      <aside class="resource-drawer">
      <header class="rd-head">
        <div class="rd-title">
          <span class="rd-dot" :class="`status-${detail.operation_status}`" />
          <span class="rd-name">{{ detail.name }}</span>
        </div>
        <button type="button" class="rd-close" aria-label="关闭" @click="store.clearSelectedResource()">×</button>
      </header>

      <div class="rd-meta">
        <span class="rd-tag">{{ RESOURCE_TYPE_LABEL[detail.resource_type] }}</span>
        <span>{{ detail.site_name }}</span>
        <span>{{ detail.region_name }}</span>
        <span class="rd-status" :class="`status-${detail.operation_status}`">{{ statusLabel }}</span>
      </div>

      <div class="rd-grid">
        <div class="rd-cell">
          <span class="rd-label">当前功率</span>
          <span class="rd-value num-font">{{ formatNullable(detail.current_power_mw, 1) }} MW</span>
        </div>
        <div class="rd-cell">
          <span class="rd-label">额定功率</span>
          <span class="rd-value num-font">{{ formatNullable(detail.rated_power_mw, 1) }} MW</span>
        </div>
        <div class="rd-cell">
          <span class="rd-label">负荷率</span>
          <span class="rd-value num-font">{{ formatPercent(detail.load_rate_pct, 1) }}</span>
        </div>
        <div class="rd-cell" v-if="detail.energy_capacity_mwh !== null">
          <span class="rd-label">容量</span>
          <span class="rd-value num-font">{{ formatNullable(detail.energy_capacity_mwh, 1) }} MWh</span>
        </div>
        <div class="rd-cell" v-if="detail.soc_pct !== null">
          <span class="rd-label">SOC</span>
          <span class="rd-value num-font">{{ formatNullable(detail.soc_pct, 0) }}%</span>
        </div>
        <div class="rd-cell" v-if="detail.soh_pct !== null">
          <span class="rd-label">SOH</span>
          <span class="rd-value num-font">{{ formatNullable(detail.soh_pct, 0) }}%</span>
        </div>
      </div>

      <div class="rd-section">
        <div class="rd-sec-title">已核验可调能力</div>
        <div class="rd-adj-row">
          <span>上调 <b class="num-font">{{ formatNullable(detail.verified_adjustable_up_mw, 1) }} MW</b></span>
          <span>下调 <b class="num-font">{{ formatNullable(detail.verified_adjustable_down_mw, 1) }} MW</b></span>
          <span>持续 <b class="num-font">{{ formatNullable(detail.sustainable_duration_h, 1) }}h</b></span>
        </div>
        <div v-if="detail.available_window" class="rd-window">可用时窗：{{ detail.available_window }}</div>
      </div>

      <div class="rd-section">
        <div class="rd-sec-title">今日累计</div>
        <div class="rd-adj-row">
          <span>电量 <b class="num-font">{{ formatNullable(detail.today_energy_mwh, 1) }} MWh</b></span>
          <span>收益 <b class="num-font">{{ formatCurrency(detail.today_revenue_cny) }}</b></span>
          <span>减排 <b class="num-font">{{ formatNullable(detail.today_carbon_reduction_tco2e, 1) }} tCO₂e</b></span>
        </div>
      </div>

      <div class="rd-section">
        <div class="rd-sec-title">站内组态 · 一次接线图（原型）</div>
        <VppTopologyPanel :resource="liveMarker" />
      </div>
      <div class="rd-section" v-if="detail.alerts.length">
        <div class="rd-sec-title">当前告警</div>
        <div v-for="alert in detail.alerts" :key="alert.alert_id" class="rd-alert" :class="`sev-${alert.severity}`">
          <span class="rd-alert-title">{{ alert.title }}</span>
        </div>
      </div>

      <div class="rd-section" v-if="detail.active_dispatch_events.length">
        <div class="rd-sec-title">参与中的调度事件</div>
        <div v-for="ev in detail.active_dispatch_events" :key="ev.event_id" class="rd-alert">
          <span>{{ ev.title }}</span>
          <span class="num-font">{{ formatNullable(ev.target_mw, 1) }} MW · {{ ev.status }}</span>
        </div>
      </div>

      <div class="rd-foot">
        <span class="rd-time">更新 {{ formatBusinessTime(detail.as_of) }} · {{ qualityLabel(detail.quality_status) }}</span>
        <div class="rd-actions">
          <button type="button" class="rd-btn" @click="goMonitor()">查看实时曲线</button>
          <button type="button" class="rd-btn" @click="goMonitor()">源网荷储充监测</button>
          <button type="button" class="rd-btn rd-btn-primary" @click="goOps()">进入运营工作台</button>
        </div>
      </div>
      </aside>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import VppTopologyPanel from './VppTopologyPanel.vue';
import { useCockpitStore } from '../../stores/cockpit';
import { useHostBridge } from '../../composables/useHostBridge';
import { formatBusinessTime, formatCurrency, formatNullable, formatPercent, qualityLabel } from '../../utils/format';
import { RESOURCE_TYPE_LABEL } from '../../types/cockpit';

const store = useCockpitStore();
const bridge = useHostBridge();

const detail = computed(() => store.selectedResource)

/** 实时 marker（SSE 更新后取最新对象，驱动组态图刷新） */
const liveMarker = computed(() =>
  store.markers.find((m) => m.resource_id === store.selectedMarker?.resource_id) ?? store.selectedMarker ?? null,
)

const statusLabel = computed(() => {
  const s = detail.value?.operation_status
  if (!s) return '--'
  switch (s) {
    case 'normal': return '正常'
    case 'warning': return '关注'
    case 'alarm': return '告警'
    case 'offline': return '离线'
    case 'maintenance': return '检修'
    default: return s
  }
})

function goMonitor() {
  if (!detail.value) return
  bridge.requestNavigate('/app/data/monitor', { resource_id: detail.value.resource_id }, detail.value.name)
}

function goOps() {
  if (!detail.value) return
  const path = detail.value.resource_type === 'storage' ? '/app/ops/storage' : '/app/ops/deviation'
  bridge.requestNavigate(path, { resource_id: detail.value.resource_id }, detail.value.name)
}
</script>

<style scoped>
.rd-modal {
  position: absolute;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.rd-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(4, 8, 12, 0.52);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

.resource-drawer {
  position: relative;
  width: min(460px, 92%);
  max-height: 80%;
  z-index: 1;
  background: var(--cockpit-bg-panel);
  border: 1px solid rgba(53, 214, 196, 0.28);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  overflow-y: auto;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
}

.rd-head { display: flex; align-items: center; justify-content: space-between; }
.rd-title { display: flex; align-items: center; gap: 8px; }
.rd-name { font-size: 17px; font-weight: 600; color: var(--cockpit-text-1); }
.rd-dot { width: 8px; height: 8px; border-radius: 50%; }
.rd-dot.status-normal { background: var(--cockpit-carbon); }
.rd-dot.status-warning { background: var(--cockpit-warn); }
.rd-dot.status-alarm { background: var(--cockpit-alert); }
.rd-dot.status-offline, .rd-dot.status-maintenance { background: var(--cockpit-text-3); }
.rd-close {
  width: 26px; height: 26px;
  border: none; background: transparent;
  color: var(--cockpit-text-2); font-size: 20px;
  cursor: pointer; border-radius: 5px;
}
.rd-close:hover { background: rgba(255, 255, 255, 0.08); color: var(--cockpit-text-1); }

.rd-meta { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--cockpit-text-2); flex-wrap: wrap; }
.rd-tag { background: rgba(53, 214, 196, 0.14); color: var(--cockpit-power); padding: 2px 7px; border-radius: 4px; }
.rd-status { margin-left: auto; padding: 2px 7px; border-radius: 4px; }
.rd-status.status-normal { background: rgba(127, 203, 104, 0.14); color: var(--cockpit-carbon); }
.rd-status.status-warning { background: rgba(231, 179, 79, 0.14); color: var(--cockpit-warn); }
.rd-status.status-alarm { background: rgba(240, 100, 91, 0.14); color: var(--cockpit-alert); }

.rd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rd-cell {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rd-label { font-size: 12px; color: var(--cockpit-text-3); }
.rd-value { font-size: 18px; color: var(--cockpit-text-1); }

.rd-section { display: flex; flex-direction: column; gap: 5px; }
.rd-sec-title { font-size: 12.5px; color: var(--cockpit-text-2); border-bottom: 1px solid var(--cockpit-border); padding-bottom: 3px; }
.rd-adj-row { display: flex; gap: 14px; font-size: 12.5px; color: var(--cockpit-text-2); flex-wrap: wrap; }
.rd-adj-row b { color: var(--cockpit-text-1); font-weight: 600; }
.rd-window { font-size: 12px; color: var(--cockpit-warn); }
.rd-alert {
  font-size: 12.5px;
  color: var(--cockpit-text-1);
  border: 1px solid var(--cockpit-border);
  border-left-width: 3px;
  border-radius: 4px;
  padding: 5px 8px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.rd-alert.sev-critical { border-left-color: var(--cockpit-alert); }
.rd-alert.sev-high { border-left-color: var(--cockpit-warn); }

.rd-foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--cockpit-border); }
.rd-time { font-size: 11.5px; color: var(--cockpit-text-3); }
.rd-actions { display: flex; flex-direction: column; gap: 6px; }
.rd-btn {
  border: 1px solid var(--cockpit-border);
  background: transparent;
  color: var(--cockpit-text-2);
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
}
.rd-btn:hover { color: var(--cockpit-text-1); border-color: var(--cockpit-power); }
.rd-btn-primary { background: rgba(53, 214, 196, 0.12); color: var(--cockpit-power); border-color: rgba(53, 214, 196, 0.4); font-weight: 500; }

.drawer-enter-active, .drawer-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.drawer-enter-from, .drawer-leave-to { transform: translateY(12px) scale(0.96); opacity: 0; }
</style>

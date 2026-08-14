<!--
  右侧 · 风险与决策待办（§3.7.3 / §4.9）：
  同一区块按优先级混排告警与 AI 建议，使用不同类型标识；
  一期只允许“查看证据”和“去处理”，通过主平台深链进入工作台，不直接调用设备控制。
-->
<template>
  <div class="risk-queue">
    <CockpitState v-if="store.bootstrapStatus === 'error' && !store.bootstrap" status="error" message="风险数据不可用" />
    <template v-else>
      <div class="rq-todos" v-if="todos.length">
        <button
          v-for="todo in todos"
          :key="todo.todo_id"
          type="button"
          class="todo-item"
          @click="go(todo.handler_path, todo.title)"
        >
          <span class="todo-title">{{ todo.title }}</span>
          <span class="todo-count num-font">{{ todo.count }}</span>
          <span class="todo-arrow">→</span>
        </button>
      </div>

      <div class="rq-section">
        <div class="rq-sec-head"><span>告警</span><span class="rq-count">{{ alerts.length }}</span></div>
        <div v-if="!alerts.length" class="rq-empty">暂无告警</div>
        <div v-for="alert in alerts" :key="alert.alert_id" class="alert-item" :class="`sev-${alert.severity}`">
          <div class="ai-head">
            <span class="ai-badge badge-alert">{{ SEVERITY_LABEL[alert.severity] }}</span>
            <span class="ai-title">{{ alert.title }}</span>
          </div>
          <div class="ai-desc">{{ alert.description }}</div>
          <div class="ai-meta">
            <span>{{ alert.region_name || '--' }}</span>
            <span>{{ formatDuration(alert.duration_seconds) }}</span>
            <span>{{ alert.status === 'open' ? '未处理' : alert.status === 'acknowledged' ? '已确认' : '已解决' }}</span>
            <span v-if="alert.impact_value !== null">{{ formatNullable(alert.impact_value, 1) }} {{ alert.impact_unit || '' }} 影响</span>
          </div>
          <div class="ai-actions" v-if="alert.handler_path">
            <button type="button" class="ai-btn" @click="go(alert.handler_path || '', '告警处理')">去处理</button>
          </div>
        </div>
      </div>

      <div class="rq-section">
        <div class="rq-sec-head"><span>AI 建议</span><span class="rq-count">{{ decisions.length }}</span></div>
        <div v-if="!decisions.length" class="rq-empty">暂无 AI 建议</div>
        <div v-for="decision in decisions" :key="decision.suggestion_id" class="alert-item">
          <div class="ai-head">
            <span class="ai-badge badge-ai" :class="`risk-${decision.risk_level}`">AI·{{ riskLabel(decision.risk_level) }}</span>
            <span class="ai-title">{{ decision.title }}</span>
            <span class="ai-review" :class="`rv-${decision.review_status}`">{{ reviewLabel(decision.review_status) }}</span>
          </div>
          <div class="ai-desc">{{ decision.summary }}</div>
          <div class="ai-evidence" v-if="decision.evidence.length">
            <div class="ev-title" @click="toggleEvidence(decision.suggestion_id)">证据（{{ decision.evidence.length }}）{{ evidenceOpen.has(decision.suggestion_id) ? '收起' : '展开' }}</div>
            <ul v-if="evidenceOpen.has(decision.suggestion_id)" class="ev-list">
              <li v-for="(ev, i) in decision.evidence" :key="i">
                <span class="ev-label">{{ ev.label }}</span>
                <span class="ev-value">{{ ev.value }}</span>
                <span class="ev-src">{{ ev.source_ref }}</span>
              </li>
            </ul>
          </div>
          <div class="ai-meta">
            <span v-if="decision.expected_revenue_cny !== null">预期 {{ formatCurrency(decision.expected_revenue_cny) }}</span>
            <span v-if="decision.expected_carbon_reduction_tco2e !== null">减排 {{ formatNullable(decision.expected_carbon_reduction_tco2e, 1) }} tCO₂e</span>
            <span v-if="decision.confidence !== null">置信 {{ formatPercent(decision.confidence * 100, 0) }}</span>
            <span v-if="decision.rule_version">规则 {{ decision.rule_version }}</span>
          </div>
          <div class="ai-actions">
            <span v-if="decision.review_status === 'expired'" class="ai-expired">建议已过期，仅作参考</span>
            <span v-else-if="decision.review_status === 'rejected'" class="ai-expired">建议已驳回</span>
            <template v-else>
              <button v-if="decision.handler_path" type="button" class="ai-btn" @click="go(decision.handler_path, decision.title)">去处理</button>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import { useHostBridge } from '../../composables/useHostBridge';
import CockpitState from './CockpitState.vue';
import { formatCurrency, formatNullable, formatPercent } from '../../utils/format';
import { SEVERITY_LABEL } from '../../types/cockpit';
import type { CockpitAlert, DecisionSuggestion, RiskLevel, ReviewStatus } from '../../types/cockpit';

const store = useCockpitStore();
const bridge = useHostBridge();
const evidenceOpen = ref<Set<string>>(new Set());

const alerts = computed<CockpitAlert[]>(() => store.bootstrap?.top_alerts ?? [])
const decisions = computed<DecisionSuggestion[]>(() => store.bootstrap?.top_decisions ?? [])
const todos = computed(() => store.bootstrap?.todos ?? [])

function go(path: string, title: string) {
  if (!path) return
  bridge.requestNavigate(path, {}, title)
}

function toggleEvidence(id: string) {
  const next = new Set(evidenceOpen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  evidenceOpen.value = next
}

function riskLabel(level: RiskLevel) {
  return level === 'high' ? '高风险' : level === 'medium' ? '中风险' : '低风险'
}

function reviewLabel(status: ReviewStatus) {
  switch (status) {
    case 'pending': return '待复核'
    case 'approved': return '已复核'
    case 'rejected': return '已驳回'
    case 'expired': return '已过期'
    default: return status
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  return `${(seconds / 3600).toFixed(1)} 小时`
}
</script>

<style scoped>
.risk-queue { display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow-y: auto; padding-right: 6px; flex: 1; }

.rq-todos { display: flex; flex-direction: column; gap: 6px; }
.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(104, 162, 216, 0.08);
  border: 1px solid rgba(104, 162, 216, 0.25);
  border-radius: 5px;
  color: var(--cockpit-text-1);
  font-size: 13px;
  padding: 7px 10px;
  cursor: pointer;
  text-align: left;
}
.todo-item:hover { background: rgba(104, 162, 216, 0.16); }
.todo-title { flex: 1; }
.todo-count { color: var(--cockpit-market); font-weight: 600; }
.todo-arrow { color: var(--cockpit-text-3); }

.rq-section { display: flex; flex-direction: column; gap: 7px; }
.rq-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--cockpit-text-2);
  border-bottom: 1px solid var(--cockpit-border);
  padding-bottom: 4px;
}
.rq-count { font-size: 11.5px; color: var(--cockpit-text-3); }
.rq-empty { font-size: 12.5px; color: var(--cockpit-text-3); padding: 4px 0; }

.alert-item {
  border: 1px solid var(--cockpit-border);
  border-left-width: 3px;
  border-radius: 5px;
  background: var(--cockpit-bg);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.alert-item.sev-critical { border-left-color: var(--cockpit-alert); }
.alert-item.sev-high { border-left-color: var(--cockpit-warn); }
.alert-item.sev-medium { border-left-color: var(--cockpit-market); }
.alert-item.sev-low { border-left-color: var(--cockpit-text-3); }

.ai-head { display: flex; align-items: center; gap: 6px; }
.ai-badge { font-size: 11px; padding: 1px 6px; border-radius: 3px; flex-shrink: 0; }
.badge-alert { background: rgba(240, 100, 91, 0.16); color: var(--cockpit-alert); }
.badge-ai { background: rgba(53, 214, 196, 0.14); color: var(--cockpit-power); }
.badge-ai.risk-high { background: rgba(240, 100, 91, 0.16); color: var(--cockpit-alert); }
.ai-title { font-size: 13.5px; color: var(--cockpit-text-1); flex: 1; }
.ai-review { font-size: 11px; color: var(--cockpit-text-3); }
.ai-review.rv-pending { color: var(--cockpit-warn); }
.ai-review.rv-approved { color: var(--cockpit-carbon); }
.ai-review.rv-expired { color: var(--cockpit-text-3); }

.ai-desc { font-size: 12.5px; color: var(--cockpit-text-2); line-height: 1.55; }
.ai-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--cockpit-text-3); }

.ev-title { font-size: 11.5px; color: var(--cockpit-market); cursor: pointer; }
.ev-list { margin: 0; padding-left: 14px; display: flex; flex-direction: column; gap: 2px; }
.ev-list li { font-size: 11.5px; color: var(--cockpit-text-2); display: flex; gap: 6px; }
.ev-label { color: var(--cockpit-text-3); flex-shrink: 0; }
.ev-value { color: var(--cockpit-text-1); }
.ev-src { color: var(--cockpit-text-3); margin-left: auto; }

.ai-actions { display: flex; justify-content: flex-end; gap: 6px; }
.ai-btn {
  background: rgba(53, 214, 196, 0.12);
  border: 1px solid rgba(53, 214, 196, 0.4);
  color: var(--cockpit-power);
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.ai-btn:hover { background: rgba(53, 214, 196, 0.22); }
.ai-expired { font-size: 11.5px; color: var(--cockpit-text-3); }
</style>

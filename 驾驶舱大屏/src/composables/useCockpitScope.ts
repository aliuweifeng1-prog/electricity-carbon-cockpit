/**
 * 全局范围联动（§6.1）：
 * - 范围变化后所有区块与地球使用同一 scope 重新请求
 * - 响应回传 scope_id / data_version，丢弃范围或版本不匹配的迟到响应
 */
import { computed } from 'vue'
import { useCockpitStore } from '../stores/cockpit'
import type { CockpitScope, ScenarioType, TimeRange } from '../types/cockpit'

export function useCockpitScope() {
  const store = useCockpitStore()

  const scope = computed(() => store.scope)
  const timeRange = computed(() => store.timeRange)
  const scenario = computed(() => store.scenario)

  let changeHandlers: Array<() => void> = []

  function onScopeChange(handler: () => void) {
    changeHandlers.push(handler)
  }

  function changeScope(next: CockpitScope) {
    if (next.id === store.scope.id && next.type === store.scope.type) return
    store.setScope(next)
    // 地图范围复位
    store.setMapScope('country')
    changeHandlers.forEach(h => h())
  }

  function changeTimeRange(next: TimeRange) {
    store.setTimeRange(next)
    changeHandlers.forEach(h => h())
  }

  function changeScenario(next: ScenarioType) {
    store.setScenario(next)
    changeHandlers.forEach(h => h())
  }

  function changeHighlightType(type: string | null) {
    store.setHighlightType(type)
  }

  /** 由地图组件上报的层级（全国/省份/城市） */
  function onMapScopeChanged(mapScope: string) {
    store.setMapScope(mapScope)
  }

  return {
    scope,
    timeRange,
    scenario,
    onScopeChange,
    changeScope,
    changeTimeRange,
    changeScenario,
    changeHighlightType,
    onMapScopeChanged,
  }
}

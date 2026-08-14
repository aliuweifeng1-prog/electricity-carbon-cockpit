<!--
  驾驶舱外壳：顶部双轴联动 + 左电力 + 中央原地球 + 右碳资产 + 底部虚拟电厂资源池。
  负责桥接握手、Bootstrap/资源地图/SSE 生命周期、自动巡检与演示数据横幅。
-->
<template>
  <div ref="canvasHost" class="canvas-host">
    <div class="cockpit-shell" :style="canvasStyle">
      <CockpitHeader />

      <DualAxisLinkage />

      <main class="cockpit-main">
        <OperationsRail />

        <EarthStage />

        <aside class="carbon-rail">
          <header class="rail-titlebar">
            <div><span class="rail-accent" /><h2>碳资产数据看板</h2></div>
            <span>{{ store.bootstrap?.indicators.find(item => item.key === 'today_carbon_reduction_tco2e')?.value_status === 'verified' ? '核验口径' : '核算口径' }}</span>
          </header>
          <section class="carbon-panel"><CarbonAssetPanel /></section>
        </aside>

        <!-- 资源详情抽屉：占用右侧栏，不覆盖地球主体（§4.10） -->
        <ResourceDrawer v-if="store.ui.drawerOpen" />
      </main>

      <VirtualPowerPlantPool />

      <CockpitStatusBar />

      <!-- 高风险一次性提示（§3.8） -->
      <Transition name="toast">
        <div v-if="toastVisible" class="critical-toast" role="alert">
          <span class="ct-dot" />
          当前存在 {{ store.criticalAlertCount }} 条高风险告警，请查看右侧风险队列
          <button type="button" class="ct-close" @click="toastVisible = false">×</button>
        </div>
      </Transition>

      <!-- 演示数据横幅（§4.1：demo 必须持续显示，不能只藏在 tooltip） -->
      <div v-if="store.demoMode || store.session.hostDemoMode" class="demo-banner" title="当前为演示数据模式，未接入真实数据源">演示数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import CockpitHeader from '../components/cockpit/CockpitHeader.vue';
import DualAxisLinkage from '../components/cockpit/DualAxisLinkage.vue';
import OperationsRail from '../components/cockpit/OperationsRail.vue';
import EarthStage from '../components/cockpit/EarthStage.vue';
import CarbonAssetPanel from '../components/cockpit/CarbonAssetPanel.vue';
import VirtualPowerPlantPool from '../components/cockpit/VirtualPowerPlantPool.vue';
import ResourceDrawer from '../components/cockpit/ResourceDrawer.vue';
import CockpitStatusBar from '../components/cockpit/CockpitStatusBar.vue';
import { useCockpitStore } from '../stores/cockpit';
import { useHostBridge } from '../composables/useHostBridge';
import { useCockpitScope } from '../composables/useCockpitScope';
import { useCockpitBootstrap } from '../composables/useCockpitBootstrap';
import { useCockpitEvents } from '../composables/useCockpitEvents';
import { useLogicalCanvas } from '../composables/useLogicalCanvas';
import { fetchCockpitConfig, fetchResourceMap } from '../api/cockpit';
import type { CockpitScope, MapViewMode } from '../types/cockpit';
import type { PlatformInitPayload } from '../types/bridge';

const store = useCockpitStore();
const scopeActions = useCockpitScope();
const bridge = useHostBridge({
  onInit: handleInit,
  onScopeChange: (payload) => {
    if (!payload.scope?.name) return
    scopeActions.changeScope({ type: (payload.scope.type as CockpitScope['type']) || 'all', id: payload.scope.id || 'all', name: payload.scope.name })
  },
  onAuthRefresh: () => { void loadAll() },
  onDispose: () => {
    bootstrap.stop()
    events.stop()
  },
})

// 以 1920×1080 为逻辑画布等比缩放，保证任意全屏分辨率下完整呈现且无整页滚动。
const { container: canvasHost, canvasStyle } = useLogicalCanvas(true)

const bootstrap = useCockpitBootstrap()
const events = useCockpitEvents(() => flags.value.cockpit_v2_sse_enabled && !store.demoMode)

const flags = ref({ cockpit_v2_enabled: true, cockpit_v2_sse_enabled: true } as {
  cockpit_v2_enabled: boolean
  cockpit_v2_sse_enabled: boolean
})
const toastVisible = ref(false)
let toastTimer: number | undefined

async function handleInit(payload: PlatformInitPayload) {
  store.setSession({
    mode: 'embedded',
    ticket: payload.ticket,
    environment: payload.environment || store.session.environment,
    authStatus: payload.demo_mode ? 'ready' : 'pending',
  })
  ;(store.session as unknown as Record<string, unknown>).last_path = (payload as unknown as Record<string, unknown>).last_path ?? null
  if (payload.scope?.name) {
    scopeActions.changeScope({ type: (payload.scope.type as CockpitScope['type']) || 'all', id: payload.scope.id || 'all', name: payload.scope.name })
  }
}

async function loadAll() {
  void bootstrap.load(store.scope)
  try {
    const data = await fetchResourceMap({
      scope_type: store.scope.type,
      scope_id: store.scope.id,
      view_mode: store.viewMode,
      cluster: true,
    })
    store.setResourceMap({
      markers: data.markers,
      clusters: data.clusters,
      quality: data.quality_status,
      as_of: data.as_of,
      data_version: data.data_version,
    })
  } catch {
    store.setResourceMapStatus('error')
  }
}

// ===== 自动巡检（§6.4）：60 秒无操作 → 依次切换视图，用户输入立即停止 =====
const PATROL_IDLE_MS = 60000
const PATROL_STEP_MS = 15000
const patrolCycle: MapViewMode[] = ['resource', 'power', 'alert', 'resource']
let idleTimer: number | undefined
let patrolTimer: number | undefined
let patrolIndex = 0

function resetIdle() {
  if (!bridge.embedded && !store.ui.autoPatrol) {
    if (idleTimer !== undefined) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(startPatrol, PATROL_IDLE_MS)
  }
}

function startPatrol() {
  if (store.ui.autoPatrol) return
  store.setUi({ autoPatrol: true })
  patrolIndex = 0
  store.setViewMode(patrolCycle[0])
  patrolTimer = window.setInterval(() => {
    patrolIndex = (patrolIndex + 1) % patrolCycle.length
    store.setViewMode(patrolCycle[patrolIndex])
  }, PATROL_STEP_MS)
}

function stopPatrol() {
  if (!store.ui.autoPatrol) return
  store.setUi({ autoPatrol: false })
  if (patrolTimer !== undefined) window.clearInterval(patrolTimer)
  patrolTimer = undefined
  resetIdle()
}

function onUserInput() {
  if (store.ui.autoPatrol) stopPatrol()
  else resetIdle()
}

// ===== 一次性高风险提示 =====
function checkCriticalToast() {
  if (!store.demoMode && !store.session.hostDemoMode && store.criticalAlertCount > 0 && !store.ui.criticalToastShown) {
    store.setUi({ criticalToastShown: true })
    toastVisible.value = true
    if (toastTimer !== undefined) window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => { toastVisible.value = false }, 8000)
  }
}

// ===== 生命周期 =====
onMounted(() => {
  void fetchCockpitConfig().then((cfg) => {
    flags.value = cfg
    store.setSession({ authStatus: 'ready' })
  })
  bridge.start()
  scopeActions.onScopeChange(() => { void loadAll() })
  bootstrap.start(() => store.scope)
  void loadAll()
  events.start(store.scope)

  window.addEventListener('pointermove', onUserInput, { passive: true })
  window.addEventListener('click', onUserInput)
  window.addEventListener('keydown', onUserInput)
  resetIdle()

  const check = window.setInterval(checkCriticalToast, 5000)
  ;(window as unknown as Record<string, number>).__cockpitToastCheck = check
})

onBeforeUnmount(() => {
  if (idleTimer !== undefined) window.clearTimeout(idleTimer)
  if (patrolTimer !== undefined) window.clearInterval(patrolTimer)
  if (toastTimer !== undefined) window.clearTimeout(toastTimer)
  const check = (window as unknown as Record<string, number>).__cockpitToastCheck
  if (check) window.clearInterval(check)
  window.removeEventListener('pointermove', onUserInput)
  window.removeEventListener('click', onUserInput)
  window.removeEventListener('keydown', onUserInput)
})
</script>

<style scoped>
.canvas-host {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--cockpit-bg);
}

.cockpit-shell {
  display: grid;
  grid-template-rows: 50px 172px 590px 240px 28px;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
}

.cockpit-main {
  position: relative;
  display: grid;
  grid-template-columns: 372px minmax(0, 1fr) 372px;
  gap: 12px;
  min-height: 0;
  padding: 10px 24px 12px;
}

.carbon-rail {
  display: grid;
  grid-template-rows: 30px minmax(0, 1fr);
  gap: 9px;
  min-height: 0;
}

.rail-titlebar { display: flex; align-items: center; justify-content: space-between; min-width: 0; }
.rail-titlebar > div { display: flex; align-items: center; gap: 8px; }
.rail-accent { width: 3px; height: 18px; background: var(--cockpit-carbon); }
.rail-titlebar h2 { margin: 0; font-size: 14px; font-weight: 600; color: var(--cockpit-text-1); }
.rail-titlebar > span { color: var(--cockpit-text-3); font-size: 10.5px; }

.carbon-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--cockpit-border);
  border-radius: 5px;
  background: var(--cockpit-bg-panel);
  padding: 10px 10px 10px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: rgba(127, 203, 104, 0.45) transparent;
  scrollbar-width: thin;
}

.critical-toast {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(240, 100, 91, 0.14);
  border: 1px solid rgba(240, 100, 91, 0.5);
  color: var(--cockpit-alert);
  font-size: 13.5px;
  padding: 8px 14px;
  border-radius: 6px;
  z-index: 80;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.ct-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--cockpit-alert); }
.ct-close { background: transparent; border: none; color: var(--cockpit-alert); cursor: pointer; font-size: 16px; }

.demo-banner {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 90;
  background: rgba(231, 179, 79, 0.16);
  border: 1px solid rgba(231, 179, 79, 0.6);
  color: var(--cockpit-warn);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.toast-enter-active, .toast-leave-active { transition: opacity 0.25s, transform 0.25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }

</style>

<!-- 顶部栏：品牌、数据新鲜度、时间、全屏与平台入口。 -->
<template>
  <header class="cockpit-header">
    <div class="ch-left">
      <div class="brand-mark" aria-hidden="true" />
      <div class="brand-text">
        <span class="brand-title">荷碳能源 · 电碳协同驾驶舱</span>
        <span v-if="store.demoMode || store.session.hostDemoMode" class="env-badge env-demo">演示数据</span>
        <span v-else-if="!isProduction" class="env-badge env-test">测试环境</span>
      </div>
    </div>

    <div class="ch-right">
      <button type="button" class="freshness" :title="freshnessTitle" @click="freshnessOpen = !freshnessOpen">
        <span class="fresh-dot" :style="{ background: qualityColor(store.overallQuality) }" />
        <span>数据状态：{{ qualityLabel(store.overallQuality) }}</span>
      </button>
      <div v-if="freshnessOpen" class="freshness-pop">
        <div class="fp-row"><span>最后刷新</span><span>{{ formatClock(store.lastRefreshAt) }}</span></div>
        <div class="fp-row"><span>数据版本</span><span class="mono">{{ store.dataVersion || '--' }}</span></div>
        <div class="fp-row" v-if="store.sourceHealth"><span>数据源</span><span>{{ store.sourceHealth.healthy }}/{{ store.sourceHealth.total }} 正常 · 延迟 {{ store.sourceHealth.delayed }} · 不可用 {{ store.sourceHealth.unavailable }}</span></div>
        <div class="fp-row"><span>数据合同</span><span>{{ contractVersion }}</span></div>
      </div>
      <span class="ch-clock mono">{{ nowText }}</span>
      <button type="button" class="ch-btn" @click="onFullscreen">{{ store.ui.fullscreen ? '退出全屏' : '全屏' }}</button>
      <button type="button" class="ch-btn ch-btn-primary" @click="onEnterPlatform">进入平台 →</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useCockpitStore } from '../../stores/cockpit';
import { useHostBridge } from '../../composables/useHostBridge';
import { formatClock, qualityColor, qualityLabel } from '../../utils/format';
import { COCKPIT_CONTRACT_VERSION } from '../../api/cockpit';

const store = useCockpitStore();
const bridge = useHostBridge();

const isProduction = import.meta.env.PROD;
const contractVersion = COCKPIT_CONTRACT_VERSION;
const freshnessOpen = ref(false);
const nowText = ref('');

const freshnessTitle = computed(() => `数据更新时间：${formatClock(store.lastRefreshAt)}`);

function onFullscreen() {
  if (bridge.embedded) {
    bridge.requestFullscreen()
    return
  }
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen?.()
    store.setUi({ fullscreen: true })
  } else {
    void document.exitFullscreen?.()
    store.setUi({ fullscreen: false })
  }
}

function onEnterPlatform() {
  const lastPath = (store.session as unknown as Record<string, unknown>).last_path
  const path = typeof lastPath === 'string' && lastPath ? lastPath : '/app/data/monitor'
  bridge.requestNavigate(path, {}, '电碳协同平台')
}

let clockTimer: number | undefined
function updateClock() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  nowText.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  updateClock()
  clockTimer = window.setInterval(updateClock, 1000)
  document.addEventListener('fullscreenchange', onFsChange)
})
onBeforeUnmount(() => {
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
  document.removeEventListener('fullscreenchange', onFsChange)
})
function onFsChange() {
  store.setUi({ fullscreen: !!document.fullscreenElement })
}
</script>

<style scoped>
.cockpit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--cockpit-border);
  gap: 16px;
  min-width: 0;
}

.ch-left { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.brand-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: conic-gradient(from 220deg, var(--cockpit-power), var(--cockpit-carbon), var(--cockpit-value), var(--cockpit-power));
}
.brand-text { display: flex; align-items: center; gap: 8px; }
.brand-title { font-size: 15px; font-weight: 700; letter-spacing: 0; color: var(--cockpit-text-1); }

.env-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid;
  font-weight: 500;
}
.env-demo { color: var(--cockpit-warn); border-color: rgba(231, 179, 79, 0.5); }
.env-test { color: var(--cockpit-market); border-color: rgba(104, 162, 216, 0.5); }

.ch-right { display: flex; align-items: center; gap: 12px; position: relative; flex-shrink: 0; }
.freshness {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--cockpit-text-2);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}
.fresh-dot { width: 7px; height: 7px; border-radius: 50%; }
.ch-clock { font-size: 12px; color: var(--cockpit-text-1); white-space: nowrap; }
.ch-btn {
  background: var(--cockpit-bg-panel);
  border: 1px solid var(--cockpit-border);
  color: var(--cockpit-text-2);
  font-size: 12px;
  padding: 5px 9px;
  border-radius: 6px;
  cursor: pointer;
}
.ch-btn:hover { color: var(--cockpit-text-1); border-color: var(--cockpit-power); }
.ch-btn-primary { background: rgba(53, 214, 196, 0.12); color: var(--cockpit-power); border-color: rgba(53, 214, 196, 0.4); font-weight: 500; }

.freshness-pop {
  position: absolute;
  top: 36px;
  right: 120px;
  width: 320px;
  background: var(--cockpit-bg-panel);
  border: 1px solid var(--cockpit-border);
  border-radius: 6px;
  padding: 10px 12px;
  z-index: 60;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.fp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--cockpit-text-2); padding: 3px 0; }
.fp-row span:last-child { color: var(--cockpit-text-1); }
.mono { font-family: "Roboto Mono", Consolas, monospace; }

@media (max-width: 1500px) {
  .cockpit-header { padding: 0 16px; gap: 10px; }
  .brand-title { font-size: 14px; }
  .freshness, .ch-btn { font-size: 11px; }
  .ch-clock { font-size: 11px; }
  .ch-right { gap: 7px; }
}

@media (max-width: 1180px) {
  .brand-title { font-size: 13px; }
  .freshness span:last-child { display: none; }
  .ch-btn { padding: 5px 8px; }
}
</style>


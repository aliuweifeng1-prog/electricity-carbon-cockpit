/**
 * Bootstrap 加载（§8.6）：
 * - 初始并行加载 bootstrap 与资源地图
 * - 60s 刷新；失败保留旧值并显示刷新状态，不清空屏幕
 * - 超过时效阈值后本地切换为 stale
 */
import { onBeforeUnmount, ref } from 'vue'
import { fetchBootstrap } from '../api/cockpit'
import { useCockpitStore } from '../stores/cockpit'
import type { CockpitScope } from '../types/cockpit'

export const BOOTSTRAP_INTERVAL_MS = 60000
const STALE_THRESHOLD_MS = 5 * 60 * 1000

export function useCockpitBootstrap() {
  const store = useCockpitStore()
  const loading = ref(false)
  let timer: number | undefined
  let staleTimer: number | undefined

  async function load(scope: CockpitScope): Promise<boolean> {
    if (loading.value) return false
    loading.value = true
    store.setBootstrapStatus('loading')
    try {
      const data = await fetchBootstrap(scope)
      // 范围校验：迟到响应丢弃（§6.1）
      if (data.scope_id !== store.scope.id && data.scope_id !== 'all') return false
      store.setBootstrap(data)
      return true
    } catch {
      // 保留旧值，标记错误；生产环境不加载演示值
      store.setBootstrapStatus(store.bootstrap ? 'stale' : 'error', 'Bootstrap 请求失败')
      return false
    } finally {
      loading.value = false
    }
  }

  function start(scope: () => CockpitScope) {
    void load(scope())
    timer = window.setInterval(() => {
      void load(scope())
    }, BOOTSTRAP_INTERVAL_MS)

    // 本地时效切换 stale（§4.1）
    staleTimer = window.setInterval(() => {
      const data = store.bootstrap
      if (!data || store.bootstrapStatus === 'error') return
      const age = Date.now() - new Date(data.as_of).getTime()
      if (age > STALE_THRESHOLD_MS && store.bootstrapStatus !== 'stale') {
        store.setBootstrapStatus('stale', '数据超过时效阈值')
      }
    }, 30000)
  }

  function stop() {
    if (timer !== undefined) window.clearInterval(timer)
    if (staleTimer !== undefined) window.clearInterval(staleTimer)
    timer = undefined
    staleTimer = undefined
  }

  onBeforeUnmount(stop)

  return { loading, load, start, stop }
}

/**
 * 主平台宿主桥（§7.7）。
 * - 严格 origin：targetOrigin 必须为精确 origin，禁止 '*'
 * - 接收方校验 event.origin / event.source / 版本 / type / payload Schema
 * - 事件处理可重复，不因重复消息执行两次
 */
import { computed, onBeforeUnmount } from 'vue'
import { createBridgeMessage, isValidBridgeShell } from '../types/bridge'
import type { CockpitBridgeMessage, PlatformInitPayload, PlatformScopeChangePayload } from '../types/bridge'
import { useCockpitStore } from '../stores/cockpit'
import { COCKPIT_APP_VERSION, COCKPIT_CONTRACT_VERSION } from '../api/cockpit'
import { setCockpitAuthToken } from '../api/client'

export interface HostBridgeHandlers {
  onInit?: (payload: PlatformInitPayload) => void
  onScopeChange?: (payload: PlatformScopeChangePayload) => void
  onAuthRefresh?: () => void
  onVisibilityChange?: (visible: boolean) => void
  onDispose?: () => void
}

function createNonce(): string {
  const rand = Math.random().toString(36).slice(2, 12)
  return `nonce-${Date.now().toString(36)}-${rand}`
}

/** 是否为嵌入模式：被主平台 iframe 加载（?embed=1 或存在父窗口） */
export function isEmbedded(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') return true
    return window.parent !== window
  } catch {
    return false
  }
}

export function useHostBridge(handlers: HostBridgeHandlers = {}) {
  const store = useCockpitStore()

  /** 精确父窗口 origin：优先 document.referrer，回退同源 */
  const parentOrigin = computed(() => {
    try {
      if (document.referrer) {
        const referrerUrl = new URL(document.referrer)
        if (referrerUrl.origin) return referrerUrl.origin
      }
    } catch {
      /* ignore */
    }
    return window.location.origin
  })

  const embedded = isEmbedded()

  function sendToHost(type: string, payload: unknown) {
    if (!embedded) return
    const message = createBridgeMessage(type, 'cockpit', payload)
    try {
      window.parent?.postMessage(message, parentOrigin.value)
    } catch {
      /* 忽略发送失败，不影响驾驶舱主体 */
    }
  }

  function validatePlatformPayload(type: string, payload: unknown): boolean {
    if (payload === null || typeof payload !== 'object') return false
    const p = payload as Record<string, unknown>
    switch (type) {
      case 'platform:init': {
        const init = p as unknown as PlatformInitPayload
        return typeof init.ticket === 'string' || init.ticket === null
          && (init.scope === null || (typeof init.scope === 'object' && typeof (init.scope as Record<string, unknown>).name === 'string'))
          && typeof init.theme === 'string'
          && typeof init.locale === 'string'
          && typeof init.environment === 'string'
          && typeof init.demo_mode === 'boolean'
          && typeof init.nonce === 'string'
      }
      case 'platform:scope-change': {
        const scope = (p as unknown as PlatformScopeChangePayload).scope
        return !!scope && typeof scope === 'object' && typeof (scope as Record<string, unknown>).name === 'string'
      }
      case 'platform:auth-refresh':
      case 'platform:dispose':
        return true
      case 'platform:visibility-change':
        return typeof p.visible === 'boolean'
      default:
        return false
    }
  }

  function onMessage(event: MessageEvent) {
    // 1) origin 校验
    if (event.origin !== parentOrigin.value) {
      console.warn('[cockpit-bridge] rejected message origin', event.origin)
      return
    }
    // 2) source 校验
    if (event.source !== window.parent) {
      console.warn('[cockpit-bridge] rejected message source')
      return
    }
    const data = event.data as unknown
    // 3) 外壳 Schema 校验
    if (!isValidBridgeShell(data)) {
      console.warn('[cockpit-bridge] rejected invalid shell')
      return
    }
    const msg = data as CockpitBridgeMessage
    if (msg.source !== 'platform') {
      console.warn('[cockpit-bridge] rejected source field', msg.source)
      return
    }
    // 4) type + payload Schema 校验
    if (!validatePlatformPayload(msg.type, msg.payload)) {
      console.warn('[cockpit-bridge] rejected payload schema', msg.type)
      return
    }
    switch (msg.type) {
      case 'platform:init': {
        const init = msg.payload as PlatformInitPayload
        // 临时同源方案：ticket 不可用时接收内存 token（不落持久存储）
        const token = (init as unknown as Record<string, unknown>).access_token
        setCockpitAuthToken(typeof token === 'string' && token ? token : null)
        store.setSession({ hostDemoMode: !!init.demo_mode, ticket: init.ticket, environment: init.environment || store.session.environment })
        handlers.onInit?.(init)
        break
      }
      case 'platform:scope-change':
        handlers.onScopeChange?.(msg.payload as PlatformScopeChangePayload)
        break
      case 'platform:auth-refresh':
        handlers.onAuthRefresh?.()
        break
      case 'platform:visibility-change':
        handlers.onVisibilityChange?.((msg.payload as { visible: boolean }).visible)
        break
      case 'platform:dispose':
        handlers.onDispose?.()
        break
      default:
        break
    }
  }

  function start() {
    if (!embedded) return
    window.addEventListener('message', onMessage)
    // 握手：加载后发送 cockpit:ready，携带随机 nonce（§7.6）
    if (!store.session.nonce) {
      store.setSession({ nonce: createNonce() })
    }
    sendToHost('cockpit:ready', {
      nonce: store.session.nonce,
      app_version: COCKPIT_APP_VERSION,
      contract_version: COCKPIT_CONTRACT_VERSION,
      webgl_available: detectWebGL(),
    })
  }

  function stop() {
    window.removeEventListener('message', onMessage)
  }

  /** 业务深链请求（§6.2）：由主平台校验白名单与权限后跳转 */
  function requestNavigate(path: string, query?: Record<string, string>, title?: string) {
    sendToHost('cockpit:navigate', { path, query, title })
  }

  function requestFullscreen() {
    sendToHost('cockpit:request-fullscreen', {})
  }

  function reportSessionExpired() {
    sendToHost('cockpit:session-expired', {})
  }

  function reportFatal(code: string, message: string) {
    sendToHost('cockpit:fatal', { code, message })
  }

  function notifyScopeChanged(next: { type: string; id: string; name: string }, mapScope?: string) {
    sendToHost('cockpit:scope-changed', { scope: next, map_scope: mapScope })
  }

  function notifyResourceSelected(resourceId: string, scopeId?: string) {
    sendToHost('cockpit:resource-selected', { resource_id: resourceId, scope_id: scopeId })
  }

  onBeforeUnmount(stop)

  return {
    embedded,
    parentOrigin,
    sendToHost,
    start,
    stop,
    requestNavigate,
    requestFullscreen,
    reportSessionExpired,
    reportFatal,
    notifyScopeChanged,
    notifyResourceSelected,
  }
}

/** WebGL 可用性检测（§12.2） */
export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}


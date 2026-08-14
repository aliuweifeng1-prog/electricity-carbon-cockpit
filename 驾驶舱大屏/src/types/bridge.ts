/**
 * 驾驶舱 ↔ 主平台 postMessage 桥接协议（§7.7）。
 * 统一消息外壳：version/type/request_id/timestamp/source/payload。
 * 强制要求：targetOrigin 必须为精确 origin，禁止 '*'；接收方校验 origin、source、版本、type 与 payload。
 */

export const BRIDGE_VERSION = '1.0' as const

export type BridgeSource = 'platform' | 'cockpit'

export interface CockpitBridgeMessage<T = unknown> {
  version: '1.0'
  type: string
  request_id: string
  timestamp: string
  source: BridgeSource
  payload: T
}

/** 子应用 → 主平台 */
export type CockpitToPlatformType =
  | 'cockpit:ready'
  | 'cockpit:navigate'
  | 'cockpit:request-fullscreen'
  | 'cockpit:scope-changed'
  | 'cockpit:resource-selected'
  | 'cockpit:session-expired'
  | 'cockpit:fatal'

/** 主平台 → 子应用 */
export type PlatformToCockpitType =
  | 'platform:init'
  | 'platform:scope-change'
  | 'platform:auth-refresh'
  | 'platform:visibility-change'
  | 'platform:dispose'

/** 业务深链白名单（§6.2），子应用只能请求这些路径 */
export const COCKPIT_NAVIGATE_WHITELIST: string[] = [
  '/app/data/monitor',
  '/app/forecast/overview',
  '/app/ops/bidding',
  '/app/ops/deviation',
  '/app/ops/storage',
  '/app/ops/carbon',
  '/app/ops/revenue',
]

export interface PlatformInitPayload {
  ticket: string | null
  scope: { type: string; id: string; name: string } | null
  theme: string
  locale: string
  environment: string
  demo_mode: boolean
  nonce: string
}

export interface PlatformScopeChangePayload {
  scope: { type: string; id: string; name: string }
  request_id?: string
}

export interface NavigatePayload {
  path: string
  query?: Record<string, string>
  title?: string
}

export interface ResourceSelectedPayload {
  resource_id: string
  scope_id?: string
}

export interface ScopeChangedPayload {
  scope: { type: string; id: string; name: string }
  map_scope?: string
}

export interface ReadyPayload {
  nonce: string
  app_version: string
  contract_version: string
  webgl_available: boolean
}

export interface FatalPayload {
  code: string
  message: string
}

/** 校验业务深链路径是否在白名单内（前缀匹配，避免 /app/ops 越权访问其他模块） */
export function isNavigatePathAllowed(path: string): boolean {
  return COCKPIT_NAVIGATE_WHITELIST.some((allowed) => {
    if (allowed.endsWith('*')) return path.startsWith(allowed.slice(0, -1))
    return path === allowed || path.startsWith(allowed + '?')
  })
}

/** 生成 request_id */
export function createRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `req-${Date.now().toString(36)}-${rand}`
}

export function createBridgeMessage<T>(type: string, source: BridgeSource, payload: T): CockpitBridgeMessage<T> {
  return {
    version: BRIDGE_VERSION,
    type,
    request_id: createRequestId(),
    timestamp: new Date().toISOString(),
    source,
    payload,
  }
}

/** 基础 schema 校验：外壳字段齐全且类型正确 */
export function isValidBridgeShell(value: unknown): value is CockpitBridgeMessage<unknown> {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    msg.version === BRIDGE_VERSION &&
    typeof msg.type === 'string' &&
    typeof msg.request_id === 'string' &&
    typeof msg.timestamp === 'string' &&
    (msg.source === 'platform' || msg.source === 'cockpit') &&
    typeof msg.payload === 'object' &&
    msg.payload !== null
  )
}

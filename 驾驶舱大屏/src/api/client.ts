/**
 * 驾驶舱 API 客户端。
 * 同源部署：主平台 /cockpit-v2/ 与后端 /api/v1/cockpit/* 同源。
 * 生产环境不静默 fallback：失败抛错，由 UI 显示明确的数据状态。
 */
import type { CockpitApiEnvelope } from '../types/cockpit'

const API_BASE = '/api/v1/cockpit'
const DEFAULT_TIMEOUT_MS = 15000

/**
 * 临时同源认证方案（§7.6）：ticket 不可用时由宿主通过 platform:init 传递的短时内存 token。
 * 只保存在内存中，不进入 URL、日志与持久存储。
 */
let cockpitAuthToken: string | null = null

export function setCockpitAuthToken(token: string | null) {
  cockpitAuthToken = token
}


export class CockpitApiError extends Error {
  status: number
  traceId: string | null
  constructor(message: string, status: number, traceId: string | null = null) {
    super(message)
    this.name = 'CockpitApiError'
    this.status = status
    this.traceId = traceId
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cockpitAuthToken ? { Authorization: `Bearer ${cockpitAuthToken}` } : {}),
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new CockpitApiError(`Cockpit API ${res.status}`, res.status)
    }
    const envelope = (await res.json()) as CockpitApiEnvelope<T>
    if (envelope.code !== 200) {
      throw new CockpitApiError(envelope.message || 'Cockpit API error', envelope.code ?? 500, envelope.trace_id ?? null)
    }
    return envelope.data
  } catch (err) {
    if (err instanceof CockpitApiError) throw err
    const cause = err instanceof Error ? err.message : String(err)
    throw new CockpitApiError(`网络异常：${cause}`, 0)
  } finally {
    globalThis.clearTimeout(timer)
  }
}

export function getCockpit<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return request<T>(query ? `${path}?${query}` : path)
}

export function postCockpit<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}


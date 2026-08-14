/**
 * 统一格式化器（§9.6）。
 * 规则：null 显示 `--`，真实 0 显示 0；小数位、千分位、单位统一处理；前端不自行混算单位。
 */

import type { QualityStatus, ValueStatus } from '../types/cockpit'
import { QUALITY_LABEL, VALUE_STATUS_LABEL } from '../types/cockpit'

export function formatNullable(value: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

/** 功率：kW/MW 换算由后端确认，前端只负责展示 */
export function formatPower(value: number | null, unit = 'MW', digits = 1): string {
  if (value === null) return '--'
  const sign = value > 0 && unit === 'MW' ? '+' : ''
  return `${sign}${value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits })} ${unit}`
}

export function formatEnergy(value: number | null, unit = 'MWh', digits = 1): string {
  return formatNullable(value, digits) + (value === null ? '' : ` ${unit}`)
}

/** 金额：元/万元/百万元，tooltip 保留原值 */
export function formatCurrency(value: number | null, digits = 0): string {
  if (value === null) return '--'
  const abs = Math.abs(value)
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)} 亿元`
  if (abs >= 1000000) return `${(value / 1000000).toFixed(2)} 百万元`
  if (abs >= 10000) return `${(value / 10000).toFixed(1)} 万元`
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: digits })}`
}

/** 金额原值（tooltip 使用） */
export function formatCurrencyExact(value: number | null): string {
  if (value === null) return '--'
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
}

export function formatCarbon(value: number | null, digits = 1): string {
  if (value === null) return '--'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} ktCO₂e`
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: digits })} tCO₂e`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '--'
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: digits })}%`
}

/** 业务时间 + 多久前 */
export function formatBusinessTime(iso: string | null): string {
  if (!iso) return '--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  let ago = ''
  if (minutes < 1) ago = '刚刚'
  else if (minutes < 60) ago = `${minutes} 分钟前`
  else if (minutes < 1440) ago = `${Math.floor(minutes / 60)} 小时前`
  else ago = `${Math.floor(minutes / 1440)} 天前`
  return `${formatClock(iso)}（${ago}）`
}

export function formatClock(iso: string | null): string {
  if (!iso) return '--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatShortClock(iso: string | null): string {
  if (!iso) return '--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function qualityLabel(status: QualityStatus): string {
  return QUALITY_LABEL[status] ?? status
}

export function valueStatusLabel(status: ValueStatus): string {
  return VALUE_STATUS_LABEL[status] ?? status
}

/** 数据质量状态颜色（与 §5.1 视觉基调一致） */
export function qualityColor(status: QualityStatus): string {
  switch (status) {
    case 'good': return '#35D6C4'
    case 'partial': return '#68A2D8'
    case 'stale': return '#E7B34F'
    case 'missing': return '#91A0AE'
    case 'demo': return '#E7B34F'
    default: return '#91A0AE'
  }
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#F0645B'
    case 'high': return '#E7B34F'
    case 'medium': return '#68A2D8'
    case 'low': return '#91A0AE'
    default: return '#91A0AE'
  }
}

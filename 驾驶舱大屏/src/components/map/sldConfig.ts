/**
 * 站内一次接线图（组态图）配置生成器 —— VPP 源网荷储原型
 * 基于 @trpz3/sld 渲染引擎（MIT，见 src/vendor/sld/LICENSE）。
 * 自定义图符（光伏组件/逆变器/风机/充电桩）为 SVG 100x100，stroke=currentColor 风格，
 * 与 sld 内置符号库保持一致，注册进 SLDSymbols 后即可被引擎渲染。
 */
import { SLDSymbols } from '../../vendor/sld'
import type { ResourceMarker } from '../../types/cockpit'

export interface SldNode {
  id: string
  symbolId: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  slots?: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] }
  liveData?: Record<string, unknown>
}

export interface SldConnection {
  from: string
  to: string
  type?: 'custom' | 'orthogonal'
  waypoints?: Array<{ x: number; y: number }>
  arrowMode?: 'none' | 'forward' | 'backward' | 'both'
}

export interface SiteSldConfig {
  nodes: SldNode[]
  connections: SldConnection[]
}
export interface SiteSldModel {
  nodes: SldNode[]
  connections: SldConnection[]
  liveData: Record<string, Record<string, unknown>>
}

const CUSTOM_SYMBOLS: Array<{ id: string; name: string; svg: string }> = [
  {
    id: 'pv_panel',
    name: 'PV Array',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="14" y="24" width="72" height="52" rx="3" />
      <path d="M14 40h72M14 56h72M40 24v52M66 24v52" />
      <path d="M50 10v6M30 14l2 4M70 14l2 4" />
    </svg>`,
  },
  {
    id: 'inverter',
    name: 'Inverter',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="16" y="22" width="68" height="56" rx="4" />
      <path d="M28 50c6-12 12-12 18 0s12 12 18 0" />
      <path d="M30 40h12v8H30zM58 60h12v8H58z" />
    </svg>`,
  },
  {
    id: 'wind_turbine',
    name: 'Wind Turbine',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="50" y1="54" x2="50" y2="90" />
      <circle cx="50" cy="54" r="4" />
      <ellipse cx="50" cy="26" rx="36" ry="9" transform="rotate(30 50 54)" />
      <ellipse cx="50" cy="26" rx="36" ry="9" transform="rotate(-30 50 54)" />
      <ellipse cx="50" cy="26" rx="36" ry="9" />
    </svg>`,
  },
  {
    id: 'ev_charger',
    name: 'EV Charger',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="28" y="8" width="44" height="84" rx="6" />
      <path d="M42 22h16" />
      <path d="M36 40h28l-12 16h10L40 74l7-22H34z" />
    </svg>`,
  },
]

let symbolsRegistered = false

/** 注册自定义图符（幂等，仅执行一次） */
export function ensureCustomSymbols() {
  if (symbolsRegistered) return
  for (const symbol of CUSTOM_SYMBOLS) {
    if (!SLDSymbols.some((item) => item.id === symbol.id)) SLDSymbols.push(symbol)
  }
  symbolsRegistered = true
}

const NODE_SIZE = { grid: 80, breaker: 56, meter: 56, transformer: 76, busbar: 26, device: 78 }

function liveStatus(marker: ResourceMarker): string {
  switch (marker.operation_status) {
    case 'alarm': return 'alarm'
    case 'warning': return 'stale'
    case 'offline':
    case 'maintenance': return '#5C6A7D'
    default: return marker.online_status ? 'online' : '#5C6A7D'
  }
}

function branchPower(marker: ResourceMarker, weight: number): string {
  const total = marker.current_power_mw ?? 0
  return `${(total * weight).toFixed(2)} MW`
}

/**
 * 根据资源类型生成一次接线图布局：
 * 电网 → 进线断路器 → 变压器 → 电能表 → 母线 → 各分支（储能/光伏/充电桩/负载等）
 */
export function buildSiteSld(marker: ResourceMarker): SiteSldModel {
  ensureCustomSymbols()

  const branchDefs: Array<{ key: string; breakerId: string; deviceId: string; symbolId: string; name: string; weight: number; slots: SldNode['slots'] }> = []
  const status = liveStatus(marker)

  switch (marker.resource_type) {
    case 'storage':
      branchDefs.push(
        { key: 'battery', breakerId: 'brk_battery', deviceId: 'dev_battery', symbolId: 'battery_bank', name: '储能电池组', weight: 0.55, slots: { bottom: ['P', 'SOC'], right: ['状态'] } },
        { key: 'pv', breakerId: 'brk_pv', deviceId: 'dev_pv', symbolId: 'pv_panel', name: '光伏阵列', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'charging', breakerId: 'brk_charging', deviceId: 'dev_charging', symbolId: 'ev_charger', name: '充电桩', weight: 0.12, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '站用负荷', weight: 0.08, slots: { bottom: ['P'], right: ['状态'] } },
      )
      break
    case 'pv':
      branchDefs.push(
        { key: 'pv', breakerId: 'brk_pv', deviceId: 'dev_pv', symbolId: 'pv_panel', name: '光伏阵列', weight: 0.6, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'inverter', breakerId: 'brk_inv', deviceId: 'dev_inv', symbolId: 'inverter', name: '逆变器', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '站用负荷', weight: 0.15, slots: { bottom: ['P'], right: ['状态'] } },
      )
      break
    case 'charging':
      branchDefs.push(
        { key: 'charging', breakerId: 'brk_charging', deviceId: 'dev_charging', symbolId: 'ev_charger', name: '充电桩 1', weight: 0.4, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'charging2', breakerId: 'brk_charging2', deviceId: 'dev_charging2', symbolId: 'ev_charger', name: '充电桩 2', weight: 0.4, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '站用负荷', weight: 0.2, slots: { bottom: ['P'], right: ['状态'] } },
      )
      break
    case 'wind':
      branchDefs.push(
        { key: 'wind', breakerId: 'brk_wind', deviceId: 'dev_wind', symbolId: 'wind_turbine', name: '风机', weight: 0.75, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '站用负荷', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
      )
      break
    case 'aidc':
    case 'microgrid':
    case 'load':
      branchDefs.push(
        { key: 'storage', breakerId: 'brk_battery', deviceId: 'dev_battery', symbolId: 'battery_bank', name: '储能电池组', weight: 0.35, slots: { bottom: ['P', 'SOC'], right: ['状态'] } },
        { key: 'pv', breakerId: 'brk_pv', deviceId: 'dev_pv', symbolId: 'pv_panel', name: '光伏阵列', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '主负荷', weight: 0.4, slots: { bottom: ['P'], right: ['状态'] } },
      )
      break
    default:
      branchDefs.push(
        { key: 'storage', breakerId: 'brk_battery', deviceId: 'dev_battery', symbolId: 'battery_bank', name: '储能电池组', weight: 0.35, slots: { bottom: ['P', 'SOC'], right: ['状态'] } },
        { key: 'pv', breakerId: 'brk_pv', deviceId: 'dev_pv', symbolId: 'pv_panel', name: '光伏阵列', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'charging', breakerId: 'brk_charging', deviceId: 'dev_charging', symbolId: 'ev_charger', name: '充电桩', weight: 0.15, slots: { bottom: ['P'], right: ['状态'] } },
        { key: 'load', breakerId: 'brk_load', deviceId: 'dev_load', symbolId: 'generic_load', name: '站用负荷', weight: 0.25, slots: { bottom: ['P'], right: ['状态'] } },
      )
  }

  const nodes: SldNode[] = [
    { id: 'grid', symbolId: 'main_grid_utility', name: '大电网', x: 200, y: 120, width: NODE_SIZE.grid, height: NODE_SIZE.grid, slots: { top: ['U'], bottom: ['P'] } },
    { id: 'brk_in', symbolId: 'incoming_breaker', name: '进线断路器', x: 212, y: 250, width: NODE_SIZE.breaker, height: NODE_SIZE.breaker, slots: { right: ['状态'] } },
    { id: 'transformer', symbolId: 'transformer', name: '主变压器', x: 202, y: 360, width: NODE_SIZE.transformer, height: NODE_SIZE.transformer, slots: { left: ['U'] } },
    { id: 'meter', symbolId: 'energy_meter', name: '关口电能表', x: 212, y: 490, width: NODE_SIZE.meter, height: NODE_SIZE.meter, slots: { right: ['状态'] } },
    { id: 'busbar', symbolId: 'busbar', name: '10kV 母线', x: 100, y: 610, width: 480, height: NODE_SIZE.busbar, slots: { top: ['U'] } },
  ]

  const connections: SldConnection[] = [
    { from: 'grid', to: 'brk_in' },
    { from: 'brk_in', to: 'transformer' },
    { from: 'transformer', to: 'meter' },
    { from: 'meter', to: 'busbar' },
  ]

  const branchGap = 120
  const startX = 140
  branchDefs.forEach((branch, index) => {
    const x = startX + index * branchGap
    const breakerId = branch.breakerId
    const deviceId = branch.deviceId
    nodes.push(
      { id: breakerId, symbolId: 'mccb', name: `${branch.name} 断路器`, x, y: 680, width: NODE_SIZE.breaker, height: NODE_SIZE.breaker, slots: { right: ['状态'] } },
      { id: deviceId, symbolId: branch.symbolId, name: branch.name, x: x - 11, y: 790, width: NODE_SIZE.device, height: NODE_SIZE.device, slots: branch.slots },
    )
    connections.push(
      { from: 'busbar', to: breakerId },
      { from: breakerId, to: deviceId },
    )
  })

  const liveData: Record<string, Record<string, unknown>> = {}
  branchDefs.forEach((branch) => {
    liveData[branch.deviceId] = {
      P: branchPower(marker, branch.weight),
      状态: status,
    }
    liveData[branch.breakerId] = { 状态: status === 'offline' ? 'offline' : 'online' }
    if (branch.key === 'battery' || branch.deviceId === 'dev_battery') {
      liveData[branch.deviceId].SOC = marker.soc_pct != null ? `${marker.soc_pct.toFixed(0)}%` : '--'
    }
  })
  liveData.grid = { U: '110 kV', P: branchPower(marker, 1) }
  liveData.brk_in = { 状态: status === 'offline' ? 'offline' : 'online' }
  liveData.transformer = { U: '110/10 kV' }
  liveData.meter = { 状态: status === 'offline' ? 'offline' : 'online' }
  liveData.busbar = { U: '10 kV' }

  return { nodes, connections, liveData }
}


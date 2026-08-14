// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天

/**
 * 设备数据接口定义。
 * 接入真实数据时，只需按此结构提供数组即可。
 */
export type DeviceStatus = 'online' | 'warning' | 'alert' | 'offline';
export type DeviceType = 'energy-storage' | 'photovoltaic' | 'charging' | 'data-center' | 'wind';

export interface Device {
  /** 设备唯一 ID */
  id: string;
  /** 设备名称 */
  name: string;
  /** 经度（度） */
  lng: number;
  /** 纬度（度） */
  lat: number;
  /** 设备类型 */
  type: DeviceType;
  /** 运行状态 */
  status: DeviceStatus;
  /** 负荷率 0–1 */
  load: number;
  /** 当前功率 MW */
  power: number;
  /** SOC 储能荷电状态 0–1（仅储能类设备） */
  soc: number | null;
  /** 今日贡献收益 元 */
  revenue: number;
  /** 所在省/直辖市 */
  region: string;
}

/**
 * 余杭良渚光伏储能电站（专题演示站点）。
 * 点击该站点 → 下钻跳转至本地专题页 cockpit_v2.html。
 */
import type { ResourceCluster, ResourceMarker } from '../types/cockpit'

export const LIANGZHU_STATION_ID = 'liangzhu-pv-storage-001'
export const LIANGZHU_STATION_NAME = '余杭良渚光伏储能电站'
export const LIANGZHU_LNG = 120.0262
export const LIANGZHU_LAT = 30.4025
export const LIANGZHU_COCKPIT_FILE_URL = 'file:///C:/Users/19858/Desktop/work/dtxt/cockpit_v2.html'

export function isLiangzhuStation(id: string | null | undefined): boolean {
  return id === LIANGZHU_STATION_ID
}

export function makeLiangzhuMarker(): ResourceMarker {
  return {
    resource_id: LIANGZHU_STATION_ID,
    site_id: 'SITE-LZ-01',
    name: LIANGZHU_STATION_NAME,
    resource_type: 'storage',
    longitude: LIANGZHU_LNG,
    latitude: LIANGZHU_LAT,
    region_code: '330000',
    region_name: '浙江省',
    operation_status: 'normal',
    online_status: true,
    current_power_mw: 3.6,
    rated_power_mw: 12,
    verified_adjustable_up_mw: 4.5,
    verified_adjustable_down_mw: 5.2,
    sustainable_duration_h: 2.4,
    soc_pct: 68,
    active_dispatch_count: 0,
    highest_alert_severity: null,
    as_of: new Date().toISOString(),
    quality_status: 'demo',
  }
}

export function makeLiangzhuCluster(): ResourceCluster {
  return {
    cluster_id: LIANGZHU_STATION_ID,
    resource_count: 1,
    site_count: 1,
    total_current_power_mw: 3.6,
    total_verified_adjustable_mw: 9.7,
    bounds: {
      min_lon: LIANGZHU_LNG - 0.05,
      min_lat: LIANGZHU_LAT - 0.05,
      max_lon: LIANGZHU_LNG + 0.05,
      max_lat: LIANGZHU_LAT + 0.05,
    },
    region_code: '330000',
    region_name: '浙江省/杭州市/余杭区',
    operation_status: 'normal',
    online_count: 1,
    alarm_count: 0,
    highest_alert_severity: null,
    as_of: new Date().toISOString(),
    quality_status: 'demo',
  }
}

/** 点击站点后下钻跳转到良渚专题页（直接跳转，无浏览器确认） */
export function jumpToLiangzhuCockpit(): void {
  // 驾驶舱本身以 file:// 打开时直接跳转本地文件
  if (window.location.protocol === 'file:') {
    window.location.href = LIANGZHU_COCKPIT_FILE_URL
    return
  }
  // http 页面：直接新标签打开同源专题页（内容与 file:// 一致），
  // 避免浏览器对 file:// 的拦截/确认弹窗
  window.open(`${window.location.origin}${import.meta.env.BASE_URL}cockpit_v2.html`, '_blank')
}
# 第三方开源引用说明（THIRD PARTY NOTICES）

## 1. @trpz3/sld（一次接线图渲染引擎）
- 来源：https://github.com/Trpz3/sld （npm: @trpz3/sld@1.2.0）
- 许可证：MIT（vendored 副本及许可证见 `src/vendor/sld/`）
- 用途：站内组态图/一次接线图渲染；已在 `src/vendor/sld/index.js` 上做最小改动
  （额外导出符号表 `SLDSymbols` 以注册光伏/风机/充电桩/逆变器自定义图符）
- 自定义图符定义见 `src/components/map/sldConfig.ts`

## 2. TangSY/echarts-map-demo（实现模式参考）
- 来源：https://github.com/TangSY/echarts-map-demo
- 许可证：MIT
- 用途：仅参考其「registerMap + setOption」多级下钻模式，未复制其代码与数据；
  下钻实现见 `src/components/map/Map2DStage.vue`

## 3. 行政区划 GeoJSON 数据
- 本地：`src/assets/maps/china.json`、`src/assets/maps/zhejiang.json`（项目原有，DataV GeoAtlas 格式）
- 运行时：`https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json`（DataV.GeoAtlas）
  - 加载逻辑为项目原有 `src/components/map/mapDataAdapter.ts`
  - 数据来源许可请按 DataV.GeoAtlas 官方条款确认（建议商用前替换为自有授权数据）
## 4. maplibre-gl（电网 GIS 地图引擎）
- 来源：https://github.com/maplibre/maplibre-gl （npm: maplibre-gl@6.3.0）
- 许可证：BSD-3-Clause（MIT 兼容的开源可商用许可证）
- 用途：驾驶舱「GIS 地图」模式 WebGIS 渲染引擎；自绘深色底图 + 省级边界 GeoJSON +
  电压等级线路分层 + 站点符号 + 潮流动画 + 区域下钻 + 设备弹窗
- 实现见 `src/components/map/GisMapStage.vue`

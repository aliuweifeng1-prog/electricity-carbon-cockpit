/**
 * ECharts 按需引入（§9.5）：折线、条形、tooltip、legend、dataset、canvas renderer。
 * 不引入全量 echarts 包；普通指标与趋势不使用 Three.js 绘制。
 */
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  CanvasRenderer,
])

export { echarts }

/** 统一图表文字颜色 */
export const CHART_TEXT = '#91A0AE'
export const CHART_AXIS = '#202833'

export const CHART_COLORS = {
  power: '#35D6C4',
  load: '#E8EEF3',
  renewable: '#7FCB68',
  storage: '#35D6C4',
  grid: '#68A2D8',
  charging: '#E7B34F',
  gold: '#D8AD60',
  red: '#F0645B',
  blue: '#68A2D8',
  green: '#7FCB68',
}


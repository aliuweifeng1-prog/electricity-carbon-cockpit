<!--
  站内组态 · 一次接线图面板（原型）
  基于 @trpz3/sld 渲染引擎（MIT，vendored 于 src/vendor/sld），
  按资源类型生成 电网→变压器→母线→储能/光伏/充电桩/负荷 分支拓扑。
-->
<template>
  <div class="vpp-topology">
    <div class="vt-head">
      <span class="vt-name">{{ resource?.name ?? '站内一次接线图（原型）' }}</span>
      <div class="vt-legend">
        <span><i class="vt-dot vt-on" />在线</span>
        <span><i class="vt-dot vt-warn" />关注</span>
        <span><i class="vt-dot vt-alarm" />告警</span>
        <span><i class="vt-dot vt-off" />离线</span>
      </div>
    </div>
    <div v-if="resource" ref="sldEl" class="vt-canvas" />
    <div v-else class="vt-empty">点击地图站点后展示站内一次接线图</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSLDViewer } from '../../vendor/sld'
import { buildSiteSld } from '../map/sldConfig'
import type { ResourceMarker } from '../../types/cockpit'
import type { SiteSldModel } from '../map/sldConfig'

const props = defineProps<{ resource: ResourceMarker | null }>()

const sldEl = ref<HTMLElement | null>(null)
let viewer: {
  updateZoom: (zoom: number) => void
  updateData: (data: Record<string, unknown>) => void
  destroy: () => void
  canvasContainer: HTMLElement
} | null = null
let model: SiteSldModel | null = null
let resizeObserver: ResizeObserver | null = null

/** 图元实际布局范围（含槽位文字），用于初始缩放适配 */
const LAYOUT_BOX = { width: 640, height: 980 }

function destroyViewer() {
  viewer?.destroy()
  viewer = null
  model = null
}

function fitView() {
  if (!viewer || !sldEl.value) return
  const containerWidth = sldEl.value.clientWidth || 400
  const containerHeight = sldEl.value.clientHeight || 280
  const zoom = Math.min(containerWidth / LAYOUT_BOX.width, containerHeight / LAYOUT_BOX.height) * 0.92
  viewer.updateZoom(Math.max(0.05, zoom))
  viewer.canvasContainer.scrollLeft = 90 * zoom
  viewer.canvasContainer.scrollTop = 90 * zoom
}

function renderViewer() {
  destroyViewer()
  if (!props.resource || !sldEl.value) return
  model = buildSiteSld(props.resource)
  viewer = createSLDViewer(sldEl.value, {
    config: { nodes: model.nodes, connections: model.connections },
    liveData: model.liveData,
    showToolbar: false,
    zoom: 0.3,
  }) as unknown as typeof viewer
  fitView()
}

/** 资源对象变化时刷新：同资源仅更新实时数据，切换资源重建图 */
watch(
  () => props.resource,
  (resource, previous) => {
    if (!resource) {
      destroyViewer()
      return
    }
    if (viewer && previous && previous.resource_id === resource.resource_id) {
      model = buildSiteSld(resource)
      viewer.updateData(model.liveData)
      return
    }
    renderViewer()
  },
)

onMounted(() => {
  renderViewer()
  if (sldEl.value) {
    resizeObserver = new ResizeObserver(() => fitView())
    resizeObserver.observe(sldEl.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  destroyViewer()
})
</script>

<style>
@import '../../vendor/sld/style.css';

.vpp-topology .sld-viewer-container {
  background: rgba(10, 14, 20, 0.55);
  font-family: inherit;
}
.vpp-topology .sld-canvas-container {
  background: transparent;
  background-image: none;
}
.vpp-topology .sld-node-symbol { color: #8FC7FF; }
.vpp-topology .sld-connection-line { stroke: #3A5A73; }
</style>

<style scoped>
.vpp-topology {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--cockpit-border);
  border-radius: 6px;
  background: rgba(8, 12, 18, 0.6);
  overflow: hidden;
}
.vt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--cockpit-border);
}
.vt-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cockpit-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vt-legend { display: flex; gap: 8px; font-size: 11px; color: var(--cockpit-text-3); flex-shrink: 0; }
.vt-legend span { display: inline-flex; align-items: center; gap: 3px; }
.vt-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.vt-on { background: #22c55e; }
.vt-warn { background: #eab308; }
.vt-alarm { background: #ef4444; }
.vt-off { background: #5C6A7D; }
.vt-canvas {
  height: 264px;
  min-height: 0;
  border-radius: 0 0 6px 6px;
}
.vt-empty {
  height: 264px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: var(--cockpit-text-3);
}
</style>
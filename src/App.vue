<!--
  SPDX-License-Identifier: GPL-3.0-or-later
  作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
-->
<template>
  <main class="map-page">
    <CockpitMap v-if="isEmbed" />
    <EarthChinaMap v-else />
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EarthChinaMap from './components/map/EarthChinaMap.vue';
import CockpitMap from './components/embed/CockpitMap.vue';

/**
 * 嵌入模式：URL 带 ?embed=1 时，渲染驾驶舱地图（地球优先 + 滚轮层级缩放 + 设备标记）。
 * 供驾驶舱 iframe 调用。
 */
const isEmbed = computed(() => {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
});
</script>

<style scoped>
.map-page {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000201;
}
</style>

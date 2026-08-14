// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 子应用构建配置（§7.8）：
// - base 固定为 /cockpit-v2/（与主平台同源部署）
// - manifest 供主平台/发布管线使用
// - 生产关闭 sourcemap
// - 大依赖按 vendor 分包，改善首屏与长期缓存（§12.1）
export default defineConfig({
  base: '/cockpit-v2/',
  plugins: [vue()],
  build: {
    manifest: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          echarts: ['echarts/core'],
          vue: ['vue', 'pinia'],
        },
      },
    },
  },
});

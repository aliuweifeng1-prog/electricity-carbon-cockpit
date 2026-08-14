/**
 * 逻辑画布（§3.2.1）：展厅屏以 1920×1080 为逻辑画布等比缩放。
 * 平台内嵌预览模式可使用自适应网格，不强制逻辑画布缩放。
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

export const LOGICAL_WIDTH = 1920
export const LOGICAL_HEIGHT = 1080

export function useLogicalCanvas(enabled = true) {
  const container = ref<HTMLElement | null>(null)
  const scale = ref(1)

  function measure() {
    const el = container.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    scale.value = Math.min(rect.width / LOGICAL_WIDTH, rect.height / LOGICAL_HEIGHT)
  }

  const canvasStyle = computed(() => {
    if (!enabled) return {}
    return {
      width: `${LOGICAL_WIDTH}px`,
      height: `${LOGICAL_HEIGHT}px`,
      position: 'absolute' as const,
      left: '50%',
      top: '50%',
      transform: `translate(-50%, -50%) scale(${scale.value})`,
      transformOrigin: 'center center',
    }
  })

  let observer: ResizeObserver | undefined

  onMounted(() => {
    measure()
    if (container.value && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure())
      observer.observe(container.value)
    }
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { container, scale, canvasStyle }
}

/**
 * @trpz3/sld 类型声明（vendored，MIT）
 */
export interface SldSymbolDefinition {
  id: string
  name: string
  svg: string
}

export const SLDSymbols: SldSymbolDefinition[]

export interface SldNodeInput {
  id: string
  symbolId: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  slots?: Record<string, string[] | undefined>
  liveData?: Record<string, unknown>
  statusRequired?: boolean
  status?: string
}

export interface SldConnectionInput {
  from: string
  to: string
  type?: 'custom' | 'orthogonal'
  waypoints?: Array<{ x: number; y: number }>
  arrowMode?: 'none' | 'forward' | 'backward' | 'both'
}

export interface SLDViewerOptions {
  config?: { nodes?: SldNodeInput[]; connections?: SldConnectionInput[] }
  liveData?: Record<string, Record<string, unknown>>
  zoom?: number
  showToolbar?: boolean
  hideSlotKeys?: boolean
  poll?: { interval?: number; fetch?: () => Promise<Record<string, unknown>> }
}

export interface SLDViewerInstance {
  container: HTMLElement
  state: { nodes: unknown[]; connections: unknown[]; zoom: number }
  canvasContainer: HTMLElement
  updateZoom(zoom: number): void
  updateData(data: Record<string, Record<string, unknown>>): void
  toggleFullscreen(): void
  render(): void
  startPolling(): void
  stopPolling(): void
  destroy(): void
}

export function createSLDViewer(container: HTMLElement | string, options?: SLDViewerOptions): SLDViewerInstance

declare class SLDViewer implements SLDViewerInstance {
  constructor(container: HTMLElement | string, options?: SLDViewerOptions)
  container: HTMLElement
  state: { nodes: unknown[]; connections: unknown[]; zoom: number }
  canvasContainer: HTMLElement
  updateZoom(zoom: number): void
  updateData(data: Record<string, Record<string, unknown>>): void
  toggleFullscreen(): void
  render(): void
  startPolling(): void
  stopPolling(): void
  destroy(): void
}

export default SLDViewer
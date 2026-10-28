// Small helpers shared by the canvas-rendered charts.

/**
 * Sizes a canvas for the device pixel ratio so lines stay sharp on HiDPI
 * screens, and returns a context that draws in CSS pixels.
 */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  return ctx
}

/** Theme colours live in styles.css as custom properties; canvases read them from there. */
export function themeColors() {
  const style = getComputedStyle(document.documentElement)
  const v = (name: string) => style.getPropertyValue(name).trim()
  return {
    text: v('--text'),
    muted: v('--muted'),
    grid: v('--grid'),
    panel: v('--panel'),
    actual: v('--actual'),
    forecast: v('--forecast'),
    overFill: v('--over-fill'),
    underFill: v('--under-fill'),
    accent: v('--accent'),
    empty: v('--cell-empty'),
    mono: v('--font-mono'),
  }
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

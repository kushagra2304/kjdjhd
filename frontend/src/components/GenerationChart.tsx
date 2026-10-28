// Actual vs forecast, drawn on a <canvas> with D3 scales and d3-zoom.
// Canvas keeps redraws cheap while zooming and panning; the overview strip
// underneath is SVG with a d3-brush, kept in sync with the zoom both ways.
import {
  area, bisector, brushX, line, scaleLinear, scaleTime, select, zoom, zoomIdentity,
  type ZoomBehavior, type ZoomTransform,
} from 'd3'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { prefersReducedMotion, prepareCanvas, themeColors } from '../canvas'
import { errorBands, powerTicks, timeTicks, type ChartPoint } from '../chartData'
import { formatAxisTick, formatDateTime, formatPower } from '../format'
import { useElementWidth } from '../hooks'

const MARGIN = { top: 14, right: 16, bottom: 28, left: 44 }
const HEIGHT = 380
const OVERVIEW_HEIGHT = 52
const MIN_VISIBLE_MS = 6 * 3600 * 1000 // deepest zoom shows six hours
const TOOLTIP_WIDTH = 230

export function GenerationChart({ data }: { data: ChartPoint[] }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brushRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [hover, setHover] = useState<number | null>(null)

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const first = data[0].time
  const last = data[data.length - 1].time

  const baseX = useMemo(() => scaleTime().domain([first, last]).range([0, innerW]), [first, last, innerW])
  const x = useMemo(() => transform.rescaleX(baseX), [transform, baseX])
  const yTicks = useMemo(() => powerTicks(Math.max(...data.map((d) => Math.max(d.actual, d.forecastLine ?? 0)))), [data])
  const y = useMemo(() => scaleLinear().domain([0, yTicks[yTicks.length - 1]]).range([innerH, 0]), [yTicks, innerH])
  const bands = useMemo(() => errorBands(data), [data])

  // Zoom on the canvas (drag to pan, Ctrl/⌘ + wheel to zoom) and a brush on the overview, each driving the other.
  useEffect(() => {
    const canvas = canvasRef.current
    const brushNode = brushRef.current
    if (!canvas || !brushNode || innerW <= 0) return
    const brush = brushX().extent([[0, 0], [innerW, OVERVIEW_HEIGHT]])
    const brushSel = select(brushNode)
    const canvasSel = select(canvas)
    let fromBrush = false

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, Math.max(1, (last - first) / MIN_VISIBLE_MS)])
      .extent([[0, 0], [innerW, innerH]])
      .translateExtent([[0, 0], [innerW, innerH]])
      // Plain wheel keeps scrolling the page; Ctrl/⌘ + wheel zooms the chart.
      .filter((event: MouseEvent | WheelEvent) => (event.type === 'wheel' ? event.ctrlKey || event.metaKey : !event.button))
      .on('zoom', (event: { transform: ZoomTransform }) => {
        setTransform(event.transform)
        if (!fromBrush) brushSel.call(brush.move, [event.transform.invertX(0), event.transform.invertX(innerW)])
      })

    brush.on('brush end', (event: { selection: [number, number] | null; sourceEvent: unknown; type: string }) => {
      if (!event.sourceEvent) return // moved by the zoom handler above
      const sel = event.selection
      if (!sel || sel[1] - sel[0] < 2) {
        if (event.type === 'end') canvasSel.call(zoomBehavior.transform, zoomIdentity)
        return
      }
      fromBrush = true
      canvasSel.call(zoomBehavior.transform, zoomIdentity.scale(innerW / (sel[1] - sel[0])).translate(-sel[0], 0))
      fromBrush = false
    })

    canvasSel.call(zoomBehavior).on('dblclick.zoom', null)
    brushSel.call(brush)
    zoomRef.current = zoomBehavior
    canvasSel.call(zoomBehavior.transform, zoomIdentity) // a new window always starts fully zoomed out
    return () => {
      canvasSel.on('.zoom', null)
      brush.on('brush end', null)
    }
  }, [first, last, innerW, innerH])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const ctx = prepareCanvas(canvas, width, HEIGHT)
    const c = themeColors()
    const [d0, d1] = x.domain().map((d) => d.getTime())

    ctx.save()
    ctx.translate(MARGIN.left, MARGIN.top)
    ctx.font = `11px ${c.mono}`
    ctx.lineWidth = 1

    // Grid and axis labels.
    ctx.fillStyle = c.muted
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const tick of yTicks) {
      const py = Math.round(y(tick)) + 0.5
      ctx.strokeStyle = c.grid
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(innerW, py); ctx.stroke()
      ctx.fillText(`${tick / 1000}`, -10, py)
    }
    ctx.textAlign = 'left'
    ctx.fillText('GW', -MARGIN.left + 4, -4)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const tick of timeTicks(d0, d1)) {
      const px = Math.round(x(tick)) + 0.5
      ctx.strokeStyle = c.grid
      ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, innerH); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillText(formatAxisTick(tick), px, innerH + 10)
    }

    ctx.beginPath(); ctx.rect(0, 0, innerW, innerH); ctx.clip()

    // Gap between the lines: warm where the forecast promised too much, cool where too little.
    for (const over of [true, false]) {
      ctx.beginPath()
      for (const band of bands) {
        if (band.over !== over) continue
        band.points.forEach(([t, v], i) => (i === 0 ? ctx.moveTo(x(t), y(v)) : ctx.lineTo(x(t), y(v))))
        ctx.closePath()
      }
      ctx.fillStyle = over ? c.overFill : c.underFill
      ctx.fill()
    }

    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.strokeStyle = c.forecast
    ctx.beginPath()
    line<ChartPoint>().defined((d) => d.forecastLine !== null).x((d) => x(d.time)).y((d) => y(d.forecastLine!)).context(ctx)(data)
    ctx.stroke()
    ctx.strokeStyle = c.actual
    ctx.beginPath()
    line<ChartPoint>().x((d) => x(d.time)).y((d) => y(d.actual)).context(ctx)(data)
    ctx.stroke()

    if (hover !== null) {
      const p = data[hover]
      const px = x(p.time)
      ctx.strokeStyle = c.muted
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, innerH); ctx.stroke()
      const dots: [number, string][] = [[p.actual, c.actual]]
      if (p.forecast !== null) dots.push([p.forecast, c.forecast])
      for (const [value, color] of dots) {
        ctx.beginPath(); ctx.arc(px, y(value), 4.5, 0, 2 * Math.PI)
        ctx.fillStyle = color; ctx.fill()
        ctx.lineWidth = 2; ctx.strokeStyle = c.panel; ctx.stroke()
      }
    }
    ctx.restore()
  }, [data, bands, x, y, yTicks, width, innerW, innerH, hover])

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const px = e.nativeEvent.offsetX - MARGIN.left
    if (px < 0 || px > innerW) return setHover(null)
    setHover(bisector((d: ChartPoint) => d.time).center(data, x.invert(px).getTime()))
  }

  /** Zoom buttons: a factor zooms around the centre, 'reset' shows the whole window. */
  const zoomBy = (factor: number | 'reset') => {
    const behavior = zoomRef.current
    if (!canvasRef.current || !behavior) return
    const sel = select(canvasRef.current)
    const duration = prefersReducedMotion() ? 0 : 250
    if (factor === 'reset') sel.transition().duration(duration).call(behavior.transform, zoomIdentity)
    else sel.transition().duration(duration).call(behavior.scaleBy, factor)
  }

  const overview = useMemo(() => {
    const oy = scaleLinear().domain(y.domain()).range([OVERVIEW_HEIGHT - 2, 4])
    return {
      actual: area<ChartPoint>().x((d) => baseX(d.time)).y0(OVERVIEW_HEIGHT).y1((d) => oy(d.actual))(data) ?? '',
      forecast: line<ChartPoint>().defined((d) => d.forecastLine !== null).x((d) => baseX(d.time)).y((d) => oy(d.forecastLine!))(data) ?? '',
    }
  }, [data, baseX, y])

  const [v0, v1] = x.domain()
  const zoomed = transform.k > 1.001
  const point = hover !== null ? data[hover] : null
  const tipX = point ? MARGIN.left + x(point.time) : 0
  const tipLeft = tipX + 14 + TOOLTIP_WIDTH > width ? tipX - 14 - TOOLTIP_WIDTH : tipX + 14

  return (
    <div className="gen-chart" ref={wrapRef}>
      <div className="chart-toolbar">
        <div className="legend">
          <span><i className="key key-line key-actual" />Actual</span>
          <span><i className="key key-line key-forecast" />Forecast</span>
          <span><i className="key key-fill key-over" />Over-forecast (shortfall risk)</span>
          <span><i className="key key-fill key-under" />Under-forecast</span>
        </div>
        <div className="zoom-controls" role="group" aria-label="Zoom">
          <span className="range-readout">{formatDateTime(v0.getTime())} → {formatDateTime(v1.getTime())}</span>
          <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.8)} disabled={!zoomed} aria-label="Zoom out">−</button>
          <button type="button" className="icon-btn" onClick={() => zoomBy(1.8)} aria-label="Zoom in">+</button>
          <button type="button" className="icon-btn icon-btn-text" onClick={() => zoomBy('reset')} disabled={!zoomed}>Reset</button>
        </div>
      </div>

      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className={zoomed ? 'is-zoomed' : undefined}
          role="img"
          aria-label="Line chart of actual and forecast wind generation"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={() => zoomBy('reset')}
        />
        {point && (
          <div className="tooltip" style={{ left: tipLeft, top: MARGIN.top + 6, width: TOOLTIP_WIDTH }}>
            <div className="tooltip-title">{formatDateTime(point.time)} UTC</div>
            <div className="tooltip-row"><i className="key key-dot key-actual" />Actual<strong>{formatPower(point.actual)}</strong></div>
            <div className="tooltip-row"><i className="key key-dot key-forecast" />Forecast<strong>{formatPower(point.forecast)}</strong></div>
            {point.error !== null ? (
              <>
                <div className={`tooltip-row tooltip-error ${point.error > 0 ? 'is-over' : 'is-under'}`}>
                  Error<strong>{formatPower(point.error, { signed: true })}</strong>
                </div>
                <div className="tooltip-note">Published {formatDateTime(point.publishTime!)}</div>
              </>
            ) : (
              <div className="tooltip-note">
                {new Date(point.time).getUTCMinutes() === 30
                  ? 'Forecasts are hourly; none for :30 periods'
                  : 'No forecast available at this horizon'}
              </div>
            )}
          </div>
        )}
      </div>

      <svg className="overview" width={width} height={OVERVIEW_HEIGHT + 4} aria-label="Overview: drag to choose the visible range">
        <g transform={`translate(${MARGIN.left},0)`}>
          <path d={overview.actual} className="overview-actual" />
          <path d={overview.forecast} className="overview-forecast" />
          <g ref={brushRef} className="brush" />
        </g>
      </svg>
      <p className="chart-hint">Drag the chart to pan · Ctrl/⌘ + scroll to zoom · drag in the strip above to pick a range · double-click to reset</p>
    </div>
  )
}

// Day x hour-of-day grid of forecast error for the whole month, drawn on canvas.
// Red = forecast too high (shortfall risk), blue = too low. Click a day to open it.
import { interpolateRdBu, scaleDiverging } from 'd3'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { prepareCanvas, themeColors } from '../canvas'
import { buildHeatmap } from '../chartData'
import { formatDateTime, formatHours, formatPower } from '../format'
import { useElementWidth } from '../hooks'
import type { SeriesPoint } from '../types'

const MARGIN = { top: 6, right: 8, bottom: 26, left: 40 }
const CELL_H = 11
const GAP = 1
const TOOLTIP_WIDTH = 220
const dayLabel = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' })

interface ErrorHeatmapProps {
  series: SeriesPoint[]
  horizon: number
  selected: { start: number; end: number } // epoch ms of the main chart's window
  onSelectDay: (dayStartMs: number) => void
}

export function ErrorHeatmap({ series, horizon, selected, onSelectDay }: ErrorHeatmapProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null)

  const map = useMemo(() => buildHeatmap(series), [series])
  // Diverging scale: +scaleMax -> deep red, 0 -> neutral, -scaleMax -> deep blue.
  const color = useMemo(() => scaleDiverging(interpolateRdBu).domain([map.scaleMax, 0, -map.scaleMax]).clamp(true), [map.scaleMax])
  const height = MARGIN.top + 24 * CELL_H + MARGIN.bottom
  const colW = map.days.length ? Math.max(4, (width - MARGIN.left - MARGIN.right) / map.days.length) : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const ctx = prepareCanvas(canvas, width, height)
    const c = themeColors()
    ctx.save()
    ctx.translate(MARGIN.left, MARGIN.top)
    ctx.font = `10px ${c.mono}`

    map.cells.forEach((column, d) => {
      column.forEach((cell, h) => {
        ctx.fillStyle = cell ? color(cell.error) : c.empty
        ctx.fillRect(d * colW, h * CELL_H, colW - GAP, CELL_H - GAP)
      })
    })

    // Outline the days shown in the main chart.
    const inWindow = map.days.map((day, i) => [day, i] as const).filter(([day]) => day + 86_400_000 > selected.start && day <= selected.end)
    if (inWindow.length && inWindow.length < map.days.length) {
      const firstCol = inWindow[0][1]
      const lastCol = inWindow[inWindow.length - 1][1]
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 2
      ctx.strokeRect(firstCol * colW - 1.5, -1.5, (lastCol - firstCol + 1) * colW + 2, 24 * CELL_H + 2)
    }
    if (hover) {
      ctx.strokeStyle = c.text
      ctx.lineWidth = 1.5
      ctx.strokeRect(hover.day * colW - 0.5, hover.hour * CELL_H - 0.5, colW, CELL_H)
    }

    ctx.fillStyle = c.muted
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const h of [0, 6, 12, 18]) ctx.fillText(`${String(h).padStart(2, '0')}:00`, -6, h * CELL_H + CELL_H / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const every = colW >= 22 ? 1 : colW >= 12 ? 2 : 5
    map.days.forEach((day, i) => {
      if (i % every === 0) ctx.fillText(dayLabel.format(day), i * colW + colW / 2, 24 * CELL_H + 8)
    })
    ctx.restore()
  }, [map, color, width, height, colW, hover, selected])

  const cellAt = (e: MouseEvent<HTMLCanvasElement>) => {
    const day = Math.floor((e.nativeEvent.offsetX - MARGIN.left) / colW)
    const hour = Math.floor((e.nativeEvent.offsetY - MARGIN.top) / CELL_H)
    return day >= 0 && day < map.days.length && hour >= 0 && hour < 24 ? { day, hour } : null
  }

  const cell = hover ? map.cells[hover.day][hover.hour] : null
  const tipX = hover ? MARGIN.left + (hover.day + 1) * colW + 10 : 0
  const tipLeft = tipX + TOOLTIP_WIDTH > width ? tipX - colW - 20 - TOOLTIP_WIDTH : tipX
  const legendStops = Array.from({ length: 11 }, (_, i) => color(map.scaleMax - (i / 10) * 2 * map.scaleMax)).join(', ')

  return (
    <div className="heatmap" ref={wrapRef}>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Heatmap of forecast error by day and hour at ${formatHours(horizon)} horizon`}
          onPointerMove={(e) => setHover(cellAt(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const target = cellAt(e)
            if (target) onSelectDay(map.days[target.day])
          }}
        />
        {hover && (
          <div className="tooltip" style={{ left: tipLeft, top: MARGIN.top + hover.hour * CELL_H - 8, width: TOOLTIP_WIDTH }}>
            {cell ? (
              <>
                <div className="tooltip-title">{formatDateTime(cell.time)} UTC</div>
                <div className="tooltip-row"><i className="key key-dot key-actual" />Actual<strong>{formatPower(cell.actual)}</strong></div>
                <div className="tooltip-row"><i className="key key-dot key-forecast" />Forecast<strong>{formatPower(cell.forecast)}</strong></div>
                <div className={`tooltip-row tooltip-error ${cell.error > 0 ? 'is-over' : 'is-under'}`}>
                  Error<strong>{formatPower(cell.error, { signed: true })}</strong>
                </div>
              </>
            ) : (
              <div className="tooltip-note">No forecast at {formatHours(horizon)} for this hour</div>
            )}
            <div className="tooltip-note">Click to open this day</div>
          </div>
        )}
      </div>
      <div className="heatmap-legend">
        <span>{formatPower(-map.scaleMax, { signed: true })} under</span>
        <i style={{ background: `linear-gradient(to left, ${legendStops})` }} />
        <span>over {formatPower(map.scaleMax, { signed: true })}</span>
      </div>
    </div>
  )
}

// Error vs forecast horizon. D3 computes scales and paths; React renders the SVG.
// The selected-horizon marker can be dragged along the chart and stays in sync
// with the slider in the controls.
import { area, line, scaleLinear } from 'd3'
import { useRef, useState, type PointerEvent } from 'react'
import { horizonTakeaway } from '../chartData'
import { formatHours, formatPower } from '../format'
import { useElementWidth } from '../hooks'
import type { HorizonErrorPoint } from '../types'

const MARGIN = { top: 34, right: 20, bottom: 40, left: 44 }
const HEIGHT = 300
const X_TICKS = [0, 6, 12, 18, 24, 30, 36, 42, 48]

// The day-ahead auction closes around midday the day before delivery, so
// realistic purchase decisions are made 12-36h ahead.
const DAY_AHEAD_WINDOW = { from: 12, to: 36 }

interface HorizonErrorChartProps {
  rows: HorizonErrorPoint[]
  selectedHorizon: number
  horizonMax: number
  onHorizonChange: (horizon: number) => void
}

type ValidRow = HorizonErrorPoint & { mae: number; p90_abs_error: number; bias: number }

export function HorizonErrorChart({ rows, selectedHorizon, horizonMax, onHorizonChange }: HorizonErrorChartProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState(false)

  const valid = rows.filter((r): r is ValidRow => r.count > 0 && r.mae !== null && r.p90_abs_error !== null && r.bias !== null)
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = scaleLinear().domain([0, horizonMax]).range([0, innerW])
  const yMax = Math.max(1000, ...valid.map((r) => r.p90_abs_error))
  const yMin = Math.min(0, ...valid.map((r) => r.bias))
  const y = scaleLinear().domain([yMin, yMax]).nice().range([innerH, 0])

  const band = area<ValidRow>().x((d) => x(d.horizon)).y0((d) => y(d.mae)).y1((d) => y(d.p90_abs_error))(valid) ?? ''
  const pathOf = (key: 'mae' | 'p90_abs_error' | 'bias') => line<ValidRow>().x((d) => x(d.horizon)).y((d) => y(d[key]))(valid) ?? ''

  // Values at the measured horizon closest to the selection.
  const nearest = valid.length
    ? valid.reduce((best, r) => (Math.abs(r.horizon - selectedHorizon) < Math.abs(best.horizon - selectedHorizon) ? r : best))
    : null

  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const h = Math.round(x.invert(e.clientX - rect.left - MARGIN.left))
    const clamped = Math.min(horizonMax, Math.max(0, h))
    if (clamped !== selectedHorizon) onHorizonChange(clamped)
  }

  const takeaway = horizonTakeaway(rows)
  const sx = x(selectedHorizon)

  return (
    <div className="horizon-chart" ref={wrapRef}>
      {takeaway && <p className="takeaway">{takeaway}</p>}
      <div className="legend">
        <span><i className="key key-line key-mae" />Mean absolute error</span>
        <span><i className="key key-line key-p90" />P90 absolute error</span>
        <span><i className="key key-line key-bias key-dashed" />Bias</span>
      </div>
      {width > 0 && (
        <svg
          ref={svgRef}
          width={width}
          height={HEIGHT}
          className={dragging ? 'is-dragging' : undefined}
          role="img"
          aria-label="Forecast error by horizon. Drag to change the selected horizon."
          onPointerDown={(e) => {
            svgRef.current!.setPointerCapture(e.pointerId)
            setDragging(true)
            setFromPointer(e)
          }}
          onPointerMove={(e) => dragging && setFromPointer(e)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <rect className="day-ahead" x={x(DAY_AHEAD_WINDOW.from)} width={x(DAY_AHEAD_WINDOW.to) - x(DAY_AHEAD_WINDOW.from)} y={0} height={innerH} />
            <text className="day-ahead-label" x={(x(DAY_AHEAD_WINDOW.from) + x(DAY_AHEAD_WINDOW.to)) / 2} y={innerH - 8}>Day-ahead decision window</text>

            {y.ticks(5).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line className={t === 0 ? 'axis-zero' : 'grid'} x2={innerW} />
                <text className="tick" x={-10} dy="0.32em" textAnchor="end">{(t / 1000).toFixed(1)}</text>
              </g>
            ))}
            {X_TICKS.filter((t) => t <= horizonMax).map((t) => (
              <text key={t} className="tick" x={x(t)} y={innerH + 18} textAnchor="middle">{formatHours(t)}</text>
            ))}
            <text className="tick" x={-MARGIN.left + 4} y={-12}>GW</text>
            <text className="axis-title" x={innerW / 2} y={innerH + 36} textAnchor="middle">Hours before delivery</text>

            <path d={band} className="p90-band" />
            <path d={pathOf('bias')} className="series series-bias" />
            <path d={pathOf('p90_abs_error')} className="series series-p90" />
            <path d={pathOf('mae')} className="series series-mae" />
            {valid.map((r) => (
              <circle key={r.horizon} cx={x(r.horizon)} cy={y(r.mae)} r={3} className="dot-mae" />
            ))}

            <g className="marker" transform={`translate(${sx},0)`}>
              <line y1={-6} y2={innerH} />
              <rect x={-22} y={-30} width={44} height={20} rx={10} />
              <text y={-16} textAnchor="middle">{formatHours(selectedHorizon)}</text>
            </g>
            {nearest && (
              <g className="readout" transform={`translate(${x(nearest.horizon)},0)`}>
                <circle cy={y(nearest.mae)} r={5} className="dot-mae dot-active" />
                <circle cy={y(nearest.p90_abs_error)} r={5} className="dot-p90 dot-active" />
              </g>
            )}
          </g>
        </svg>
      )}
      {nearest && (
        <p className="readout-text">
          At {formatHours(nearest.horizon)} ahead: typical miss <strong>{formatPower(nearest.mae)}</strong>, 1 hour in 10 misses
          by more than <strong>{formatPower(nearest.p90_abs_error)}</strong>, bias <strong>{formatPower(nearest.bias, { signed: true })}</strong>.
          <span className="subtle"> Drag on the chart to change the horizon.</span>
        </p>
      )}
    </div>
  )
}

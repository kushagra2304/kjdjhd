import type { CSSProperties } from 'react'
import type { ForecastAge } from '../chartData'
import { formatHours } from '../format'

export interface Preset {
  label: string
  start: string // datetime-local value, UTC
  end: string
}

interface ControlsProps {
  start: string
  end: string
  min: string
  max: string
  presets: Preset[]
  onWindowChange: (start: string, end: string) => void
  horizon: number
  horizonMin: number
  horizonMax: number
  onHorizonChange: (horizon: number) => void
  forecastAge: ForecastAge | null
  windowError: string | null
}

export function Controls({
  start, end, min, max, presets, onWindowChange,
  horizon, horizonMin, horizonMax, onHorizonChange, forecastAge, windowError,
}: ControlsProps) {
  return (
    <section className="panel controls" aria-label="Controls">
      <div className="control-group">
        <div className="date-fields">
          <label className="field">
            <span className="field-label">From (UTC)</span>
            <input
              type="datetime-local" value={start} min={min} max={max} step={1800}
              onChange={(e) => onWindowChange(e.target.value, end)}
            />
          </label>
          <label className="field">
            <span className="field-label">To (UTC)</span>
            <input
              type="datetime-local" value={end} min={min} max={max} step={1800}
              onChange={(e) => onWindowChange(start, e.target.value)}
            />
          </label>
        </div>
        <div className="presets" role="group" aria-label="Quick ranges">
          {presets.map((p) => (
            <button
              key={p.label} type="button"
              className={`chip ${p.start === start && p.end === end ? 'chip-active' : ''}`}
              onClick={() => onWindowChange(p.start, p.end)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {windowError && <p className="field-error" role="alert">{windowError}</p>}
      </div>

      <div className="control-group horizon-group">
        <div className="horizon-head">
          <label className="field-label" htmlFor="horizon">Forecast horizon</label>
          <output className="horizon-value" htmlFor="horizon">{formatHours(horizon)}<small> ahead</small></output>
        </div>
        <input
          id="horizon" type="range" min={horizonMin} max={horizonMax} step={1} value={horizon}
          style={{ '--pct': `${((horizon - horizonMin) / (horizonMax - horizonMin)) * 100}%` } as CSSProperties}
          onChange={(e) => onHorizonChange(Number(e.target.value))}
        />
        <div className="range-scale" aria-hidden="true">
          {[0, 12, 24, 36, 48].filter((h) => h >= horizonMin && h <= horizonMax).map((h) => <span key={h}>{formatHours(h)}</span>)}
        </div>
        <p className="hint">
          Using the latest forecast published at least <strong>{formatHours(horizon)}</strong> before each period.
          {forecastAge && (
            <> Runs are issued every 2–4h, so the forecasts used were{' '}
              {formatHours(forecastAge.min)}–{formatHours(forecastAge.max)} old
              (average {formatHours(Number(forecastAge.mean.toFixed(1)))}).</>
          )}
        </p>
      </div>
    </section>
  )
}

import { formatHours, formatPower } from '../format'
import type { Metrics } from '../types'

interface MetricsCardsProps {
  metrics: Metrics
  horizon: number
  overShare: number | null // share of compared hours that were over-forecast
}

/** Bias drawn as a bar growing left (under) or right (over) from a centre line, capped at ±maxMw. */
function BiasBar({ bias, maxMw }: { bias: number; maxMw: number }) {
  const pct = Math.min(1, Math.abs(bias) / maxMw) * 50
  return (
    <div className="bias-bar" aria-hidden="true">
      <i className={bias > 0 ? 'is-over' : 'is-under'} style={bias > 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }} />
    </div>
  )
}

export function MetricsCards({ metrics: m, horizon, overShare }: MetricsCardsProps) {
  if (m.count === 0) {
    return (
      <div className="notice" role="status">
        <strong>No forecast qualifies at {formatHours(horizon)} for this window.</strong> Only forecasts made at
        most 48h ahead are used, and they are published at :30 past the hour, so horizons close to 48h have few
        or no forecasts. Try a shorter horizon.
      </div>
    )
  }
  const bias = m.bias ?? 0
  return (
    <div className="metrics-grid">
      <div className="metric metric-primary">
        <div className="metric-label">Mean absolute error</div>
        <div className="metric-value">{formatPower(m.mae)}</div>
        <div className="metric-hint">Typical miss per hour · RMSE {formatPower(m.rmse)}</div>
      </div>
      <div className="metric">
        <div className="metric-label">P90 absolute error</div>
        <div className="metric-value">{formatPower(m.p90_abs_error)}</div>
        <div className="metric-hint">9 hours in 10 miss by less than this</div>
      </div>
      <div className={`metric ${bias > 0 ? 'metric-warn' : ''}`}>
        <div className="metric-label">Bias</div>
        <div className="metric-value">{formatPower(m.bias, { signed: true })}</div>
        <BiasBar bias={bias} maxMw={5000} />
        <div className="metric-hint">
          {bias > 0 ? 'Forecast runs high: buyers would under-buy' : bias < 0 ? 'Forecast runs low' : 'No systematic bias'}
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">Hours over-forecast</div>
        <div className="metric-value">{overShare === null ? '–' : `${Math.round(overShare * 100)}%`}</div>
        <div className="share-bar" aria-hidden="true"><i style={{ width: `${(overShare ?? 0) * 100}%` }} /></div>
        <div className="metric-hint">Less wind arrived than forecast</div>
      </div>
      <div className="metric">
        <div className="metric-label">Worst shortfall</div>
        <div className="metric-value">{formatPower(m.max_over_forecast)}</div>
        <div className="metric-hint">Largest single over-forecast</div>
      </div>
      <div className="metric">
        <div className="metric-label">Hours compared</div>
        <div className="metric-value">{m.count.toLocaleString('en-GB')}</div>
        <div className="metric-hint">Hourly periods with a qualifying forecast</div>
      </div>
    </div>
  )
}

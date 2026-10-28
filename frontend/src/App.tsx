import { useMemo, useState } from 'react'
import { fetchComparison, fetchHorizonError, fetchMeta } from './api'
import { buildChartData, forecastAge, overForecastShare } from './chartData'
import { Controls, type Preset } from './components/Controls'
import { ErrorHeatmap } from './components/ErrorHeatmap'
import { GenerationChart } from './components/GenerationChart'
import { HorizonErrorChart } from './components/HorizonErrorChart'
import { MetricsCards } from './components/MetricsCards'
import { inputToIso, isoToInput } from './format'
import { useAsync, useDebouncedValue } from './hooks'
import type { Meta } from './types'

const DEBOUNCE_MS = 300
const DAY_MS = 24 * 3600 * 1000
const HALF_HOUR_MS = 30 * 60 * 1000
const msToInput = (ms: number) => isoToInput(new Date(ms).toISOString())

/** Weekly quick ranges across the data period (last week absorbs the remainder), plus the whole period. */
function buildPresets(meta: Meta): Preset[] {
  const first = Date.parse(meta.data_start)
  const last = Date.parse(meta.data_end)
  const day = (ms: number) => new Date(ms).getUTCDate()
  const month = new Date(first).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
  const presets: Preset[] = []
  for (let weekStart = first; weekStart <= last; weekStart += 7 * DAY_MS) {
    const isLastWeek = weekStart + 14 * DAY_MS > last + HALF_HOUR_MS
    const weekEnd = isLastWeek ? last : weekStart + 7 * DAY_MS - HALF_HOUR_MS
    presets.push({ label: `${day(weekStart)}–${day(weekEnd)} ${month}`, start: msToInput(weekStart), end: msToInput(weekEnd) })
    if (isLastWeek) break
  }
  presets.push({ label: 'Full month', start: msToInput(first), end: msToInput(last) })
  return presets
}

function Spinner({ label }: { label: string }) {
  return <div className="spinner" role="status" aria-label={label}><span /></div>
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span><strong>Couldn't load data.</strong> {message}</span>
      <button type="button" className="chip" onClick={onRetry}>Retry</button>
    </div>
  )
}

function Dashboard({ meta }: { meta: Meta }) {
  const presets = useMemo(() => buildPresets(meta), [meta])
  const [range, setRange] = useState({ start: presets[0].start, end: presets[0].end })
  const [horizon, setHorizon] = useState(meta.default_horizon)
  const [reloadKey, setReloadKey] = useState(0)

  // The slider and date inputs update instantly; requests wait until they settle.
  // Memoised so the debounce only restarts when an input actually changes.
  const pending = useMemo(() => ({ ...range, horizon }), [range, horizon])
  const query = useDebouncedValue(pending, DEBOUNCE_MS)

  const windowError = !range.start || !range.end
    ? 'Choose a start and end time.'
    : range.start > range.end ? 'Start must be before end.' : null
  const queryValid = Boolean(query.start && query.end && query.start <= query.end)

  const comparison = useAsync(
    (signal) => fetchComparison(inputToIso(query.start), inputToIso(query.end), query.horizon, signal),
    [query.start, query.end, query.horizon, reloadKey], queryValid,
  )
  const horizonError = useAsync(
    (signal) => fetchHorizonError(inputToIso(query.start), inputToIso(query.end), signal),
    [query.start, query.end, reloadKey], queryValid,
  )

  // The heatmap always shows the whole month at the chosen horizon, so it gets its own request.
  const month = useAsync(
    (signal) => fetchComparison(meta.data_start, meta.data_end, query.horizon, signal),
    [query.horizon, reloadKey],
  )

  const series = comparison.data?.series
  const chartData = useMemo(() => (series ? buildChartData(series) : []), [series])
  const age = useMemo(() => (series ? forecastAge(series) : null), [series])
  const overShare = useMemo(() => overForecastShare(chartData), [chartData])
  const selectedMs = useMemo(
    () => ({ start: Date.parse(inputToIso(query.start)), end: Date.parse(inputToIso(query.end)) }),
    [query.start, query.end],
  )
  const loadError = comparison.error ?? horizonError.error ?? month.error
  const openDay = (dayStart: number) => setRange({ start: msToInput(dayStart), end: msToInput(dayStart + DAY_MS - HALF_HOUR_MS) })

  return (
    <>
      <Controls
        start={range.start} end={range.end}
        min={isoToInput(meta.data_start)} max={isoToInput(meta.data_end)}
        presets={presets} onWindowChange={(start, end) => setRange({ start, end })}
        horizon={horizon} horizonMin={meta.horizon_min} horizonMax={meta.horizon_max}
        onHorizonChange={setHorizon} forecastAge={age} windowError={windowError}
      />

      {loadError && <ErrorBanner message={loadError.message} onRetry={() => setReloadKey((k) => k + 1)} />}

      {comparison.data && <MetricsCards metrics={comparison.data.metrics} horizon={comparison.data.horizon} overShare={overShare} />}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Forecast vs actual generation</h2>
            <p className="subtle">Half-hourly actuals, hourly forecasts at {query.horizon}h horizon. Times in UTC.</p>
          </div>
          {comparison.loading && comparison.data && <Spinner label="Updating" />}
        </div>
        <div className={`chart-body ${comparison.loading ? 'is-loading' : ''}`}>
          {!comparison.data ? (
            comparison.loading ? <Spinner label="Loading chart" /> : <p className="empty">No data to show.</p>
          ) : chartData.length === 0 ? (
            <p className="empty">No periods in this window.</p>
          ) : (
            <GenerationChart data={chartData} />
          )}
        </div>
      </section>

      <div className="panel-row">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Error by hour, whole month</h2>
              <p className="subtle">Each cell is one hour: forecast − actual at {query.horizon}h. Click a day to open it above.</p>
            </div>
            {month.loading && month.data && <Spinner label="Updating" />}
          </div>
          <div className={`chart-body ${month.loading ? 'is-loading' : ''}`}>
            {month.data ? (
              <ErrorHeatmap series={month.data.series} horizon={month.data.horizon} selected={selectedMs} onSelectDay={openDay} />
            ) : month.loading ? <Spinner label="Loading heatmap" /> : <p className="empty">No data to show.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>How error grows with horizon</h2>
              <p className="subtle">Same window, every standard horizon.</p>
            </div>
            {horizonError.loading && horizonError.data && <Spinner label="Updating" />}
          </div>
          <div className={`chart-body ${horizonError.loading ? 'is-loading' : ''}`}>
            {horizonError.data ? (
              <HorizonErrorChart
                rows={horizonError.data} selectedHorizon={horizon} horizonMax={meta.horizon_max} onHorizonChange={setHorizon}
              />
            ) : horizonError.loading ? <Spinner label="Loading chart" /> : <p className="empty">No data to show.</p>}
          </div>
        </section>
      </div>

      <footer className="footer">
        <p>
          Data: {meta.source.name} — actuals from {meta.source.actuals_dataset}, forecasts from{' '}
          {meta.source.forecasts_dataset}. Error = forecast − actual. Metrics use only hours with a qualifying
          forecast; forecasts are matched to actuals on the exact hour, with no interpolation (the forecast line
          is drawn straight between hourly points for readability).
        </p>
      </footer>
    </>
  )
}

export default function App() {
  const [reloadKey, setReloadKey] = useState(0)
  const meta = useAsync(fetchMeta, [reloadKey])

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <div>
            <h1>Wind Forecast Monitor</h1>
            <p>UK national wind generation · forecast vs actual · January 2026</p>
          </div>
        </div>
        <div className="topbar-tags">
          <span className="tag"><i className="live-dot" />Elexon BMRS</span>
          <span className="tag">All times UTC</span>
        </div>
      </header>
      <main className="content">
        {meta.data ? (
          <Dashboard meta={meta.data} />
        ) : meta.error ? (
          <ErrorBanner message={meta.error.message} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <Spinner label="Loading" />
        )}
      </main>
    </div>
  )
}

// Pure transforms from API responses to what the charts and captions show.
import { formatHours, formatPower } from './format'
import type { HorizonErrorPoint, SeriesPoint } from './types'

const HALF_HOUR_MS = 30 * 60 * 1000
const HOUR_MS = 2 * HALF_HOUR_MS

export interface ChartPoint {
  time: number // startTime, epoch ms
  actual: number
  forecast: number | null // the real selected forecast (null at :30 or if none qualifies)
  forecastLine: number | null // what the forecast line draws through, see buildChartData
  error: number | null
  publishTime: string | null
}

/**
 * Forecasts are hourly and actuals half-hourly, so every ":30" point has
 * forecast = null. Plotting that directly would break the forecast line at
 * every half hour. `forecastLine` fills a ":30" point with the midpoint of the
 * two neighbouring hourly forecasts (where the straight line between them runs
 * anyway) so the line is continuous, but it still breaks where a forecast is
 * genuinely missing. It is a drawing aid only: tooltips and metrics use
 * `forecast`.
 */
export function buildChartData(series: SeriesPoint[]): ChartPoint[] {
  const points = series.map((p) => ({ ...p, time: Date.parse(p.startTime) }))
  return points.map((p, i) => {
    let forecastLine = p.forecast
    const prev = points[i - 1]
    const next = points[i + 1]
    if (
      forecastLine === null && prev?.forecast != null && next?.forecast != null &&
      p.time - prev.time === HALF_HOUR_MS && next.time - prev.time === HOUR_MS
    ) {
      forecastLine = (prev.forecast + next.forecast) / 2
    }
    return {
      time: p.time,
      actual: p.actual,
      forecast: p.forecast,
      forecastLine,
      error: p.forecast === null ? null : p.forecast - p.actual,
      publishTime: p.publishTime,
    }
  })
}

/**
 * X-axis ticks on round UTC boundaries: every 3h or 6h for windows up to two
 * days, otherwise at midnight every 1, 2 or 4 days.
 */
export function timeTicks(startMs: number, endMs: number): number[] {
  const span = endMs - startMs
  const day = 24 * HOUR_MS
  let step: number
  if (span <= day) step = 3 * HOUR_MS
  else if (span <= 2 * day) step = 6 * HOUR_MS
  else if (span <= 10 * day) step = day
  else if (span <= 20 * day) step = 2 * day
  else step = 4 * day
  const ticks: number[] = []
  for (let t = Math.ceil(startMs / step) * step; t <= endMs; t += step) ticks.push(t)
  return ticks
}

/** Y-axis domain top and ticks in round GW steps (values in MW). */
export function powerTicks(maxMw: number): number[] {
  const step = maxMw <= 10_000 ? 2_000 : maxMw <= 25_000 ? 5_000 : 10_000
  const top = Math.max(step, Math.ceil(maxMw / step) * step)
  return Array.from({ length: top / step + 1 }, (_, i) => i * step)
}

export interface ForecastAge {
  min: number
  mean: number
  max: number
}

/**
 * How old the selected forecasts really were (startTime - publishTime, hours).
 * Forecast runs are 2-4h apart, so this is always a bit more than the horizon.
 */
export function forecastAge(series: SeriesPoint[]): ForecastAge | null {
  const ages = series
    .filter((p) => p.publishTime !== null)
    .map((p) => (Date.parse(p.startTime) - Date.parse(p.publishTime!)) / HOUR_MS)
  if (ages.length === 0) return null
  return {
    min: Math.min(...ages),
    mean: ages.reduce((sum, a) => sum + a, 0) / ages.length,
    max: Math.max(...ages),
  }
}

/** One plain-English sentence summarising how error changes with horizon. */
export function horizonTakeaway(rows: HorizonErrorPoint[]): string | null {
  const valid = rows.filter((r) => r.count > 0 && r.mae !== null)
  if (valid.length < 2) return null
  const first = valid[0]
  const last = valid[valid.length - 1]
  const growth = ((last.mae! - first.mae!) / first.mae!) * 100
  const trend = growth >= 0 ? `grows ${Math.round(growth)}%` : `falls ${Math.round(-growth)}%`
  let text =
    `Typical error ${trend} from ${formatPower(first.mae)} at ${formatHours(first.horizon)} ` +
    `to ${formatPower(last.mae)} at ${formatHours(last.horizon)} ahead`
  const biases = valid.map((r) => r.bias ?? 0)
  if (biases.every((b) => b > 0)) {
    text += `, and forecasts run high at every horizon (by ${formatPower(Math.min(...biases))}` +
      `–${formatPower(Math.max(...biases))} on average)`
  } else if (biases.every((b) => b < 0)) {
    text += ', and forecasts run low at every horizon'
  }
  return `${text}.`
}

/** A filled shape between the forecast line and the actual line, in data space ([epoch ms, MW]). */
export interface BandPolygon {
  over: boolean // forecast above actual: less wind arrived than promised
  points: [number, number][]
}

/**
 * Polygons that fill the gap between the forecast and actual lines, split
 * where the lines cross so over- and under-forecast stretches can be coloured
 * differently. Built from `forecastLine`, so it follows the drawn line.
 */
export function errorBands(points: ChartPoint[]): BandPolygon[] {
  const bands: BandPolygon[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.forecastLine === null || b.forecastLine === null) continue
    const gapA = a.forecastLine - a.actual
    const gapB = b.forecastLine - b.actual
    if (gapA === 0 && gapB === 0) continue
    if (gapA * gapB >= 0) {
      bands.push({
        over: gapA + gapB > 0,
        points: [[a.time, a.forecastLine], [b.time, b.forecastLine], [b.time, b.actual], [a.time, a.actual]],
      })
    } else {
      // The lines cross inside this segment: split into two triangles at the crossing.
      const f = gapA / (gapA - gapB)
      const crossing: [number, number] = [a.time + f * (b.time - a.time), a.actual + f * (b.actual - a.actual)]
      bands.push({ over: gapA > 0, points: [[a.time, a.forecastLine], crossing, [a.time, a.actual]] })
      bands.push({ over: gapB > 0, points: [crossing, [b.time, b.forecastLine], [b.time, b.actual]] })
    }
  }
  return bands
}

/** Share of compared hours where the forecast was above the actual, or null if none compared. */
export function overForecastShare(points: ChartPoint[]): number | null {
  const errors = points.map((p) => p.error).filter((e): e is number => e !== null)
  if (errors.length === 0) return null
  return errors.filter((e) => e > 0).length / errors.length
}

export interface HeatmapCell {
  time: number
  actual: number
  forecast: number
  error: number
}

export interface Heatmap {
  days: number[] // UTC midnight of each column, epoch ms
  cells: (HeatmapCell | null)[][] // [day][hour of day]; null where no forecast qualifies
  scaleMax: number // colour scale limit in MW: 98th percentile of |error|, rounded up to 1 GW
}

/**
 * Day x hour-of-day grid of forecast error. Only on-the-hour periods carry a
 * forecast, so each day has 24 cells. The colour limit uses a high percentile
 * rather than the maximum so one extreme hour doesn't wash out the rest.
 */
export function buildHeatmap(series: SeriesPoint[]): Heatmap {
  const DAY_MS = 24 * HOUR_MS
  const byDay = new Map<number, (HeatmapCell | null)[]>()
  const absErrors: number[] = []
  for (const p of series) {
    const time = Date.parse(p.startTime)
    const day = Math.floor(time / DAY_MS) * DAY_MS
    if (!byDay.has(day)) byDay.set(day, Array<HeatmapCell | null>(24).fill(null))
    if (p.forecast === null || new Date(time).getUTCMinutes() !== 0) continue
    const error = p.forecast - p.actual
    byDay.get(day)![new Date(time).getUTCHours()] = { time, actual: p.actual, forecast: p.forecast, error }
    absErrors.push(Math.abs(error))
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  absErrors.sort((a, b) => a - b)
  const p98 = absErrors.length ? absErrors[Math.min(absErrors.length - 1, Math.floor(absErrors.length * 0.98))] : 0
  return {
    days,
    cells: days.map((d) => byDay.get(d)!),
    scaleMax: Math.max(1000, Math.ceil(p98 / 1000) * 1000),
  }
}

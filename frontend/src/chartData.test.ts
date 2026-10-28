import { describe, expect, it } from 'vitest'
import { buildChartData, forecastAge, horizonTakeaway, powerTicks, timeTicks } from './chartData'
import type { HorizonErrorPoint, SeriesPoint } from './types'

const point = (time: string, actual: number, forecast: number | null, publishTime: string | null = null): SeriesPoint => ({
  startTime: `2026-01-10T${time}:00Z`, actual, forecast,
  publishTime: publishTime && `2026-01-10T${publishTime}:00Z`,
})

describe('buildChartData', () => {
  it('bridges :30 gaps between hourly forecasts for drawing only', () => {
    const data = buildChartData([
      point('12:00', 1000, 1100, '07:30'),
      point('12:30', 1000, null),
      point('13:00', 1000, 1300, '07:30'),
    ])
    expect(data.map((d) => d.forecastLine)).toEqual([1100, 1200, 1300])
    expect(data[1].forecast).toBeNull() // tooltips still see the real value
    expect(data[1].error).toBeNull()
    expect(data[0].error).toBe(100)
  })

  it('keeps genuine gaps where an hourly forecast is missing', () => {
    const data = buildChartData([
      point('12:00', 1000, 1100, '07:30'),
      point('12:30', 1000, null),
      point('13:00', 1000, null), // no forecast qualifies
      point('13:30', 1000, null),
      point('14:00', 1000, 1400, '09:30'),
    ])
    expect(data.map((d) => d.forecastLine)).toEqual([1100, null, null, null, 1400])
  })
})

describe('axis ticks', () => {
  const t = (iso: string) => Date.parse(iso)

  it('uses daily midnight ticks for a week', () => {
    const ticks = timeTicks(t('2026-01-01T00:00:00Z'), t('2026-01-07T23:30:00Z'))
    expect(ticks).toHaveLength(7)
    expect(new Date(ticks[1]).toISOString()).toBe('2026-01-02T00:00:00.000Z')
  })
  it('uses 3-hourly ticks within a day, starting on a round hour', () => {
    const ticks = timeTicks(t('2026-01-10T01:30:00Z'), t('2026-01-10T12:00:00Z'))
    expect(ticks.map((v) => new Date(v).getUTCHours())).toEqual([3, 6, 9, 12])
  })
  it('rounds power ticks up to whole GW steps', () => {
    expect(powerTicks(17_800)).toEqual([0, 5_000, 10_000, 15_000, 20_000])
    expect(powerTicks(7_300)).toEqual([0, 2_000, 4_000, 6_000, 8_000])
  })
})

describe('forecastAge', () => {
  it('summarises startTime - publishTime in hours', () => {
    const age = forecastAge([
      point('12:00', 0, 1, '07:30'), // 4.5h
      point('12:30', 0, null),
      point('13:00', 0, 1, '07:30'), // 5.5h
    ])
    expect(age).toEqual({ min: 4.5, mean: 5, max: 5.5 })
  })
  it('is null when nothing was selected', () => {
    expect(forecastAge([point('12:00', 0, null)])).toBeNull()
  })
})

describe('horizonTakeaway', () => {
  const row = (horizon: number, mae: number | null, bias: number | null, count = 10): HorizonErrorPoint =>
    ({ horizon, count, mae, rmse: mae, bias, p90_abs_error: mae })

  it('describes growth from the shortest to the longest horizon with data', () => {
    const text = horizonTakeaway([row(0, 1000, 500), row(24, 1500, 800), row(48, null, null, 0)])
    expect(text).toBe(
      'Typical error grows 50% from 1.00 GW at 0h to 1.50 GW at 24h ahead, ' +
      'and forecasts run high at every horizon (by 500 MW–800 MW on average).',
    )
  })
  it('needs at least two horizons with data', () => {
    expect(horizonTakeaway([row(0, 1000, 0), row(48, null, null, 0)])).toBeNull()
  })
})

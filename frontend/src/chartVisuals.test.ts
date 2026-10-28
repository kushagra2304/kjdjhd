import { describe, expect, it } from 'vitest'
import { buildChartData, buildHeatmap, errorBands, overForecastShare } from './chartData'
import type { SeriesPoint } from './types'

const at = (day: number, time: string, actual: number, forecast: number | null): SeriesPoint => ({
  startTime: `2026-01-${String(day).padStart(2, '0')}T${time}:00Z`, actual, forecast,
  publishTime: forecast === null ? null : '2026-01-01T00:00:00Z',
})

describe('errorBands', () => {
  it('fills one band per segment when the lines do not cross', () => {
    const bands = errorBands(buildChartData([at(10, '12:00', 1000, 1500), at(10, '12:30', 1000, null), at(10, '13:00', 1000, 1300)]))
    expect(bands).toHaveLength(2)
    expect(bands.every((b) => b.over)).toBe(true)
  })

  it('splits a segment where forecast and actual cross', () => {
    // gap goes +200 -> -200 between 12:00 and 13:00, so the lines cross at 12:30
    const bands = errorBands(buildChartData([at(10, '12:00', 1000, 1200), at(10, '13:00', 1400, 1200)]))
    expect(bands.map((b) => b.over)).toEqual([true, false])
    const [t, v] = bands[0].points[1]
    expect(t).toBe(Date.parse('2026-01-10T12:30:00Z'))
    expect(v).toBe(1200)
  })

  it('skips segments with no forecast', () => {
    expect(errorBands(buildChartData([at(10, '12:00', 1000, null), at(10, '13:00', 1000, 1300)]))).toEqual([])
  })
})

describe('overForecastShare', () => {
  it('counts hours where the forecast was too high', () => {
    const data = buildChartData([at(10, '12:00', 1000, 1500), at(10, '13:00', 1000, 900), at(10, '14:00', 1000, 1100), at(10, '14:30', 1000, null)])
    expect(overForecastShare(data)).toBeCloseTo(2 / 3)
  })

  it('is null when nothing was compared', () => {
    expect(overForecastShare(buildChartData([at(10, '12:00', 1000, null)]))).toBeNull()
  })
})

describe('buildHeatmap', () => {
  it('builds a day x hour grid of errors, ignoring :30 periods', () => {
    const map = buildHeatmap([at(10, '00:00', 1000, 3000), at(10, '00:30', 1000, null), at(11, '05:00', 2000, 1500)])
    expect(map.days).toEqual([Date.parse('2026-01-10T00:00:00Z'), Date.parse('2026-01-11T00:00:00Z')])
    expect(map.cells[0]).toHaveLength(24)
    expect(map.cells[0][0]?.error).toBe(2000)
    expect(map.cells[0][1]).toBeNull()
    expect(map.cells[1][5]?.error).toBe(-500)
  })

  it('rounds the colour limit up to a whole GW', () => {
    expect(buildHeatmap([at(10, '00:00', 1000, 3400)]).scaleMax).toBe(3000)
    expect(buildHeatmap([at(10, '00:00', 1000, 1100)]).scaleMax).toBe(1000)
  })
})

// Mirrors backend/app/schemas.py. Timestamps are ISO-8601 UTC strings ("...Z"),
// power values are MW.

export interface DataSource {
  name: string
  url: string
  actuals_dataset: string
  forecasts_dataset: string
}

export interface Meta {
  data_start: string
  data_end: string
  horizon_min: number
  horizon_max: number
  default_horizon: number
  actual_resolution_minutes: number
  forecast_resolution_minutes: number
  horizons: number[]
  source: DataSource
}

export interface SeriesPoint {
  startTime: string
  actual: number
  forecast: number | null
  publishTime: string | null
}

export interface Metrics {
  count: number
  mae: number | null
  rmse: number | null
  /** mean(forecast - actual); positive = over-forecast (buyer under-purchases) */
  bias: number | null
  p50_abs_error: number | null
  p90_abs_error: number | null
  p99_abs_error: number | null
  /** percent */
  mape: number | null
  max_over_forecast: number | null
  max_under_forecast: number | null
}

export interface Comparison {
  start: string
  end: string
  horizon: number
  series: SeriesPoint[]
  metrics: Metrics
}

export interface HorizonErrorPoint {
  horizon: number
  count: number
  mae: number | null
  rmse: number | null
  bias: number | null
  p90_abs_error: number | null
}

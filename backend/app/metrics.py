"""Forecast error metrics (pure, no I/O).

error = forecast - actual (MW). A positive error means the forecast promised
more wind than arrived: the buyer under-purchased and must cover the shortfall,
the costly direction. Only periods with both an actual and a forecast count.
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from app.forecast_logic import build_comparison

DEFAULT_HORIZONS: tuple[float, ...] = (0, 1, 2, 4, 6, 8, 12, 18, 24, 30, 36, 42, 48)

# MAPE divides by the actual value; periods with almost no wind would dominate
# it, so they are left out of MAPE (not of the other metrics). January 2026 never
# drops this low (min 1.7 GW), but the guard keeps MAPE meaningful for other months.
MAPE_MIN_ACTUAL_MW = 100.0

Metrics = dict[str, float | int | None]

METRIC_KEYS = (
    "mae", "rmse", "bias", "p50_abs_error", "p90_abs_error", "p99_abs_error",
    "mape", "max_over_forecast", "max_under_forecast",
)


def compute_metrics(comparison: pd.DataFrame) -> Metrics:
    """Summarise forecast error over the rows of `comparison` that have a forecast.

    Expects `actual` and `forecast` columns (as from `build_comparison`).
    All values are in MW except `count` (periods) and `mape` (percent).
    With no matched periods, count is 0 and every metric is None.
    """
    matched = comparison.dropna(subset=["actual", "forecast"])
    if matched.empty:
        return {"count": 0, **{key: None for key in METRIC_KEYS}}

    actual = matched["actual"].to_numpy(dtype=float)
    error = matched["forecast"].to_numpy(dtype=float) - actual
    abs_error = np.abs(error)
    p50, p90, p99 = np.percentile(abs_error, [50, 90, 99])

    mape_mask = np.abs(actual) >= MAPE_MIN_ACTUAL_MW
    mape = float(np.mean(abs_error[mape_mask] / np.abs(actual[mape_mask])) * 100) if mape_mask.any() else None

    return {
        "count": int(len(matched)),
        "mae": float(abs_error.mean()),
        "rmse": float(np.sqrt(np.mean(error ** 2))),
        "bias": float(error.mean()),
        "p50_abs_error": float(p50),
        "p90_abs_error": float(p90),
        "p99_abs_error": float(p99),
        "mape": mape,
        # Largest miss in each direction, reported as a non-negative MW amount.
        "max_over_forecast": float(max(error.max(), 0.0)),
        "max_under_forecast": float(max(-error.min(), 0.0)),
    }


def error_by_horizon(actuals: pd.DataFrame, forecasts: pd.DataFrame,
                     start: pd.Timestamp, end: pd.Timestamp,
                     horizons: Sequence[float] = DEFAULT_HORIZONS) -> list[Metrics]:
    """Headline error metrics for each horizon over [start, end].

    Each item: horizon, count, mae, rmse, bias, p90_abs_error. Horizons with no
    qualifying forecasts (e.g. 48h, see README) have count 0 and None metrics.
    """
    rows: list[Metrics] = []
    for horizon in horizons:
        metrics = compute_metrics(build_comparison(actuals, forecasts, horizon, start, end))
        rows.append({
            "horizon": float(horizon),
            "count": metrics["count"],
            "mae": metrics["mae"],
            "rmse": metrics["rmse"],
            "bias": metrics["bias"],
            "p90_abs_error": metrics["p90_abs_error"],
        })
    return rows

"""Tests for forecast error metrics."""
import math

import pandas as pd
import pytest

from app.metrics import METRIC_KEYS, compute_metrics, error_by_horizon
from conftest import ts


def comparison(actual: list[float | None], forecast: list[float | None]) -> pd.DataFrame:
    return pd.DataFrame({"actual": actual, "forecast": forecast}, dtype=float)


def test_known_example():
    # errors (forecast - actual) = [1, -1, 2]
    m = compute_metrics(comparison([1000, 1000, 1000], [1001, 999, 1002]))

    assert m["count"] == 3
    assert m["mae"] == pytest.approx(4 / 3)
    assert m["rmse"] == pytest.approx(math.sqrt(2))  # sqrt((1 + 1 + 4) / 3)
    assert m["bias"] == pytest.approx(2 / 3)  # net over-forecast
    assert m["p50_abs_error"] == pytest.approx(1)
    assert m["p90_abs_error"] == pytest.approx(1.8)  # linear interpolation on [1, 1, 2]
    assert m["mape"] == pytest.approx(0.4 / 3)  # mean(|e| / 1000) * 100
    assert m["max_over_forecast"] == 2
    assert m["max_under_forecast"] == 1


def test_rows_without_forecast_are_ignored():
    m = compute_metrics(comparison([10, 10, 50], [11, 9, None]))
    assert m["count"] == 2
    assert m["mae"] == pytest.approx(1)


def test_no_matched_rows_gives_zero_count_and_none_metrics():
    m = compute_metrics(comparison([10, 20], [None, None]))
    assert m["count"] == 0
    assert all(m[key] is None for key in METRIC_KEYS)


def test_one_sided_errors_report_zero_for_other_direction():
    m = compute_metrics(comparison([10, 10], [12, 15]))  # always over-forecast
    assert m["max_over_forecast"] == 5
    assert m["max_under_forecast"] == 0


def test_mape_skips_near_zero_actuals():
    # The 5 MW period would give a 400% error; it is excluded from MAPE only.
    m = compute_metrics(comparison([1000, 5], [1100, 25]))
    assert m["mape"] == pytest.approx(10)
    assert m["mae"] == pytest.approx(60)


def test_metrics_are_plain_python_numbers():
    m = compute_metrics(comparison([1000, 1000, 1000], [1001, 999, 1002]))
    assert type(m["count"]) is int
    assert all(type(m[key]) is float for key in METRIC_KEYS)


def test_error_by_horizon(make_actuals, make_forecasts):
    target = "2026-01-10 12:00"
    actuals = make_actuals({target: 1000})
    forecasts = make_forecasts([
        (target, "2026-01-10 11:00", 1010),  # 1h ahead
        (target, "2026-01-10 06:00", 1100),  # 6h ahead
    ])

    rows = error_by_horizon(actuals, forecasts, ts(target), ts(target), horizons=[0, 4, 12])

    assert [r["horizon"] for r in rows] == [0, 4, 12]
    assert [r["mae"] for r in rows] == [10, 100, None]
    assert [r["count"] for r in rows] == [1, 1, 0]
    assert set(rows[0]) == {"horizon", "count", "mae", "rmse", "bias", "p90_abs_error"}

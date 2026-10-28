"""Tests for turning raw Elexon rows into the cached schemas."""
import pandas as pd

from app.cleaning import clean_actuals, clean_forecasts
from conftest import ts

START, END = ts("2026-01-01 00:00"), ts("2026-01-31 23:30")


def test_actuals_keep_wind_and_latest_revision():
    raw = pd.DataFrame([
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-10T12:30:00Z", "fuelType": "WIND", "generation": 100},
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-10T13:30:00Z", "fuelType": "WIND", "generation": 110},
        {"startTime": "2026-01-10T12:00:00Z", "publishTime": "2026-01-10T12:30:00Z", "fuelType": "CCGT", "generation": 999},
        {"startTime": "2025-12-31T23:30:00Z", "publishTime": "2026-01-01T00:00:00Z", "fuelType": "WIND", "generation": 50},
    ])

    result = clean_actuals(raw, START, END)

    assert result.columns.tolist() == ["startTime", "generation"]
    assert result["startTime"].tolist() == [ts("2026-01-10 12:00")]
    assert result["generation"].tolist() == [110.0]  # revised value wins


def test_forecasts_filter_horizon_scope_and_duplicates():
    def row(start, publish, mw):
        return {"startTime": start, "publishTime": publish, "generation": mw}

    raw = pd.DataFrame([
        row("2026-01-10T12:00:00Z", "2026-01-10T07:30:00Z", 100),  # 4.5h: kept
        row("2026-01-10T12:00:00Z", "2026-01-10T07:30:00Z", 100),  # duplicate from chunk overlap
        row("2026-01-10T12:00:00Z", "2026-01-10T12:00:00Z", 105),  # 0h: kept (boundary)
        row("2026-01-10T12:00:00Z", "2026-01-10T15:30:00Z", 200),  # negative horizon
        row("2026-01-10T12:00:00Z", "2026-01-08T11:30:00Z", 300),  # 48.5h: beyond cap
        row("2025-12-31T23:00:00Z", "2025-12-31T18:30:00Z", 400),  # target outside January
    ])

    result = clean_forecasts(raw, START, END, max_horizon_h=48)

    assert result["generation"].tolist() == [100.0, 105.0]
    assert result["horizon_h"].tolist() == [4.5, 0.0]
    assert str(result["startTime"].dt.tz) == "UTC"

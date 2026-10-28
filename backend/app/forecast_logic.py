"""Forecast horizon selection and the actual-vs-forecast join (pure, no I/O).

The rule: for a horizon H, each target period uses the most recent forecast
published at least H hours before it, i.e. the latest publishTime with
    publishTime <= startTime - H.
This simulates "what did we know H hours before delivery?" and never peeks at
forecasts published after that cutoff.

Inputs follow the schemas in `cleaning.py` (a `generation` column in MW).
"""
from __future__ import annotations

import pandas as pd

from app import config


def select_forecasts(forecasts: pd.DataFrame, horizon_h: float,
                     max_horizon_h: float = config.MAX_HORIZON_H) -> pd.DataFrame:
    """For each startTime, pick the latest forecast with publishTime <= startTime - horizon_h.

    Forecasts older than `max_horizon_h` are never used, so targets with no
    forecast inside [horizon_h, max_horizon_h] are simply absent from the result.

    Returns columns: startTime, publishTime, forecast (MW), one row per startTime.
    """
    if not 0 <= horizon_h <= max_horizon_h:
        raise ValueError(f"horizon_h must be within [0, {max_horizon_h}], got {horizon_h}")

    # Compare as Timedeltas, not float hours, so the boundary
    # publishTime == startTime - H is matched exactly.
    lead_time = forecasts["startTime"] - forecasts["publishTime"]
    eligible = forecasts[
        (lead_time >= pd.Timedelta(hours=horizon_h))
        & (lead_time <= pd.Timedelta(hours=max_horizon_h))
    ]
    latest = eligible.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    return (
        latest[["startTime", "publishTime", "generation"]]
        .rename(columns={"generation": "forecast"})
        .sort_values("startTime")
        .reset_index(drop=True)
    )


def build_comparison(actuals: pd.DataFrame, forecasts: pd.DataFrame, horizon_h: float,
                     start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Join actuals in [start, end] with the forecasts selected for `horizon_h`.

    Every actual period is kept (left join on exact startTime, no interpolation).
    WINDFOR is hourly while actuals are half-hourly, so ":30" periods, and any
    period without a qualifying forecast, get NaN in forecast/publishTime/error.

    Returns columns: startTime, actual, forecast, publishTime, error (= forecast - actual, MW).
    """
    window = actuals[actuals["startTime"].between(start, end)]
    comparison = (
        window[["startTime", "generation"]]
        .rename(columns={"generation": "actual"})
        .merge(select_forecasts(forecasts, horizon_h), on="startTime", how="left")
        .sort_values("startTime")
        .reset_index(drop=True)
    )
    comparison["error"] = comparison["forecast"] - comparison["actual"]
    return comparison[["startTime", "actual", "forecast", "publishTime", "error"]]

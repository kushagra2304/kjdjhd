"""Turn raw Elexon rows into the tidy frames the app works with (pure, no I/O).

Output schemas:
    actuals:   startTime (UTC), generation (MW, float)                 one row per startTime
    forecasts: startTime (UTC), publishTime (UTC), generation (MW), horizon_h
               one row per (startTime, publishTime), 0 <= horizon_h <= max_horizon_h
"""
from __future__ import annotations

import pandas as pd


def _to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, utc=True)


def clean_actuals(raw: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Keep WIND rows with startTime in [start, end]; for revised periods keep the latest publish."""
    df = raw.loc[raw["fuelType"] == "WIND", ["startTime", "publishTime", "generation"]].copy()
    df["startTime"] = _to_utc(df["startTime"])
    df["publishTime"] = _to_utc(df["publishTime"])
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce").astype(float)
    df = df.dropna(subset=["generation"])
    df = df[df["startTime"].between(start, end)]

    df = df.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    return df[["startTime", "generation"]].sort_values("startTime").reset_index(drop=True)


def clean_forecasts(raw: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp,
                    max_horizon_h: float) -> pd.DataFrame:
    """Keep forecasts for targets in [start, end] with 0 <= horizon <= max_horizon_h.

    horizon_h = (startTime - publishTime) in hours. Negative horizons are
    "forecasts" of the past and are dropped, as are those beyond the horizon cap.
    """
    df = raw[["startTime", "publishTime", "generation"]].copy()
    df["startTime"] = _to_utc(df["startTime"])
    df["publishTime"] = _to_utc(df["publishTime"])
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce").astype(float)
    df = df.dropna(subset=["generation"])
    df["horizon_h"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600

    df = df[df["startTime"].between(start, end) & df["horizon_h"].between(0, max_horizon_h)]
    # Overlapping fetch chunks can repeat a forecast run.
    df = df.drop_duplicates(["startTime", "publishTime"], keep="last")
    return df.sort_values(["startTime", "publishTime"]).reset_index(drop=True)

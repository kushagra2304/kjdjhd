"""FastAPI app: serves forecast-vs-actual comparisons from the cached data.

Run locally from `backend/`:
    uvicorn app.main:app --reload --port 8000
Interactive docs: http://localhost:8000/docs (served at /api/docs so it also
works behind the Vercel /api rewrite).
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from typing import Annotated

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import config
from app.data_store import load_dataset
from app.forecast_logic import build_comparison
from app.metrics import DEFAULT_HORIZONS, Metrics, compute_metrics, error_by_horizon
from app.schemas import (
    ComparisonResponse,
    DataSource,
    HealthResponse,
    HorizonErrorPoint,
    MetaResponse,
    SeriesPoint,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Load data and precompute the full-month horizon table before serving traffic.
    load_dataset()
    _horizon_error(config.TARGET_START, config.TARGET_END)
    yield


app = FastAPI(
    title="Wind Forecast Monitor API",
    description="UK national wind generation: forecast vs actual, January 2026 (Elexon BMRS).",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"])

StartQuery = Annotated[datetime | None, Query(description="Window start, ISO 8601 (UTC if no offset). Defaults to the first period.")]
EndQuery = Annotated[datetime | None, Query(description="Window end (inclusive), ISO 8601. Defaults to the last period.")]
HorizonQuery = Annotated[float, Query(ge=config.MIN_HORIZON_H, le=config.MAX_HORIZON_H,
                                      description="Forecast horizon in hours")]


def _to_utc(value: datetime) -> pd.Timestamp:
    """Treat naive datetimes as UTC; convert aware ones to UTC."""
    ts = pd.Timestamp(value)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")


def resolve_window(start: datetime | None, end: datetime | None) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Validate a requested window and clamp it to the available data range.

    Windows that partly overlap January 2026 are clamped; windows entirely
    outside it, or with start after end, are rejected with 400.
    """
    start_ts = _to_utc(start) if start else config.TARGET_START
    end_ts = _to_utc(end) if end else config.TARGET_END
    if start_ts > end_ts:
        raise HTTPException(status_code=400, detail="start must not be after end")
    if end_ts < config.TARGET_START or start_ts > config.TARGET_END:
        raise HTTPException(
            status_code=400,
            detail=f"Window is outside the available data "
                   f"({config.TARGET_START.isoformat()} to {config.TARGET_END.isoformat()})",
        )
    return max(start_ts, config.TARGET_START), min(end_ts, config.TARGET_END)


@lru_cache(maxsize=64)
def _horizon_error(start: pd.Timestamp, end: pd.Timestamp) -> list[Metrics]:
    """error_by_horizon is ~13 full selections; cache per window (data never changes)."""
    data = load_dataset()
    return error_by_horizon(data.actuals, data.forecasts, start, end, DEFAULT_HORIZONS)


@app.get("/api/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse()


@app.get("/api/meta", response_model=MetaResponse, tags=["system"])
def meta() -> MetaResponse:
    return MetaResponse(
        data_start=config.TARGET_START,
        data_end=config.TARGET_END,
        horizon_min=config.MIN_HORIZON_H,
        horizon_max=config.MAX_HORIZON_H,
        default_horizon=config.DEFAULT_HORIZON_H,
        actual_resolution_minutes=config.ACTUAL_RESOLUTION_MIN,
        forecast_resolution_minutes=config.FORECAST_RESOLUTION_MIN,
        horizons=[float(h) for h in DEFAULT_HORIZONS],
        source=DataSource(
            name="Elexon BMRS",
            url=config.ELEXON_BASE_URL,
            actuals_dataset="FUELHH (fuelType=WIND)",
            forecasts_dataset="WINDFOR",
        ),
    )


@app.get("/api/comparison", response_model=ComparisonResponse, tags=["forecast"])
def comparison(start: StartQuery = None, end: EndQuery = None,
               horizon: HorizonQuery = config.DEFAULT_HORIZON_H) -> ComparisonResponse:
    """Actual vs the latest forecast published at least `horizon` hours before each period."""
    start_ts, end_ts = resolve_window(start, end)
    data = load_dataset()
    df = build_comparison(data.actuals, data.forecasts, horizon, start_ts, end_ts)

    # NaN/NaT -> None so missing forecasts serialise as JSON null.
    records = df.astype(object).where(df.notna(), None).to_dict(orient="records")
    series = [
        SeriesPoint(startTime=r["startTime"], actual=r["actual"],
                    forecast=r["forecast"], publishTime=r["publishTime"])
        for r in records
    ]
    return ComparisonResponse(start=start_ts, end=end_ts, horizon=horizon,
                              series=series, metrics=compute_metrics(df))


@app.get("/api/horizon-error", response_model=list[HorizonErrorPoint], tags=["forecast"])
def horizon_error(start: StartQuery = None, end: EndQuery = None) -> list[HorizonErrorPoint]:
    """MAE, RMSE, bias and P90 absolute error at each standard horizon over the window."""
    start_ts, end_ts = resolve_window(start, end)
    return [HorizonErrorPoint(**row) for row in _horizon_error(start_ts, end_ts)]


@app.get("/docs", include_in_schema=False)
def docs_redirect() -> RedirectResponse:
    return RedirectResponse(url="/api/docs")

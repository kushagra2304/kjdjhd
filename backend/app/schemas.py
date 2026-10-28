"""Pydantic response models for the API (these also drive the /api/docs schema)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class DataSource(BaseModel):
    name: str
    url: str
    actuals_dataset: str
    forecasts_dataset: str


class MetaResponse(BaseModel):
    data_start: datetime = Field(description="First target period available (UTC)")
    data_end: datetime = Field(description="Last target period available (UTC)")
    horizon_min: float
    horizon_max: float
    default_horizon: float
    actual_resolution_minutes: int
    forecast_resolution_minutes: int
    horizons: list[float] = Field(description="Horizons reported by /api/horizon-error")
    source: DataSource


class SeriesPoint(BaseModel):
    startTime: datetime
    actual: float = Field(description="Actual wind generation, MW")
    forecast: float | None = Field(description="Selected forecast, MW; null if none qualifies")
    publishTime: datetime | None = Field(description="When the selected forecast was published")


class Metrics(BaseModel):
    """Error metrics over periods with both actual and forecast. All MW unless noted."""
    count: int = Field(description="Number of periods compared")
    mae: float | None
    rmse: float | None
    bias: float | None = Field(description="Mean(forecast - actual); positive = over-forecast")
    p50_abs_error: float | None
    p90_abs_error: float | None
    p99_abs_error: float | None
    mape: float | None = Field(description="Mean absolute percentage error, %")
    max_over_forecast: float | None
    max_under_forecast: float | None


class ComparisonResponse(BaseModel):
    start: datetime = Field(description="Effective window start after clamping (UTC)")
    end: datetime = Field(description="Effective window end after clamping (UTC)")
    horizon: float
    series: list[SeriesPoint]
    metrics: Metrics


class HorizonErrorPoint(BaseModel):
    horizon: float
    count: int
    mae: float | None
    rmse: float | None
    bias: float | None
    p90_abs_error: float | None

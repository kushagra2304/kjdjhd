"""Factories for small hand-made frames in the cleaned-data schema."""
from __future__ import annotations

from collections.abc import Callable

import pandas as pd
import pytest


def ts(value: str) -> pd.Timestamp:
    """Shorthand for a UTC timestamp, e.g. ts("2026-01-10 12:00")."""
    return pd.Timestamp(value, tz="UTC")


@pytest.fixture
def make_actuals() -> Callable[..., pd.DataFrame]:
    """make_actuals({"2026-01-10 12:00": 8000, ...}) -> startTime, generation."""
    def _make(values: dict[str, float]) -> pd.DataFrame:
        return pd.DataFrame({
            "startTime": [ts(t) for t in values],
            "generation": [float(v) for v in values.values()],
        })
    return _make


@pytest.fixture
def make_forecasts() -> Callable[..., pd.DataFrame]:
    """make_forecasts([(startTime, publishTime, MW), ...]) -> startTime, publishTime, generation."""
    def _make(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
        # to_datetime keeps the tz-aware dtype even when `rows` is empty.
        return pd.DataFrame({
            "startTime": pd.to_datetime([s for s, _, _ in rows], utc=True),
            "publishTime": pd.to_datetime([p for _, p, _ in rows], utc=True),
            "generation": pd.Series([g for _, _, g in rows], dtype=float),
        })
    return _make

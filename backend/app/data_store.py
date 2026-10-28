"""Read and write the cached data files in `backend/data/`.

Files are JSON arrays of records with ISO-8601 UTC timestamps
("2026-01-01T00:00:00Z"). JSON rather than Parquet keeps pyarrow out of the
dependencies (it is large for Vercel's function size limit), and the files
are small (~1 MB) and readable in a diff.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app import config

TIME_COLUMNS = ("startTime", "publishTime")
# Whole-MW values are written as 13756.0 but read back as int; keep them float
# so missing forecasts (NaN) never change a column's type downstream.
FLOAT_COLUMNS = ("generation",)
_ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def write_frame(df: pd.DataFrame, path: Path) -> None:
    """Write a frame as a JSON array of records, formatting timestamps as ISO UTC."""
    out = df.copy()
    for col in TIME_COLUMNS:
        if col in out.columns:
            out[col] = out[col].dt.tz_convert("UTC").dt.strftime(_ISO_FORMAT)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_json(path, orient="records", double_precision=6)


def read_frame(path: Path) -> pd.DataFrame:
    """Read a file written by `write_frame`, restoring tz-aware UTC timestamps."""
    df = pd.read_json(path, orient="records", dtype=False)  # types are set explicitly below
    for col in TIME_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True)
    for col in FLOAT_COLUMNS:
        if col in df.columns:
            df[col] = df[col].astype(float)
    return df


@dataclass(frozen=True)
class Dataset:
    actuals: pd.DataFrame    # startTime, generation
    forecasts: pd.DataFrame  # startTime, publishTime, generation


@lru_cache(maxsize=1)
def load_dataset() -> Dataset:
    """Load both cached files once per process; later calls reuse the same frames.

    Callers must treat the frames as read-only.
    """
    return Dataset(actuals=read_frame(config.ACTUALS_PATH), forecasts=read_frame(config.FORECASTS_PATH))

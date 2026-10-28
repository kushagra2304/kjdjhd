"""Project-wide constants: data scope, horizon limits, API settings and file paths.

All timestamps are UTC. January is GMT in the UK, so UTC and local time coincide
for the whole scope, but we never rely on that.
"""
from pathlib import Path

import pandas as pd

# --- Elexon BMRS API --------------------------------------------------------
ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FUELHH_PATH = "/datasets/FUELHH/stream"
WINDFOR_PATH = "/datasets/WINDFOR/stream"

REQUEST_TIMEOUT_S = 60
MAX_RETRIES = 3
RETRY_BACKOFF_S = 2.0  # waits 2s, then 4s between attempts
CHUNK_DAYS = 7  # one request per week of data

# --- Data scope -------------------------------------------------------------
# Target (delivery) periods we evaluate: every half hour in January 2026.
TARGET_START = pd.Timestamp("2026-01-01T00:00:00Z")
TARGET_END = pd.Timestamp("2026-01-31T23:30:00Z")

# Forecasts that can apply to those targets: published up to 48h before the
# first target, until the last target.
FORECAST_PUBLISH_FROM = pd.Timestamp("2025-12-29T00:00:00Z")
FORECAST_PUBLISH_TO = pd.Timestamp("2026-01-31T23:59:00Z")

# --- Forecast horizon (hours) -----------------------------------------------
MIN_HORIZON_H = 0.0
MAX_HORIZON_H = 48.0
DEFAULT_HORIZON_H = 4.0

# --- Data resolution (minutes), see notes/phase1_data_findings.md -----------
ACTUAL_RESOLUTION_MIN = 30
FORECAST_RESOLUTION_MIN = 60

# --- API --------------------------------------------------------------------
# Browser origins allowed for local development (Vite dev server, Docker nginx).
# In Docker and on Vercel the frontend is served from the same origin as /api.
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]

# --- Cached data files ------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
ACTUALS_PATH = DATA_DIR / "actuals_wind_jan2026.json"
FORECASTS_PATH = DATA_DIR / "forecasts_wind_jan2026.json"

"""Download, clean and cache January 2026 wind actuals and forecasts.

Run from `backend/`:
    python -m scripts.fetch_data

Writes `data/actuals_wind_jan2026.json` and `data/forecasts_wind_jan2026.json`.
These files are committed so the app never needs to call Elexon at runtime.
"""
from __future__ import annotations

import logging
from datetime import timedelta

import requests

from app import config
from app.cleaning import clean_actuals, clean_forecasts
from app.data_store import read_frame, write_frame
from app.elexon_client import fetch_fuelhh_wind, fetch_windfor

logger = logging.getLogger("fetch_data")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    session = requests.Session()

    # Settlement dates are UK-local; pad by a day each side and clip on startTime
    # so this stays correct if the scope ever moves into British Summer Time.
    raw_actuals = fetch_fuelhh_wind(
        config.TARGET_START.date() - timedelta(days=1),
        config.TARGET_END.date() + timedelta(days=1),
        session,
    )
    raw_forecasts = fetch_windfor(config.FORECAST_PUBLISH_FROM, config.FORECAST_PUBLISH_TO, session)
    if raw_actuals.empty or raw_forecasts.empty:
        raise RuntimeError("Elexon returned no data; refusing to overwrite the cache.")

    actuals = clean_actuals(raw_actuals, config.TARGET_START, config.TARGET_END)
    # horizon_h is derived from the two timestamps, so it isn't stored: saving it
    # would round off-schedule runs (e.g. 12:25 publishes give 35.5833...h).
    forecasts = clean_forecasts(raw_forecasts, config.TARGET_START, config.TARGET_END,
                                config.MAX_HORIZON_H).drop(columns="horizon_h")

    write_frame(actuals, config.ACTUALS_PATH)
    write_frame(forecasts, config.FORECASTS_PATH)

    # Round-trip check: what the app will load must equal what we cleaned.
    assert read_frame(config.ACTUALS_PATH).equals(actuals), "actuals round-trip mismatch"
    assert read_frame(config.FORECASTS_PATH).equals(forecasts), "forecasts round-trip mismatch"

    expected_periods = int((config.TARGET_END - config.TARGET_START) / timedelta(minutes=30)) + 1
    print(f"\nActuals:   {len(raw_actuals):>6} raw -> {len(actuals):>6} clean rows "
          f"(expected {expected_periods} half-hours) -> {config.ACTUALS_PATH}")
    print(f"Forecasts: {len(raw_forecasts):>6} raw -> {len(forecasts):>6} clean rows, "
          f"{forecasts['startTime'].nunique()} target hours, "
          f"{forecasts['publishTime'].nunique()} publish runs -> {config.FORECASTS_PATH}")
    if len(actuals) != expected_periods:
        logger.warning("Actuals are missing %d half-hour periods", expected_periods - len(actuals))


if __name__ == "__main__":
    main()

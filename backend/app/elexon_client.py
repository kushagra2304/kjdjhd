"""Fetch raw wind data from the Elexon BMRS API.

Only used by the offline fetch script (`scripts/fetch_data.py`); the web app
never calls Elexon at request time. Requests are split into weekly chunks and
retried with exponential backoff on network errors, 429 and 5xx responses.
Functions here return the API's rows unmodified; cleaning lives in `cleaning.py`.
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta
from typing import Any

import pandas as pd
import requests

from app import config

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_API_DATETIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _get_rows(session: requests.Session, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
    """GET one endpoint and return its list of rows, retrying transient failures."""
    url = f"{config.ELEXON_BASE_URL}{path}"
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            response = session.get(url, params=params, timeout=config.REQUEST_TIMEOUT_S)
        except (requests.ConnectionError, requests.Timeout) as exc:
            error: Exception = exc
        else:
            if response.status_code not in _RETRYABLE_STATUS:
                response.raise_for_status()  # other 4xx are our fault: fail fast
                payload = response.json()
                # /stream endpoints return a bare list; other BMRS endpoints wrap it in {"data": [...]}.
                return payload["data"] if isinstance(payload, dict) else payload
            error = requests.HTTPError(f"HTTP {response.status_code}", response=response)

        if attempt == config.MAX_RETRIES:
            raise error
        wait_s = config.RETRY_BACKOFF_S * 2 ** (attempt - 1)
        logger.warning("%s failed (%s), attempt %d/%d; retrying in %.0fs",
                       path, error, attempt, config.MAX_RETRIES, wait_s)
        time.sleep(wait_s)
    raise AssertionError("unreachable")


def fetch_fuelhh_wind(start: date, end: date, session: requests.Session | None = None) -> pd.DataFrame:
    """Fetch half-hourly actual WIND generation for settlement dates start..end (inclusive).

    Columns as returned by the API: dataset, publishTime, startTime, settlementDate,
    settlementPeriod, fuelType, generation.
    """
    session = session or requests.Session()
    rows: list[dict[str, Any]] = []
    chunk_start = start
    while chunk_start <= end:
        # settlementDate filters are inclusive at both ends, so chunks must not overlap.
        chunk_end = min(chunk_start + timedelta(days=config.CHUNK_DAYS - 1), end)
        chunk = _get_rows(session, config.FUELHH_PATH, {
            "settlementDateFrom": chunk_start.isoformat(),
            "settlementDateTo": chunk_end.isoformat(),
            "fuelType": "WIND",
        })
        logger.info("FUELHH %s..%s: %d rows", chunk_start, chunk_end, len(chunk))
        rows.extend(chunk)
        chunk_start = chunk_end + timedelta(days=1)
    return pd.DataFrame(rows)


def fetch_windfor(publish_from: pd.Timestamp, publish_to: pd.Timestamp,
                  session: requests.Session | None = None) -> pd.DataFrame:
    """Fetch every wind forecast published within [publish_from, publish_to].

    Columns as returned by the API: dataset, publishTime, startTime, generation.
    Chunk boundaries may return the same run twice; callers should de-duplicate
    on (startTime, publishTime).
    """
    session = session or requests.Session()
    rows: list[dict[str, Any]] = []
    step = timedelta(days=config.CHUNK_DAYS)
    chunk_start = publish_from
    while chunk_start < publish_to:
        chunk_end = min(chunk_start + step, publish_to)
        chunk = _get_rows(session, config.WINDFOR_PATH, {
            "publishDateTimeFrom": chunk_start.strftime(_API_DATETIME_FORMAT),
            "publishDateTimeTo": chunk_end.strftime(_API_DATETIME_FORMAT),
        })
        logger.info("WINDFOR published %s..%s: %d rows", chunk_start, chunk_end, len(chunk))
        rows.extend(chunk)
        chunk_start = chunk_end
    return pd.DataFrame(rows)

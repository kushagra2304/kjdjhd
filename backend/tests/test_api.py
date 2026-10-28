"""API tests against the real cached January 2026 data."""
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:  # runs the lifespan (data load)
        yield test_client


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_meta(client):
    body = client.get("/api/meta").json()
    assert body["data_start"] == "2026-01-01T00:00:00Z"
    assert body["data_end"] == "2026-01-31T23:30:00Z"
    assert (body["horizon_min"], body["horizon_max"], body["default_horizon"]) == (0, 48, 4)


def test_comparison_shape(client):
    response = client.get("/api/comparison", params={
        "start": "2026-01-10T00:00:00Z", "end": "2026-01-10T23:30:00Z", "horizon": 4})
    assert response.status_code == 200
    body = response.json()

    series = body["series"]
    assert len(series) == 48  # one day of half-hours
    assert set(series[0]) == {"startTime", "actual", "forecast", "publishTime"}
    assert series[0]["startTime"] == "2026-01-10T00:00:00Z"
    # Forecasts are hourly: on-the-hour periods have one, half-hours are null.
    assert series[0]["forecast"] is not None
    assert series[1]["forecast"] is None and series[1]["publishTime"] is None
    assert body["metrics"]["count"] == 24
    assert body["horizon"] == 4


def test_comparison_defaults_to_full_month(client):
    body = client.get("/api/comparison").json()
    assert len(body["series"]) == 1488
    assert body["horizon"] == 4


def test_partial_overlap_is_clamped(client):
    body = client.get("/api/comparison", params={
        "start": "2025-12-25T00:00:00Z", "end": "2026-01-01T23:30:00Z"}).json()
    assert body["start"] == "2026-01-01T00:00:00Z"
    assert len(body["series"]) == 48


def test_naive_datetimes_are_utc(client):
    body = client.get("/api/comparison", params={
        "start": "2026-01-10T12:00:00", "end": "2026-01-10T12:00:00"}).json()
    assert body["series"][0]["startTime"] == "2026-01-10T12:00:00Z"


def test_horizon_48_returns_no_forecasts(client):
    body = client.get("/api/comparison", params={"horizon": 48}).json()
    assert body["metrics"]["count"] == 0
    assert body["metrics"]["mae"] is None
    assert all(point["forecast"] is None for point in body["series"])


@pytest.mark.parametrize("params, status", [
    ({"horizon": 60}, 422),
    ({"horizon": -1}, 422),
    ({"horizon": "abc"}, 422),
    ({"start": "not-a-date"}, 422),
    ({"start": "2026-01-10T00:00:00Z", "end": "2026-01-09T00:00:00Z"}, 400),
    ({"start": "2026-02-01T00:00:00Z", "end": "2026-02-02T00:00:00Z"}, 400),
    ({"start": "2025-12-01T00:00:00Z", "end": "2025-12-02T00:00:00Z"}, 400),
])
def test_invalid_input_is_rejected(client, params, status):
    assert client.get("/api/comparison", params=params).status_code == status


def test_horizon_error(client):
    response = client.get("/api/horizon-error")
    assert response.status_code == 200
    rows = response.json()
    assert [row["horizon"] for row in rows] == [0, 1, 2, 4, 6, 8, 12, 18, 24, 30, 36, 42, 48]
    assert set(rows[0]) == {"horizon", "count", "mae", "rmse", "bias", "p90_abs_error"}
    assert rows[0]["count"] == 744
    assert rows[-1]["count"] == 0  # 48h: no forecast qualifies


def test_horizon_error_window_and_validation(client):
    week = client.get("/api/horizon-error", params={
        "start": "2026-01-01T00:00:00Z", "end": "2026-01-07T23:30:00Z"}).json()
    assert week[0]["count"] == 7 * 24
    assert client.get("/api/horizon-error", params={"start": "2026-03-01T00:00:00Z"}).status_code == 400


def test_docs_available(client):
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200
    assert client.get("/docs", follow_redirects=False).status_code == 307

"""Tests for the horizon selection rule and the actual-vs-forecast join."""
import pandas as pd
import pytest

from app import config
from app.data_store import read_frame
from app.forecast_logic import build_comparison, select_forecasts
from conftest import ts

TARGET = "2026-01-10 12:00"


def selected_mw(forecasts: pd.DataFrame, horizon_h: float) -> list[float]:
    return select_forecasts(forecasts, horizon_h)["forecast"].tolist()


class TestSelectForecasts:
    def test_picks_latest_forecast_satisfying_horizon(self, make_forecasts):
        forecasts = make_forecasts([
            (TARGET, "2026-01-10 02:30", 100),  # 9.5h ahead
            (TARGET, "2026-01-10 04:30", 200),  # 7.5h ahead: latest that is >= 4h ahead
            (TARGET, "2026-01-10 09:30", 300),  # 2.5h ahead: too recent for H=4
        ])
        assert selected_mw(forecasts, 4) == [200]

    def test_ignores_input_order(self, make_forecasts):
        forecasts = make_forecasts([
            (TARGET, "2026-01-10 04:30", 200),
            (TARGET, "2026-01-10 02:30", 100),
        ])
        assert selected_mw(forecasts, 4) == [200]

    def test_never_uses_forecasts_published_after_cutoff(self, make_forecasts):
        # Only forecasts published after startTime - H exist: nothing may be selected.
        forecasts = make_forecasts([
            (TARGET, "2026-01-10 09:30", 300),
            (TARGET, "2026-01-10 11:30", 400),
        ])
        assert select_forecasts(forecasts, 4).empty

    def test_publish_exactly_at_cutoff_is_included(self, make_forecasts):
        forecasts = make_forecasts([
            (TARGET, "2026-01-10 07:30", 100),
            (TARGET, "2026-01-10 08:00", 200),  # exactly 4h before
            (TARGET, "2026-01-10 08:01", 300),  # 1 minute too late
        ])
        assert selected_mw(forecasts, 4) == [200]

    def test_fractional_horizon_boundary(self, make_forecasts):
        forecasts = make_forecasts([(TARGET, "2026-01-10 10:30", 100)])  # exactly 1.5h ahead
        assert selected_mw(forecasts, 1.5) == [100]
        assert select_forecasts(forecasts, 1.6).empty

    def test_forecasts_beyond_max_horizon_are_ignored(self, make_forecasts):
        forecasts = make_forecasts([
            ("2026-01-10 12:00", "2026-01-08 11:00", 100),  # 49h ahead: over the 48h cap
            ("2026-01-10 12:00", "2026-01-08 12:00", 200),  # exactly 48h ahead: allowed
        ])
        assert selected_mw(forecasts, 48) == [200]
        assert select_forecasts(forecasts.iloc[[0]], 0).empty

    def test_each_target_selected_independently(self, make_forecasts):
        forecasts = make_forecasts([
            ("2026-01-10 12:00", "2026-01-10 07:30", 120),
            ("2026-01-10 12:00", "2026-01-10 04:30", 110),
            ("2026-01-10 13:00", "2026-01-10 09:30", 130),  # 3.5h ahead: too recent
            ("2026-01-10 13:00", "2026-01-10 07:30", 125),
        ])
        result = select_forecasts(forecasts, 4)
        assert result["startTime"].tolist() == [ts("2026-01-10 12:00"), ts("2026-01-10 13:00")]
        assert result["forecast"].tolist() == [120, 125]
        assert result["publishTime"].tolist() == [ts("2026-01-10 07:30")] * 2

    @pytest.mark.parametrize("horizon", [-1, 48.5, 60])
    def test_rejects_out_of_range_horizon(self, make_forecasts, horizon):
        with pytest.raises(ValueError):
            select_forecasts(make_forecasts([(TARGET, "2026-01-10 07:30", 1)]), horizon)


class TestBuildComparison:
    def test_left_joins_on_exact_start_time(self, make_actuals, make_forecasts):
        actuals = make_actuals({"2026-01-10 12:00": 1000, "2026-01-10 12:30": 1100})
        forecasts = make_forecasts([("2026-01-10 12:00", "2026-01-10 07:30", 1200)])

        result = build_comparison(actuals, forecasts, 4, ts("2026-01-10 00:00"), ts("2026-01-10 23:30"))

        assert result.columns.tolist() == ["startTime", "actual", "forecast", "publishTime", "error"]
        assert result["actual"].tolist() == [1000, 1100]
        assert result.loc[0, "forecast"] == 1200
        assert result.loc[0, "error"] == 200  # forecast - actual: over-forecast is positive
        # Half-hour period has no hourly forecast and is not interpolated.
        assert result.loc[1, ["forecast", "publishTime", "error"]].isna().all()

    def test_target_without_qualifying_forecast_is_missing(self, make_actuals, make_forecasts):
        actuals = make_actuals({TARGET: 1000})
        forecasts = make_forecasts([(TARGET, "2026-01-10 11:30", 999)])  # only 0.5h ahead

        result = build_comparison(actuals, forecasts, 4, ts(TARGET), ts(TARGET))

        assert len(result) == 1
        assert pd.isna(result.loc[0, "forecast"])

    def test_window_is_inclusive_and_filters_actuals(self, make_actuals, make_forecasts):
        actuals = make_actuals({"2026-01-10 11:30": 1, "2026-01-10 12:00": 2,
                                "2026-01-10 12:30": 3, "2026-01-10 13:00": 4})
        result = build_comparison(actuals, make_forecasts([]), 4,
                                  ts("2026-01-10 12:00"), ts("2026-01-10 12:30"))
        assert result["actual"].tolist() == [2, 3]


@pytest.mark.skipif(not config.FORECASTS_PATH.exists(), reason="cached data not fetched")
@pytest.mark.parametrize("horizon", [0, 4, 24, 47])
def test_no_lookahead_on_real_data(horizon):
    """On the full cached month, every chosen forecast respects the horizon rule."""
    selected = select_forecasts(read_frame(config.FORECASTS_PATH), horizon)
    lead = selected["startTime"] - selected["publishTime"]
    assert not selected.empty
    assert (lead >= pd.Timedelta(hours=horizon)).all()
    assert (lead <= pd.Timedelta(hours=config.MAX_HORIZON_H)).all()

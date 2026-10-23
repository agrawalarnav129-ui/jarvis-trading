"""
Tests for analytics/defensive.py.

The board's whole value is that its numbers are honest about a thing the user
wanted to be true and isn't — that some NSE names rise when the index falls.
So these tests pin the arithmetic (a name that tracks the index exactly must
report beta 1.0, an inverted one -1.0) and the guards that keep illiquid noise
off the board, since noise is exactly what a naive negative-correlation screen
surfaces.
"""
from __future__ import annotations

import numpy as np
import pytest

from analytics.defensive import BETA_WINDOW, _log_returns, _metrics


def _series(n: int = 400, seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.normal(0, 0.01, n)


# ── _log_returns ────────────────────────────────────────────────────────────

def test_log_returns_are_one_shorter_than_prices() -> None:
    assert len(_log_returns(np.array([100.0, 101.0, 102.0]))) == 2


def test_log_returns_of_a_flat_series_are_zero() -> None:
    assert np.allclose(_log_returns(np.array([50.0] * 10)), 0.0)


def test_log_returns_match_the_definition() -> None:
    got = _log_returns(np.array([100.0, 110.0]))
    assert got[0] == pytest.approx(np.log(110.0 / 100.0))


# ── beta ────────────────────────────────────────────────────────────────────

def test_beta_of_an_identical_series_is_one() -> None:
    b = _series()
    assert _metrics(b.copy(), b)["beta"] == pytest.approx(1.0, abs=1e-6)


def test_beta_of_an_inverted_series_is_minus_one() -> None:
    b = _series()
    assert _metrics(-b, b)["beta"] == pytest.approx(-1.0, abs=1e-6)


def test_beta_scales_with_amplitude() -> None:
    b = _series()
    assert _metrics(b * 2.0, b)["beta"] == pytest.approx(2.0, abs=1e-6)
    assert _metrics(b * 0.25, b)["beta"] == pytest.approx(0.25, abs=1e-6)


def test_beta_of_an_uncorrelated_series_is_near_zero() -> None:
    b = _series(seed=1)
    independent = _series(seed=99)
    assert abs(_metrics(independent, b)["beta"]) < 0.2


# ── correlation ─────────────────────────────────────────────────────────────

def test_correlation_of_identical_series_is_one() -> None:
    b = _series()
    m = _metrics(b.copy(), b)
    for window in (60, 120, 250):
        assert m[f"corr_{window}d"] == pytest.approx(1.0, abs=1e-6)


def test_correlation_of_inverted_series_is_minus_one() -> None:
    b = _series()
    assert _metrics(-b, b)["corr_250d"] == pytest.approx(-1.0, abs=1e-6)


def test_correlation_stays_within_bounds() -> None:
    b = _series(seed=5)
    m = _metrics(_series(seed=6), b)
    for window in (60, 120, 250):
        assert -1.0 <= m[f"corr_{window}d"] <= 1.0


# ── capture ─────────────────────────────────────────────────────────────────

def test_capture_is_measured_only_on_the_matching_days() -> None:
    """Down capture must average the stock over the index's DOWN days only."""
    bench = np.array([0.01, -0.01] * (BETA_WINDOW // 2))
    stock = np.array([0.05, -0.02] * (BETA_WINDOW // 2))
    m = _metrics(stock, bench)
    assert m["down_capture"] == pytest.approx(-2.0)     # the -0.02 days, in %
    assert m["up_capture"] == pytest.approx(5.0)        # the +0.05 days, in %
    assert m["bench_down_mean"] == pytest.approx(-1.0)
    assert m["down_days"] == BETA_WINDOW // 2


def test_a_name_that_rises_on_down_days_shows_positive_down_capture() -> None:
    bench = np.array([-0.01] * BETA_WINDOW)
    stock = np.array([0.004] * BETA_WINDOW)
    assert _metrics(stock, bench)["down_capture"] > 0


# ── short history degrades rather than lying ────────────────────────────────

def test_short_history_yields_none_not_a_fabricated_number() -> None:
    """Windows degrade one at a time: 100 bars fills 60d but not 120d or 250d."""
    b = _series(n=100)
    m = _metrics(b.copy(), b)
    assert m["corr_60d"] is not None
    assert m["corr_120d"] is None
    assert m["corr_250d"] is None
    assert m["beta"] is None
    assert m["down_capture"] is None
    assert m["down_days"] == 0


def test_zero_variance_benchmark_does_not_divide_by_zero() -> None:
    """A perfectly flat index has no variance — beta is undefined, not inf."""
    flat = np.zeros(BETA_WINDOW)
    assert _metrics(_series(n=BETA_WINDOW), flat)["beta"] is None


# ── board-level guarantees ──────────────────────────────────────────────────

def test_board_is_sorted_by_beta_and_respects_its_cap() -> None:
    from analytics.defensive import defensive_board
    board = defensive_board(limit=25, max_beta=0.5)
    if not board["available"]:
        pytest.skip("OHLCV cache unavailable in this environment")
    betas = [r["beta"] for r in board["results"]]
    assert betas == sorted(betas)
    assert all(b <= 0.5 for b in betas)


def test_board_excludes_illiquid_names() -> None:
    """The junk a naive negative-correlation screen surfaces must not appear."""
    from config import MIN_TURNOVER_CR
    from analytics.defensive import defensive_board
    board = defensive_board(limit=100)
    if not board["available"]:
        pytest.skip("OHLCV cache unavailable in this environment")
    assert all(r["turnover_cr"] >= MIN_TURNOVER_CR for r in board["results"])


def test_board_states_what_it_does_not_mean() -> None:
    """The note is load-bearing: without it the board reads as a hedge list."""
    from analytics.defensive import defensive_board
    note = defensive_board(limit=1)["note"].lower()
    assert "fall less" in note
    assert "not that they rise" in note

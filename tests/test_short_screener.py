"""
Tests for screener/short_screener.py.

The short engine mirrors the long one, and a mirror is easy to get subtly
wrong: a comparison left pointing the old way scores an uptrend as a short
candidate. These tests build synthetic downtrends and uptrends and assert the
components actually discriminate between them, rather than just returning a
number.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from screener.short_screener import (
    _momentum_score,
    _price_action_score,
    _relative_strength_score,
    _trend_strength_score,
    _volume_quality_score,
    score_short,
)
from utils.indicators import adx_full, atr, bollinger_bands, ema, macd, rsi


def _frame(prices: np.ndarray, volume: int = 1_000_000) -> pd.DataFrame:
    """OHLCV frame with indicator columns, mirroring what score_short builds."""
    idx = pd.date_range("2024-01-01", periods=len(prices), freq="B")
    df = pd.DataFrame({
        "open": prices * 0.999, "high": prices * 1.01,
        "low": prices * 0.99, "close": prices,
        "volume": [volume] * len(prices),
    }, index=idx)
    bb = bollinger_bands(df["close"], 20, 2)
    md = macd(df["close"], 12, 26, 9)
    ad = adx_full(df, 14)
    e21 = ema(df["close"], 21)
    return df.assign(
        ema9=ema(df["close"], 9), ema21=e21, ema50=ema(df["close"], 50),
        ema200=ema(df["close"], 200), ema21_slope=e21.diff(5) / df["close"] * 100,
        atr_val=atr(df, 14), rsi_val=rsi(df["close"], 14),
        adx_val=ad["adx"], di_plus=ad["di_plus"], di_minus=ad["di_minus"],
        bb_upper=bb["bb_upper"], bb_middle=bb["bb_middle"], bb_lower=bb["bb_lower"],
        macd_line=md["macd"], macd_signal=md["signal"], macd_hist=md["histogram"],
        volume_sma=df["volume"].rolling(20, min_periods=20).mean(),
    )


def _downtrend(n: int = 300) -> pd.DataFrame:
    return _frame(np.linspace(300, 150, n))


def _uptrend(n: int = 300) -> pd.DataFrame:
    return _frame(np.linspace(150, 300, n))


# ── the components must discriminate, not just compute ──────────────────────

def test_price_action_scores_a_downtrend_above_an_uptrend() -> None:
    down, up = _downtrend(), _uptrend()
    assert _price_action_score(down, down.iloc[-1])[0] > _price_action_score(up, up.iloc[-1])[0]


def test_price_action_rewards_the_inverted_ema_stack() -> None:
    down = _downtrend()
    score, notes = _price_action_score(down, down.iloc[-1])
    assert "EMA stack inverted" in notes
    assert score > 0


def test_trend_strength_requires_di_minus_on_top() -> None:
    down, up = _downtrend(), _uptrend()
    assert "DI- bearish" in _trend_strength_score(down.iloc[-1])[1]
    assert "DI- bearish" not in _trend_strength_score(up.iloc[-1])[1]


def test_trend_strength_rewards_a_falling_ema_slope() -> None:
    notes = _trend_strength_score(_downtrend().iloc[-1])[1]
    assert any("EMA21 slope -" in n for n in notes)


def test_momentum_scores_a_bearish_macd() -> None:
    down, up = _downtrend().iloc[-1], _uptrend().iloc[-1]
    assert "MACD bearish" in _momentum_score(down)[1]
    assert "MACD bearish" not in _momentum_score(up)[1]


def test_momentum_band_stops_at_thirty_to_avoid_oversold() -> None:
    """
    The 30-45 band is deliberate: below 30 a squeeze is as likely as
    continuation, mirroring the long engine refusing an overbought 70+.
    """
    row = _downtrend().iloc[-1].copy()
    row["rsi_val"] = 25.0
    assert not any("RSI" in n for n in _momentum_score(row)[1])
    row["rsi_val"] = 38.0
    assert any("RSI" in n for n in _momentum_score(row)[1])


def test_relative_strength_rewards_underperformance() -> None:
    down = _downtrend()
    bench = pd.Series(np.linspace(100, 130, len(down)), index=down.index)
    score, _, rs20, rs60 = _relative_strength_score(down, bench)
    assert rs20 < 0 and rs60 < 0
    assert score == pytest.approx(100.0)


def test_relative_strength_gives_nothing_to_an_outperformer() -> None:
    up = _uptrend()
    bench = pd.Series(np.linspace(150, 160, len(up)), index=up.index)
    score, _, rs20, _ = _relative_strength_score(up, bench)
    assert rs20 > 0
    assert score < 100.0


def test_volume_quality_is_direction_agnostic() -> None:
    """Conviction is conviction whichever way price moves — same as the long engine."""
    row = _downtrend().iloc[-1].copy()
    row["volume"], row["volume_sma"] = 3_000_000, 1_000_000
    assert _volume_quality_score(row)[0] == 100


# ── score_short end to end ──────────────────────────────────────────────────

def test_score_short_ranks_a_downtrend_far_above_an_uptrend() -> None:
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    down = score_short(_downtrend(), "DOWN.NS", bench)
    up = score_short(_uptrend(), "UP.NS", bench)
    assert down["score"] > up["score"]
    assert down["grade"] == "A"


def test_short_plan_puts_the_stop_above_entry_and_target_below() -> None:
    """The geometry risk/risk.py expects for a SHORT — stop up, target down."""
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    row = score_short(_downtrend(), "DOWN.NS", bench)
    assert row["stop"] > row["entry"]
    assert row["target"] < row["entry"]


def test_short_plan_targets_two_r() -> None:
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    row = score_short(_downtrend(), "DOWN.NS", bench)
    risk = row["stop"] - row["entry"]
    reward = row["entry"] - row["target"]
    assert reward / risk == pytest.approx(2.0, abs=0.01)


def test_the_short_plan_is_accepted_by_the_risk_engine() -> None:
    """The two halves must agree: a plan this emits must size in risk.py."""
    from risk.risk import calculate_position
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    row = score_short(_downtrend(), "DOWN.NS", bench)
    r = calculate_position(row["entry"], row["stop"], row["target"],
                           capital=1_000_000, regime="BEARISH", side="SHORT")
    assert r.side == "SHORT"
    assert r.passed is True, r.rejection_reasons
    assert r.shares > 0


def test_illiquid_names_are_rejected() -> None:
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    thin = _frame(np.linspace(300, 150, 300), volume=50)
    with pytest.raises(ValueError, match="Turnover filter failed"):
        score_short(thin, "THIN.NS", bench)


def test_penny_names_are_rejected() -> None:
    bench = pd.Series(np.linspace(100, 130, 300),
                      index=pd.date_range("2024-01-01", periods=300, freq="B"))
    with pytest.raises(ValueError, match="Price filter failed"):
        score_short(_frame(np.linspace(40, 20, 300)), "PENNY.NS", bench)


def test_too_little_history_is_rejected() -> None:
    bench = pd.Series(np.linspace(100, 130, 30),
                      index=pd.date_range("2024-01-01", periods=30, freq="B"))
    with pytest.raises(ValueError, match="Not enough data"):
        score_short(_frame(np.linspace(300, 250, 30)), "SHORT.NS", bench)


# ── the F&O constraint is load-bearing, not decorative ──────────────────────

def test_runner_returns_only_fno_names_by_default() -> None:
    """A cash short cannot be held overnight on NSE — the default must enforce it."""
    from screener.short_screener import run_short_screener
    df = run_short_screener()
    if df.empty:
        pytest.skip("OHLCV cache unavailable in this environment")
    assert (df["fno"] == 1).all()
    assert (df["lot_size"] > 0).all()


def test_runner_reports_a_percentile_rank() -> None:
    """
    Absolute grades are not selective on the short side (see module docstring),
    so pct_rank has to be there for ranking to mean anything.
    """
    from screener.short_screener import run_short_screener
    df = run_short_screener()
    if df.empty:
        pytest.skip("OHLCV cache unavailable in this environment")
    assert "pct_rank" in df.columns
    assert df["pct_rank"].max() == pytest.approx(100.0)
    assert df.iloc[0]["pct_rank"] >= df.iloc[-1]["pct_rank"]

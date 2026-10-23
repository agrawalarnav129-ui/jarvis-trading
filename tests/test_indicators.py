"""
Tests for utils/indicators.py — the single source of truth for all TA.

Every screener score and every stop is derived from these functions, so the
tests pin down exact arithmetic (hand-computed where feasible) rather than just
asserting shapes. A few tests document deliberate deviations from the usual
platform conventions so they are discovered here and not in a live trade.
"""
from __future__ import annotations

import pandas as pd
import pytest

from utils.indicators import (
    adx_full,
    atr,
    bollinger_bands,
    ema,
    macd,
    rsi,
    validate_dataframe,
)


# ── fixtures ────────────────────────────────────────────────────────────────

def _ohlcv(n: int = 120, seed: int = 11) -> pd.DataFrame:
    """A realistic random-walk OHLCV frame: high/low move independently."""
    import numpy as np
    rng = np.random.default_rng(seed)
    close = 500 + np.cumsum(rng.normal(0, 6, n))
    high = close + rng.uniform(1.0, 9.0, n)
    low = close - rng.uniform(1.0, 9.0, n)
    openp = close + rng.normal(0, 3, n)
    vol = rng.integers(200_000, 3_000_000, n)
    return pd.DataFrame({"open": openp, "high": high, "low": low,
                         "close": close, "volume": vol})


@pytest.fixture
def ohlcv() -> pd.DataFrame:
    return _ohlcv()


# ── validate_dataframe ──────────────────────────────────────────────────────

def test_validate_dataframe_rejects_empty() -> None:
    with pytest.raises(ValueError, match="empty"):
        validate_dataframe(pd.DataFrame(), ["close"])


def test_validate_dataframe_names_the_missing_columns() -> None:
    df = pd.DataFrame({"close": [1.0, 2.0]})
    with pytest.raises(ValueError, match="missing required columns"):
        validate_dataframe(df, ["close", "high", "low"])


def test_validate_dataframe_passes_when_satisfied(ohlcv: pd.DataFrame) -> None:
    assert validate_dataframe(ohlcv, ["open", "high", "low", "close", "volume"]) is None


# ── EMA ─────────────────────────────────────────────────────────────────────

def test_ema_matches_hand_computation() -> None:
    """span=3 -> alpha=0.5, adjust=False: [1, 1.5, 2.25, 3.125]."""
    got = ema(pd.Series([1.0, 2.0, 3.0, 4.0]), 3)
    assert list(got.round(6)) == [1.0, 1.5, 2.25, 3.125]


def test_ema_seeds_on_first_observation(ohlcv: pd.DataFrame) -> None:
    assert ema(ohlcv["close"], 50).iloc[0] == pytest.approx(ohlcv["close"].iloc[0])


def test_ema_of_a_constant_series_is_that_constant() -> None:
    assert ema(pd.Series([42.0] * 30), 9).iloc[-1] == pytest.approx(42.0)


def test_faster_ema_tracks_price_more_closely(ohlcv: pd.DataFrame) -> None:
    close = ohlcv["close"]
    fast_err = (close - ema(close, 9)).abs().iloc[30:].mean()
    slow_err = (close - ema(close, 200)).abs().iloc[30:].mean()
    assert fast_err < slow_err


# ── RSI ─────────────────────────────────────────────────────────────────────

def test_rsi_stays_within_bounds(ohlcv: pd.DataFrame) -> None:
    vals = rsi(ohlcv["close"], 14).dropna()
    assert len(vals) > 50
    assert vals.min() >= 0.0
    assert vals.max() <= 100.0


def test_rsi_of_alternating_moves_sits_near_fifty() -> None:
    vals = [100.0]
    for i in range(60):
        vals.append(vals[-1] + (1.0 if i % 2 == 0 else -1.0))
    assert float(rsi(pd.Series(vals), 14).iloc[-1]) == pytest.approx(50.0, abs=1.5)


def test_rsi_of_a_pure_downtrend_is_zero() -> None:
    falling = pd.Series([float(x) for x in range(60, 0, -1)])
    assert float(rsi(falling, 14).iloc[-1]) == pytest.approx(0.0)


def test_rsi_warmup_is_nan_before_the_period() -> None:
    vals = rsi(_ohlcv(40)["close"], 14)
    assert vals.iloc[:13].isna().all()


def test_rsi_of_a_pure_uptrend_is_one_hundred() -> None:
    """No down-closes means avg_loss is 0, RS is +inf, and RSI pins at 100."""
    rising = pd.Series([float(x) for x in range(1, 61)])
    assert float(rsi(rising, 14).iloc[-1]) == pytest.approx(100.0)


def test_rsi_stays_float_dtype_on_a_pure_uptrend() -> None:
    """
    Regression guard: the old `.replace(0, pd.NA)` divisor produced object
    dtype and <NA>, which `pd.notna()` reads as missing — so a clean uptrend
    would silently score zero momentum instead of maximum.

    Latent, not observed: no symbol in the OHLCV cache has 14 consecutive bars
    without a down-close. It needs a guard anyway, because the failure is a
    silent zero rather than an error.
    """
    vals = rsi(pd.Series([float(x) for x in range(1, 61)]), 14)
    assert vals.dtype == "float64"
    assert pd.notna(vals.iloc[-1])


def test_rsi_of_a_flat_series_is_nan() -> None:
    """Zero gains and zero losses: RSI is genuinely undefined, not 0 or 100."""
    assert pd.isna(rsi(pd.Series([100.0] * 60), 14).iloc[-1])


# ── Bollinger Bands ─────────────────────────────────────────────────────────

def test_bollinger_band_ordering(ohlcv: pd.DataFrame) -> None:
    bb = bollinger_bands(ohlcv["close"], 20, 2).dropna()
    assert (bb["bb_upper"] > bb["bb_middle"]).all()
    assert (bb["bb_middle"] > bb["bb_lower"]).all()


def test_bollinger_middle_is_the_simple_moving_average(ohlcv: pd.DataFrame) -> None:
    bb = bollinger_bands(ohlcv["close"], 20, 2)
    sma = ohlcv["close"].rolling(20, min_periods=20).mean()
    pd.testing.assert_series_equal(bb["bb_middle"], sma, check_names=False)


def test_bollinger_uses_sample_std_ddof_one(ohlcv: pd.DataFrame) -> None:
    """
    Deliberate deviation: pandas' rolling().std() defaults to ddof=1 (sample),
    whereas most charting platforms use ddof=0 (population). Bands here are
    ~1% wider than TradingView's. Not a bug — just don't expect an exact match.
    """
    bb = bollinger_bands(ohlcv["close"], 20, 2)
    win = ohlcv["close"].iloc[-20:]
    assert float(bb["bb_upper"].iloc[-1]) == pytest.approx(
        float(win.mean() + 2 * win.std(ddof=1)))
    assert float(bb["bb_upper"].iloc[-1]) != pytest.approx(
        float(win.mean() + 2 * win.std(ddof=0)))


def test_bollinger_width_collapses_on_a_flat_series() -> None:
    bb = bollinger_bands(pd.Series([100.0] * 40), 20, 2)
    assert float(bb["bb_upper"].iloc[-1]) == pytest.approx(100.0)
    assert float(bb["bb_lower"].iloc[-1]) == pytest.approx(100.0)


# ── ATR ─────────────────────────────────────────────────────────────────────

def test_atr_requires_high_low_close() -> None:
    with pytest.raises(ValueError, match="missing required columns"):
        atr(pd.DataFrame({"close": [1.0, 2.0, 3.0]}), 14)


def test_atr_is_positive_and_warms_up(ohlcv: pd.DataFrame) -> None:
    a = atr(ohlcv, 14)
    assert a.iloc[:13].isna().all()
    assert (a.dropna() > 0).all()


def test_atr_of_constant_true_range_equals_that_range() -> None:
    """high-low fixed at 2.0 with no gaps -> ATR converges to 2.0."""
    n = 80
    df = pd.DataFrame({"high": [102.0] * n, "low": [100.0] * n, "close": [101.0] * n})
    assert float(atr(df, 14).iloc[-1]) == pytest.approx(2.0, abs=1e-6)


def test_atr_uses_span_smoothing_not_wilder(ohlcv: pd.DataFrame) -> None:
    """
    Deliberate deviation: this ATR smooths with ewm(span=14) -> alpha 0.1333,
    while Wilder's ATR (the TradingView default) uses alpha = 1/14 = 0.0714.
    Levels stay within a few percent but this one reacts roughly twice as fast.
    """
    project = atr(ohlcv, 14)
    tr = pd.concat([
        ohlcv["high"] - ohlcv["low"],
        (ohlcv["high"] - ohlcv["close"].shift()).abs(),
        (ohlcv["low"] - ohlcv["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    wilder = tr.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    assert float(project.iloc[-1]) != pytest.approx(float(wilder.iloc[-1]), rel=1e-4)
    assert float(project.iloc[-1]) == pytest.approx(float(wilder.iloc[-1]), rel=0.25)


# ── MACD ────────────────────────────────────────────────────────────────────

def test_macd_line_is_fast_minus_slow_ema(ohlcv: pd.DataFrame) -> None:
    out = macd(ohlcv["close"], 12, 26, 9)
    expected = ema(ohlcv["close"], 12) - ema(ohlcv["close"], 26)
    pd.testing.assert_series_equal(out["macd"], expected, check_names=False)


def test_macd_histogram_is_line_minus_signal(ohlcv: pd.DataFrame) -> None:
    out = macd(ohlcv["close"], 12, 26, 9)
    pd.testing.assert_series_equal(
        out["histogram"], out["macd"] - out["signal"], check_names=False)


def test_macd_of_a_constant_series_is_flat_zero() -> None:
    out = macd(pd.Series([250.0] * 80), 12, 26, 9)
    assert float(out["macd"].iloc[-1]) == pytest.approx(0.0, abs=1e-9)
    assert float(out["histogram"].iloc[-1]) == pytest.approx(0.0, abs=1e-9)


def test_macd_returns_the_three_expected_columns(ohlcv: pd.DataFrame) -> None:
    assert list(macd(ohlcv["close"]).columns) == ["macd", "signal", "histogram"]


# ── ADX ─────────────────────────────────────────────────────────────────────

def test_adx_requires_high_low_close() -> None:
    with pytest.raises(ValueError, match="missing required columns"):
        adx_full(pd.DataFrame({"close": [1.0, 2.0, 3.0]}), 14)


def test_adx_full_returns_adx_and_both_di_legs(ohlcv: pd.DataFrame) -> None:
    out = adx_full(ohlcv, 14)
    assert list(out.columns) == ["adx", "di_plus", "di_minus"]


def test_adx_stays_within_bounds(ohlcv: pd.DataFrame) -> None:
    out = adx_full(ohlcv, 14).dropna()
    assert len(out) > 50
    assert out["adx"].min() >= 0.0
    assert out["adx"].max() <= 100.0
    assert (out["di_plus"] >= 0).all()
    assert (out["di_minus"] >= 0).all()


def test_adx_matches_the_adx_column_of_adx_full(ohlcv: pd.DataFrame) -> None:
    from utils.indicators import adx as adx_series
    pd.testing.assert_series_equal(
        adx_series(ohlcv, 14), adx_full(ohlcv, 14)["adx"], check_names=False)


def test_adx_of_a_flat_series_is_nan_not_an_error() -> None:
    n = 60
    flat = pd.DataFrame({"high": [100.0] * n, "low": [100.0] * n, "close": [100.0] * n})
    assert pd.isna(adx_full(flat, 14)["adx"].iloc[-1])


def test_adx_survives_lockstep_high_low_movement() -> None:
    """
    High and low rising in exact lockstep zeroes both DM legs. That used to
    make the DX series object dtype and the following .ewm() raised pandas
    DataError; it must yield NaN instead.
    """
    n = 60
    df = pd.DataFrame({
        "high": [float(i) + 2 for i in range(n)],
        "low": [float(i) for i in range(n)],
        "close": [float(i) + 1 for i in range(n)],
    })
    out = adx_full(df, 14)
    assert pd.isna(out["adx"].iloc[-1]) or 0.0 <= float(out["adx"].iloc[-1]) <= 100.0


def test_adx_dx_series_stays_float_dtype() -> None:
    """Regression guard for the object-dtype path that caused the DataError."""
    n = 60
    df = pd.DataFrame({
        "high": [float(i) + 2 for i in range(n)],
        "low": [float(i) for i in range(n)],
        "close": [float(i) + 1 for i in range(n)],
    })
    assert adx_full(df, 14)["adx"].dtype == "float64"

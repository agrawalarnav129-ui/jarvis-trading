"""
Short-candidate screener — the mirror of screener/screener.py.

Where the long engine wants an EMA stack fanning up, rising relative strength
and a breakout on volume, this wants the stack fanning down, relative strength
bleeding against the index, and a breakdown on volume. The five scoring
components and their weights are the same (config.SCORE_WEIGHTS); only the
direction of every test is flipped.

Two things make a short different from an inverted long, and both are
first-class here rather than left to the trader:

1. **Overnight holds need an F&O name.** A cash-market short on NSE must be
   squared off the same session — there is no delivery to make. Only the ~213
   names with stock futures can be carried. `fno` and `lot_size` ride on every
   row, and `fno_only` defaults to True because the stated style is "hours to
   days", not pure intraday.

2. **Loss is uncapped.** A long can lose its entry price; a short cannot bound
   its loss. That does not change the scoring, but it is why `MAX_ATR_PCT`
   still applies: a name already moving 6%+ a day is not one to be short
   without a defined stop you can actually hold.

Regime gating lives in risk/risk.py, which blocks shorts in a BULLISH regime
the same way it blocks longs in a BEARISH one. This module scores candidates;
it does not authorise a trade.

GRADES DO NOT MEAN THE SAME THING HERE
--------------------------------------
The A/B/C thresholds in config (A >= 75) were calibrated on the long engine
and do not transfer. Measured on the same session: the long screen graded 9 of
336 names A (2.7%, median score 20.0); this one graded 57 of 167 A (34.1%,
median 70.5). Two reasons compound — the short screen runs only on the 213
F&O names, which are large and liquid and fall together, and it runs them
through a tape where nearly everything is falling, so the component tests fire
in lockstep rather than discriminating.

So a "Grade A short" is not the conviction signal a "Grade A long" is. Until
the thresholds are re-derived from forward-tested outcomes (analytics/honesty.py
is the tool for that), rank on `pct_rank` — each row's percentile within this
run — which stays selective whatever the absolute scores do.
"""
from __future__ import annotations

from typing import Any

import pandas as pd
from loguru import logger

from config import (
    ADX_PERIOD,
    ATR_PERIOD,
    BB_PERIOD,
    BB_STD_DEV,
    BREAKOUT_LOOKBACK,
    EMA_PERIODS,
    EMA_SLOPE_BARS,
    GRADE_A_MIN,
    GRADE_B_MIN,
    MACD_FAST,
    MACD_SIGNAL,
    MACD_SLOW,
    MAX_ATR_PCT,
    MIN_ADX,
    MIN_ATR_PCT,
    MIN_AVG_VOLUME,
    MIN_PRICE,
    MIN_TURNOVER_CR,
    RSI_PERIOD,
    SCORE_WEIGHTS,
    VOLUME_SMA_PERIOD,
)
from utils.indicators import adx_full, atr, bollinger_bands, ema, macd, rsi

MAX_PRICE = 100_000.0


# ─────────────────────────────────────────────────────────────────
# SCORING COMPONENTS — each 0–100 raw, mirroring the long engine
# ─────────────────────────────────────────────────────────────────

def _price_action_score(history: pd.DataFrame, latest: pd.Series) -> tuple[float, list[str]]:
    """
    Price Action — 0 to 100 raw (weight: 30%).
      EMA stack inverted (9<21<50)      : 30 pts
      Near 52W low (within 5%)          : 20 pts
      Below BB mid                      : 15 pts
      Range breakdown (close < 20D low) : 20 pts
      Candle body strength (>=50%)      : 15 pts
    """
    score = 0.0
    notes: list[str] = []

    if latest["ema9"] < latest["ema21"] < latest["ema50"]:
        score += 30
        notes.append("EMA stack inverted")

    low_52 = history["close"].rolling(window=252, min_periods=20).min().iloc[-1]
    if pd.notna(low_52) and low_52 > 0 and latest["close"] <= 1.05 * low_52:
        score += 20
        notes.append("Near 52W low")

    if pd.notna(latest["bb_middle"]) and latest["close"] < latest["bb_middle"]:
        score += 15
        notes.append("Below BB mid")

    lookback_low = (
        history["close"].iloc[-(BREAKOUT_LOOKBACK + 1):-1].min()
        if len(history) > BREAKOUT_LOOKBACK
        else 0
    )
    if lookback_low > 0 and latest["close"] < lookback_low:
        score += 20
        notes.append(f"Breakdown {BREAKOUT_LOOKBACK}D low")

    candle_range = latest["high"] - latest["low"]
    if candle_range > 0:
        body = abs(latest["close"] - latest["open"]) if "open" in latest.index else 0
        if body / candle_range >= 0.50:
            score += 15
            notes.append("Strong body")

    return score, notes


def _trend_strength_score(latest: pd.Series) -> tuple[float, list[str]]:
    """
    Trend Strength — 0 to 100 raw (weight: 25%).
      ADX level (>=25=40, >=18=20)   : 40 pts
      DI- > DI+                      : 20 pts
      EMA21 slope negative           : 40 pts

    ADX is direction-agnostic, so a strong reading alone says nothing about
    which way. DI- > DI+ is what makes it a downtrend.
    """
    score = 0.0
    notes: list[str] = []

    adx_val = latest["adx_val"]
    if pd.notna(adx_val):
        if adx_val >= 25:
            score += 40
            notes.append(f"ADX {adx_val:.0f} strong")
        elif adx_val >= MIN_ADX:
            score += 20
            notes.append(f"ADX {adx_val:.0f}")

    if pd.notna(latest["di_plus"]) and pd.notna(latest["di_minus"]):
        if latest["di_minus"] > latest["di_plus"]:
            score += 20
            notes.append("DI- bearish")

    slope = latest.get("ema21_slope")
    if slope is not None and pd.notna(slope) and slope < 0:
        score += 40
        notes.append(f"EMA21 slope {slope:.2f}%")

    return score, notes


def _relative_strength_score(
    history: pd.DataFrame, benchmark: pd.Series
) -> tuple[float, list[str], float, float]:
    """
    Relative Strength — 0 to 100 raw (weight: 20%). Underperformance scores.

    Returns: (score, notes, rs_20d, rs_60d) where a negative RS means the name
    lagged the index over that window.
    """
    score = 0.0
    notes: list[str] = []
    rs_20d = 0.0
    rs_60d = 0.0

    if benchmark.empty or len(history) < 61:
        notes.append("RS: insufficient data")
        return score, notes, rs_20d, rs_60d

    stock_closes = history["close"].dropna()
    stock_closes.index = pd.to_datetime(stock_closes.index).tz_localize(None)
    bench = benchmark.copy()
    bench.index = pd.to_datetime(bench.index).tz_localize(None)

    common = stock_closes.index.intersection(bench.index)
    if len(common) < 61:
        notes.append("RS: insufficient common dates")
        return score, notes, rs_20d, rs_60d

    s = stock_closes.reindex(common)
    b = bench.reindex(common)

    if len(s) >= 21:
        rs_20d = round((s.iloc[-1] / s.iloc[-21] - 1) * 100 - (b.iloc[-1] / b.iloc[-21] - 1) * 100, 2)
        if rs_20d < 0:
            score += 50
            notes.append(f"RS 20D: {rs_20d:.1f}%")

    if len(s) >= 61:
        rs_60d = round((s.iloc[-1] / s.iloc[-61] - 1) * 100 - (b.iloc[-1] / b.iloc[-61] - 1) * 100, 2)
        if rs_60d < 0:
            score += 50
            notes.append(f"RS 60D: {rs_60d:.1f}%")

    return score, notes, rs_20d, rs_60d


def _momentum_score(latest: pd.Series) -> tuple[float, list[str]]:
    """
    Momentum — 0 to 100 raw (weight: 15%).
      RSI in 30–45 sweet spot     : 50 pts
      MACD histogram negative     : 30 pts
      MACD line < signal line     : 20 pts

    The band stops at 30 on purpose. Below that a name is oversold and the
    next move is as likely to be a squeeze as a continuation — the mirror of
    the long engine refusing to chase an overbought 70+.
    """
    score = 0.0
    notes: list[str] = []

    rsi_val = latest.get("rsi_val")
    if pd.notna(rsi_val) and 30 <= rsi_val <= 45:
        score += 50
        notes.append(f"RSI {rsi_val:.0f}")

    macd_hist = latest.get("macd_hist")
    if pd.notna(macd_hist) and macd_hist < 0:
        score += 30
        notes.append("MACD hist -")

    macd_line = latest.get("macd_line")
    macd_sig = latest.get("macd_signal")
    if pd.notna(macd_line) and pd.notna(macd_sig) and macd_line < macd_sig:
        score += 20
        notes.append("MACD bearish")

    return score, notes


def _volume_quality_score(latest: pd.Series) -> tuple[float, list[str]]:
    """
    Volume Quality — 0 to 100 raw (weight: 10%). Identical to the long engine:
    conviction is conviction whichever way price is going.
    """
    score = 0.0
    notes: list[str] = []

    if pd.isna(latest.get("volume_sma")) or latest["volume_sma"] == 0:
        return score, notes

    ratio = latest["volume"] / latest["volume_sma"]
    if ratio >= 3.0:
        score, label = 100, "surge"
    elif ratio >= 2.0:
        score, label = 80, "strong"
    elif ratio >= 1.5:
        score, label = 60, "confirm"
    elif ratio >= 1.0:
        score, label = 30, "avg"
    else:
        return score, notes
    notes.append(f"Vol {label} {ratio:.1f}x")
    return score, notes


def _detect_setup_flags(history: pd.DataFrame, latest: pd.Series) -> list[str]:
    """Categorical setups: BREAKDOWN, DISTRIBUTION, MOMENTUM_DOWN."""
    flags: list[str] = []

    lookback_low = (
        history["close"].iloc[-(BREAKOUT_LOOKBACK + 1):-1].min()
        if len(history) > BREAKOUT_LOOKBACK
        else 0
    )
    vol_ratio = (
        latest["volume"] / latest["volume_sma"]
        if pd.notna(latest.get("volume_sma")) and latest["volume_sma"] > 0
        else 0
    )
    if lookback_low > 0 and latest["close"] < lookback_low and vol_ratio >= 1.5 \
            and pd.notna(latest["adx_val"]) and latest["adx_val"] >= 20:
        flags.append("BREAKDOWN")

    # Distribution: falling into rising volume while already below the 200 EMA.
    if vol_ratio >= 1.5 and latest["close"] < latest["ema200"] and latest["close"] < latest["ema50"]:
        flags.append("DISTRIBUTION")

    ema_inverted = latest["ema9"] < latest["ema21"] < latest["ema50"]
    macd_bear = (
        pd.notna(latest.get("macd_hist")) and latest["macd_hist"] < 0
        and pd.notna(latest.get("macd_line")) and pd.notna(latest.get("macd_signal"))
        and latest["macd_line"] < latest["macd_signal"]
    )
    rsi_ok = pd.notna(latest.get("rsi_val")) and 25 <= latest["rsi_val"] <= 50
    if ema_inverted and macd_bear and rsi_ok:
        flags.append("MOMENTUM_DOWN")

    return flags


# ─────────────────────────────────────────────────────────────────
# SYMBOL SCORER
# ─────────────────────────────────────────────────────────────────

def score_short(history: pd.DataFrame, symbol: str, benchmark: pd.Series) -> dict[str, Any]:
    """Score one symbol as a short candidate.

    Args:
        history: OHLCV frame, oldest first.
        symbol: The yfinance ticker, used for reporting.
        benchmark: Nifty closes for the relative-strength comparison.

    Returns:
        A row dict with the five component scores, the weighted total, a grade
        and the levels a trade would use.

    Raises:
        ValueError: If the frame is too short or fails a hard filter.
    """
    if history.empty:
        raise ValueError("History data is empty")

    history = history.copy()
    history.columns = [c.lower() for c in history.columns]
    # Not inplace=True: deprecated in pandas 3 (PDEP-8), and this project
    # already runs on 3.1.
    history = history.dropna(subset=["close", "high", "low", "volume"])

    if len(history) < 40:
        raise ValueError(f"Not enough data for symbol {symbol}")

    bb = bollinger_bands(history["close"], BB_PERIOD, BB_STD_DEV)
    macd_df = macd(history["close"], MACD_FAST, MACD_SLOW, MACD_SIGNAL)
    adx_df = adx_full(history, ADX_PERIOD)
    ema21_series = ema(history["close"], EMA_PERIODS[1])

    history = history.assign(
        ema9=ema(history["close"], EMA_PERIODS[0]),
        ema21=ema21_series,
        ema50=ema(history["close"], EMA_PERIODS[2]),
        ema200=ema(history["close"], EMA_PERIODS[3]),
        ema21_slope=(ema21_series.diff(EMA_SLOPE_BARS) / history["close"] * 100),
        atr_val=atr(history, ATR_PERIOD),
        rsi_val=rsi(history["close"], RSI_PERIOD),
        adx_val=adx_df["adx"],
        di_plus=adx_df["di_plus"],
        di_minus=adx_df["di_minus"],
        bb_upper=bb["bb_upper"],
        bb_middle=bb["bb_middle"],
        bb_lower=bb["bb_lower"],
        macd_line=macd_df["macd"],
        macd_signal=macd_df["signal"],
        macd_hist=macd_df["histogram"],
        volume_sma=history["volume"].rolling(
            window=VOLUME_SMA_PERIOD, min_periods=VOLUME_SMA_PERIOD
        ).mean(),
    )

    latest = history.iloc[-1]

    # ── Hard filters (same gates as the long engine) ──
    atr_pct = latest["atr_val"] / latest["close"] if latest["close"] > 0 else 0
    if latest["close"] < MIN_PRICE or latest["close"] > MAX_PRICE:
        raise ValueError(f"Price filter failed: {latest['close']:.2f}")
    if atr_pct < MIN_ATR_PCT or atr_pct > MAX_ATR_PCT:
        raise ValueError(f"ATR filter failed: {atr_pct:.4f}")

    vol_sma = latest.get("volume_sma")
    if pd.isna(vol_sma) or vol_sma <= 0:
        raise ValueError("Liquidity filter failed: no 20D volume baseline")
    turnover_cr = float(latest["close"]) * float(vol_sma) / 1e7
    if turnover_cr < MIN_TURNOVER_CR:
        raise ValueError(f"Turnover filter failed: {turnover_cr:.2f}cr < {MIN_TURNOVER_CR}cr")
    if vol_sma < MIN_AVG_VOLUME:
        raise ValueError(f"Volume floor failed: {vol_sma:.0f} < {MIN_AVG_VOLUME}")

    pa_raw, pa_notes = _price_action_score(history, latest)
    tr_raw, tr_notes = _trend_strength_score(latest)
    rs_raw, rs_notes, rs_20d, rs_60d = _relative_strength_score(history, benchmark)
    mom_raw, mom_notes = _momentum_score(latest)
    vol_raw, vol_notes = _volume_quality_score(latest)

    w = SCORE_WEIGHTS
    total = (
        pa_raw * w["price_action"]
        + tr_raw * w["trend_strength"]
        + rs_raw * w["rel_strength"]
        + mom_raw * w["momentum"]
        + vol_raw * w["volume"]
    )

    close = float(latest["close"])
    atr_val = float(latest["atr_val"])
    # Mirror of the long plan: stop above entry at 1.5 ATR, target 2R below.
    stop = round(close + 1.5 * atr_val, 2)
    target = round(close - 2 * (stop - close), 2)

    grade = "A" if total >= GRADE_A_MIN else ("B" if total >= GRADE_B_MIN else "C")
    vol_ratio = round(float(latest["volume"]) / float(vol_sma), 2)

    return {
        "symbol": symbol,
        "close": round(close, 2),
        "volume": int(latest["volume"]),
        "volume_ratio": vol_ratio,
        "turnover_cr": round(turnover_cr, 2),
        "score": round(float(total), 1),
        "grade": grade,
        "pa_score": round(pa_raw, 1),
        "trend_score": round(tr_raw, 1),
        "rs_score": round(rs_raw, 1),
        "momentum_score": round(mom_raw, 1),
        "vol_score": round(vol_raw, 1),
        "rs_20d": rs_20d,
        "rs_60d": rs_60d,
        "rsi": round(float(latest["rsi_val"]), 1) if pd.notna(latest.get("rsi_val")) else None,
        "adx": round(float(latest["adx_val"]), 1) if pd.notna(latest.get("adx_val")) else None,
        "di_plus": round(float(latest["di_plus"]), 1) if pd.notna(latest.get("di_plus")) else None,
        "di_minus": round(float(latest["di_minus"]), 1) if pd.notna(latest.get("di_minus")) else None,
        "atr_pct": round(float(atr_pct) * 100, 2),
        "ema50": round(float(latest["ema50"]), 2),
        "ema200": round(float(latest["ema200"]), 2),
        "entry": round(close, 2),
        "stop": stop,
        "target": target,
        "setup_flags": "; ".join(_detect_setup_flags(history, latest)),
        "notes": "; ".join(pa_notes + tr_notes + rs_notes + mom_notes + vol_notes),
    }


def run_short_screener(symbols: list[str] | None = None, fno_only: bool = True) -> pd.DataFrame:
    """Score the universe for short candidates, ranked worst-looking first.

    Args:
        symbols: Explicit tickers, or None for the whole universe.
        fno_only: Keep only names with stock futures. True by default because
            a cash short cannot be held overnight on NSE, and the stated
            holding period is hours to days.

    Returns:
        A ranked DataFrame; empty if nothing scored.
    """
    from data.fetcher import load_universe
    from screener.screener import _fetch_nifty_benchmark

    universe = load_universe()
    fno_map: dict[str, dict] = {}
    if "fno" in universe.columns:
        for _, row in universe.iterrows():
            fno_map[str(row["symbol"])] = {
                "fno": int(row.get("fno", 0) or 0),
                "lot_size": int(row.get("lot_size", 0) or 0),
            }

    if symbols is None:
        symbols = universe["symbol"].tolist()
    symbols = list(dict.fromkeys(symbols))
    if not symbols:
        raise ValueError("No symbols provided for short screener")

    if fno_only and fno_map:
        symbols = [s for s in symbols if fno_map.get(s, {}).get("fno") == 1]
        logger.info("F&O filter: {} shortable-overnight symbols", len(symbols))

    benchmark = _fetch_nifty_benchmark(period="6mo")
    if benchmark.empty:
        logger.warning("Benchmark unavailable — RS scores will be 0")

    from data.fetcher import fetch_symbols_history
    histories = fetch_symbols_history(symbols, period="6mo", interval="1d")

    results: list[dict[str, Any]] = []
    skipped = 0
    for symbol in symbols:
        history = histories.get(symbol)
        if history is None:
            skipped += 1
            continue
        try:
            row = score_short(history, symbol, benchmark)
            meta = fno_map.get(symbol, {})
            row["fno"] = meta.get("fno", 0)
            row["lot_size"] = meta.get("lot_size", 0)
            results.append(row)
        except Exception as exc:
            logger.debug("Skipped {}: {}", symbol, exc)
            skipped += 1

    logger.info("Short screener scored {} symbols, skipped {}", len(results), skipped)
    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results).sort_values("score", ascending=False).reset_index(drop=True)
    df["rank"] = range(1, len(df) + 1)
    # Percentile within this run. The absolute grade is not selective on the
    # short side (see the module docstring); this is, whatever the tape does.
    df["pct_rank"] = (df["score"].rank(pct=True) * 100).round(1)
    return df

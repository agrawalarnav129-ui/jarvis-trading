"""
Defensive board — which liquid NSE names move least with the Nifty.

WHAT THIS IS NOT
----------------
This is not a list of stocks that rise when the market falls. Those barely
exist on NSE. Measured across the OHLCV cache over 250 sessions, the *most*
negatively correlated name sits at about -0.09 and nothing clears -0.10; the
mean correlation to the index is around +0.42. Screening for "high negative
correlation" returns either nothing or illiquid noise whose price simply did
not move.

What does exist is low beta: names that fall less than the index does. OIL,
IPCALAB and ONGC have all run at or below 0.02 beta while trading ₹45cr+ a day.
Holding them through a drawdown loses less money. It does not make money.

So every row carries `down_capture` — the mean daily return on sessions when
the index fell — alongside beta, and the UI is expected to show it. A name can
post positive down-capture purely because it was trending hard enough to
outrun the market's down days; STLTECH did exactly that at beta 1.21. That is
drift, not a hedge, and it reverses with the trend. `up_capture` is reported
next to it so the trade-off is visible: a name that misses the falls usually
misses the rallies too.

Two rules from CLAUDE.md still bind, and the caller is expected to enforce
them rather than treat this board as permission:
  - Section 6: BEARISH regime → no long entries, position size 0.
  - Section 7: regime BEARISH → no long setups, even A-grade.
A low-beta name is still a long.
"""
from __future__ import annotations

import numpy as np

from config import MIN_TURNOVER_CR

BENCH = "^NSEI"
BETA_WINDOW = 250
MIN_BARS = 260
CORR_WINDOWS = (60, 120, 250)


def _log_returns(values: np.ndarray) -> np.ndarray:
    """Daily log returns from a close series.

    Args:
        values: Close prices, oldest first.

    Returns:
        Log returns, one shorter than the input.
    """
    return np.diff(np.log(values))


def _metrics(stock_ret: np.ndarray, bench_ret: np.ndarray) -> dict[str, float | None]:
    """Beta, correlations and up/down capture for one symbol against the index.

    Args:
        stock_ret: The symbol's log returns.
        bench_ret: The benchmark's log returns, same length and dates.

    Returns:
        Metrics keyed by name; a value is None when the window is too short.
    """
    out: dict[str, float | None] = {}
    for window in CORR_WINDOWS:
        key = f"corr_{window}d"
        if len(stock_ret) >= window:
            out[key] = round(float(np.corrcoef(stock_ret[-window:], bench_ret[-window:])[0, 1]), 3)
        else:
            out[key] = None

    if len(stock_ret) >= BETA_WINDOW:
        s = stock_ret[-BETA_WINDOW:]
        b = bench_ret[-BETA_WINDOW:]
        # ddof must match on both sides: np.cov defaults to ddof=1 while
        # np.var defaults to ddof=0, which inflates every beta by n/(n-1)
        # (~0.4% at a 250-day window — small, but wrong in one direction).
        variance = float(np.var(b, ddof=1))
        out["beta"] = round(float(np.cov(s, b)[0, 1] / variance), 3) if variance > 0 else None
        down = b < 0
        up = b > 0
        # Capture is reported in percent, in the index's own terms, so the
        # reader can compare "stock lost 0.2%" against "index lost 0.6%".
        out["down_capture"] = round(float(np.mean(s[down]) * 100), 3) if down.any() else None
        out["up_capture"] = round(float(np.mean(s[up]) * 100), 3) if up.any() else None
        out["bench_down_mean"] = round(float(np.mean(b[down]) * 100), 3) if down.any() else None
        out["down_days"] = int(down.sum())
    else:
        out.update({"beta": None, "down_capture": None, "up_capture": None,
                    "bench_down_mean": None, "down_days": 0})
    return out


def defensive_board(limit: int = 40, max_beta: float = 0.75) -> dict:
    """Rank liquid symbols by how little they move with the Nifty.

    Args:
        limit: Maximum rows to return, after sorting by beta ascending.
        max_beta: Only include names at or below this 250-day beta.

    Returns:
        A dict with `available`, a `note` stating what the board does and does
        not mean, the current `regime`, and `results` sorted by beta ascending.
        Illiquid names are excluded by the same turnover gate the screener uses.
    """
    from data.fetcher import load_universe
    from data.ohlcv_cache import get_cached_ohlcv

    bench = get_cached_ohlcv(BENCH)
    if bench is None or bench.empty:
        return {"available": False, "note": "Nifty benchmark not in the OHLCV cache.",
                "results": []}

    rows: list[dict] = []
    skipped_illiquid = 0
    skipped_short = 0

    for symbol in load_universe()["symbol"].dropna().astype(str):
        history = get_cached_ohlcv(symbol)
        if history is None or history.empty or len(history) < MIN_BARS:
            skipped_short += 1
            continue

        common = history.index.intersection(bench.index)
        if len(common) < MIN_BARS:
            skipped_short += 1
            continue

        closes = history["close"].reindex(common).astype(float)
        bench_closes = bench["close"].reindex(common).astype(float)

        volume_sma = float(history["volume"].iloc[-20:].mean())
        last = float(closes.iloc[-1])
        turnover_cr = last * volume_sma / 1e7
        if turnover_cr < MIN_TURNOVER_CR:
            skipped_illiquid += 1
            continue

        metrics = _metrics(_log_returns(closes.values), _log_returns(bench_closes.values))
        if metrics["beta"] is None or metrics["beta"] > max_beta:
            continue

        rows.append({
            "symbol": symbol,
            "close": round(last, 2),
            "turnover_cr": round(turnover_cr, 2),
            **metrics,
        })

    rows.sort(key=lambda r: r["beta"])

    regime = "UNKNOWN"
    try:
        from screener.regime_classifier import classify_regime
        regime = classify_regime().regime
    except Exception:  # noqa: BLE001 — regime is context, not a precondition
        from loguru import logger
        logger.debug("Defensive board could not classify regime")

    return {
        "available": bool(rows),
        "note": ("Low beta means these fall LESS than the index — not that they rise "
                 "when it falls. Negative-correlation names do not meaningfully exist "
                 "on NSE. Check down_capture against bench_down_mean before trusting "
                 "a row, and remember a long is still a long in a BEARISH regime."),
        "regime": regime,
        "beta_window": BETA_WINDOW,
        "max_beta": max_beta,
        "scanned": len(rows) + skipped_illiquid + skipped_short,
        "skipped_illiquid": skipped_illiquid,
        "skipped_short_history": skipped_short,
        "count": len(rows),
        "results": rows[:limit],
    }

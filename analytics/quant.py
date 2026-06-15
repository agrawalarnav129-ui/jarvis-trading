"""
AXIOM Quant Lab — institutional-style analytics built on data we can source
reliably from the cloud (yfinance closes + the Moneycontrol option snapshot).

Tools
-----
- gamma_exposure : dealer gamma (GEX) profile from option-chain OI + a realized-vol
                   gamma estimate; zero-gamma flip, call/put walls. (approximate —
                   uses realized vol as the IV proxy since MC gives no per-strike IV)
- vol_cone       : realized-volatility term structure with historical percentile
                   bands (the data-backed stand-in for an IV surface)
- expectancy_surface : expectancy (R) over a grid of stop(ATR) × target(R:R), via the
                   real breakout backtest engine
- correlation    : return-correlation matrix across symbols (from the closes cache)

Monte-Carlo risk + Kelly run client-side for interactivity (see frontend Quant page).
All option-derived output degrades gracefully when the snapshot is unavailable.
"""
from __future__ import annotations

import math
from datetime import date, datetime

import numpy as np
import pandas as pd
from loguru import logger

SQRT_252 = math.sqrt(252.0)
RISK_FREE = 0.065            # India ~6.5%
_LOT = {"NIFTY": 75, "BANKNIFTY": 35}


# ── Black–Scholes gamma (no scipy dependency) ──────────────────────────────
def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)


def bs_gamma(S: float, K: float, T: float, sigma: float, r: float = RISK_FREE) -> float:
    """Black–Scholes gamma (identical for calls & puts). Guards degenerate inputs."""
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))
    return _norm_pdf(d1) / (S * sigma * math.sqrt(T))


def _realized_vol(closes: pd.Series, window: int = 20) -> float:
    """Annualized realized vol from daily closes (fraction, e.g. 0.18)."""
    lr = np.log(closes / closes.shift(1)).dropna()
    if len(lr) < 5:
        return 0.15
    w = min(window, len(lr))
    return float(lr.tail(w).std() * SQRT_252)


# ── Gamma Exposure (GEX) ───────────────────────────────────────────────────
def gamma_exposure(symbol: str = "NIFTY") -> dict:
    """Dealer gamma-exposure profile from the option chain + realized-vol gamma."""
    from data.options import fetch_option_chain

    symbol = symbol.upper()
    oc = fetch_option_chain(symbol)
    if not oc.get("available") or not oc.get("chain"):
        return {"symbol": symbol, "available": False,
                "note": oc.get("note", "Option snapshot unavailable — refresh from the Options page.")}

    spot = float(oc["spot"]) or 0.0
    # days to expiry
    try:
        dte = max((datetime.strptime(oc["expiry"], "%Y-%m-%d").date() - date.today()).days, 1)
    except Exception:
        dte = 7
    T = dte / 365.0

    # realized vol of the underlying as the IV proxy
    sigma = 0.15
    try:
        from data.fetcher import fetch_symbol_history
        tk = {"NIFTY": "^NSEI", "BANKNIFTY": "^NSEBANK"}.get(symbol, "^NSEI")
        df = fetch_symbol_history(tk, period="3mo", interval="1d")
        if not df.empty:
            sigma = _realized_vol(df["close"], 20)
    except Exception as exc:
        logger.debug("GEX vol estimate fell back: {}", exc)

    lot = _LOT.get(symbol, 50)
    rows = []
    total = 0.0
    for c in oc["chain"]:
        K = float(c["strike"])
        g = bs_gamma(spot, K, T, sigma)
        # dealer convention: long call gamma, short put gamma → net per strike
        gex = g * spot * spot * 0.01 * lot * (c["ceOI"] - c["peOI"])
        total += gex
        rows.append({"strike": K, "gex": round(gex / 1e9, 4),          # ₹ bn per 1% move
                     "ceGamma": round(g * c["ceOI"] * lot, 1),
                     "peGamma": round(g * c["peOI"] * lot, 1)})

    rows.sort(key=lambda x: x["strike"])
    # zero-gamma flip: where cumulative GEX crosses zero across strikes
    flip = None
    cum = 0.0
    for i, rr in enumerate(rows):
        prev = cum
        cum += rr["gex"]
        if i and ((prev <= 0 < cum) or (prev >= 0 > cum)):
            flip = rr["strike"]
            break
    call_wall = max(rows, key=lambda x: x["ceGamma"])["strike"] if rows else None
    put_wall = max(rows, key=lambda x: x["peGamma"])["strike"] if rows else None

    return {
        "symbol": symbol, "available": True, "spot": round(spot, 2), "expiry": oc["expiry"],
        "dte": dte, "sigma": round(sigma * 100, 1), "source": oc.get("source", "Moneycontrol"),
        "total_gex": round(total / 1e9, 3),                # ₹ bn / 1% move
        "regime": "Positive (mean-reverting)" if total > 0 else "Negative (trend-amplifying)",
        "zero_gamma": flip, "call_wall": call_wall, "put_wall": put_wall,
        "profile": rows,
    }


# ── Realized-vol cone / term structure ─────────────────────────────────────
def vol_cone(symbol: str) -> dict:
    """Realized vol by lookback window with historical min/25/50/75/max bands + current."""
    from data.fetcher import fetch_symbol_history

    df = fetch_symbol_history(symbol, period="2y", interval="1d")
    if df.empty or "close" not in df:
        return {"symbol": symbol, "available": False, "note": "No history."}
    lr = np.log(df["close"] / df["close"].shift(1)).dropna()
    windows = [10, 20, 30, 60, 90, 120]
    out = []
    for w in windows:
        if len(lr) < w + 5:
            continue
        rv = lr.rolling(w).std().dropna() * SQRT_252 * 100
        if rv.empty:
            continue
        out.append({
            "window": w, "current": round(float(rv.iloc[-1]), 1),
            "min": round(float(rv.min()), 1), "p25": round(float(rv.quantile(0.25)), 1),
            "median": round(float(rv.median()), 1), "p75": round(float(rv.quantile(0.75)), 1),
            "max": round(float(rv.max()), 1),
        })
    cur = out[1]["current"] if len(out) > 1 else (out[0]["current"] if out else 0)
    med = out[1]["median"] if len(out) > 1 else (out[0]["median"] if out else 0)
    return {"symbol": symbol, "available": bool(out), "cone": out,
            "regime": "Elevated" if cur > med * 1.15 else "Compressed" if cur < med * 0.85 else "Normal"}


# ── Expectancy surface (stop × target grid) ────────────────────────────────
def expectancy_surface(symbol: str) -> dict:
    """Expectancy (R) over a grid of stop(ATR) × target(R:R) using the breakout engine."""
    from backtest.backtest import BacktestConfig, backtest_symbol
    from data.fetcher import fetch_symbol_history

    df = fetch_symbol_history(symbol, period="3y", interval="1d")
    if df.empty:
        return {"symbol": symbol, "available": False, "note": "No history."}

    stops = [1.0, 1.5, 2.0, 2.5, 3.0]
    targets = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
    cells = []
    best = None
    for s in stops:
        for t in targets:
            try:
                res = backtest_symbol(df, symbol=symbol, cfg=BacktestConfig(atr_mult=s, rr_target=t))
                m = res.metrics
                cell = {"stop": s, "target": t,
                        "expectancy": round(float(m.get("expectancy", 0)), 3),
                        "trades": int(m.get("num_trades", m.get("total_trades", len(res.trades)))),
                        "win_rate": round(float(m.get("win_rate", 0)), 1)}
            except Exception:
                cell = {"stop": s, "target": t, "expectancy": 0.0, "trades": 0, "win_rate": 0.0}
            cells.append(cell)
            if cell["trades"] >= 5 and (best is None or cell["expectancy"] > best["expectancy"]):
                best = cell
    return {"symbol": symbol, "available": True, "stops": stops, "targets": targets,
            "cells": cells, "best": best}


# ── Correlation matrix (from closes cache) ─────────────────────────────────
def correlation(symbols: list[str]) -> dict:
    """Return-correlation matrix across symbols using the cached universe closes."""
    from data.closes import read_closes

    data = read_closes().get("data", {})
    have = [s for s in symbols if s in data and len(data[s]) >= 40]
    if len(have) < 2:
        return {"available": False, "note": "Need ≥2 symbols with cached closes.",
                "missing": [s for s in symbols if s not in data]}
    n = min(len(data[s]) for s in have)
    n = min(n, 120)
    rets = {}
    for s in have:
        arr = np.array(data[s][-n:], dtype=float)
        rets[s] = np.diff(np.log(arr))
    M = np.vstack([rets[s] for s in have])
    corr = np.corrcoef(M)
    matrix = [[round(float(corr[i][j]), 2) for j in range(len(have))] for i in range(len(have))]
    # average pairwise correlation (diversification read)
    off = [corr[i][j] for i in range(len(have)) for j in range(len(have)) if i < j]
    return {"available": True, "symbols": [s.replace(".NS", "") for s in have],
            "matrix": matrix, "avg_corr": round(float(np.mean(off)), 2) if off else 0.0, "bars": n}

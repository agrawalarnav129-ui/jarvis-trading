"""
AXIOM API — FastAPI backend that exposes the existing Python trading engine
to the React frontend. Reuses data/, screener/, storage/ modules directly.

Run locally:  uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root on path when run as `uvicorn backend.main:app`
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
load_dotenv()

from cachetools import TTLCache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

from data.econ_calendar import fetch_calendar
from data.fii_dii import fetch_fii_dii
from data.live_market import fetch_gainers_losers, fetch_indices
from data.news_feed import fetch_market_news

IST = ZoneInfo("Asia/Kolkata")

app = FastAPI(title="AXIOM API", version="1.0", description="Advanced eXpert Intelligence for Operations in Market")

# CORS — allow the Vercel frontend + local dev. Tighten ALLOWED_ORIGINS in prod via env.
import os
_origins = os.getenv("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins == "*" else [o.strip() for o in _origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple in-process TTL caches to avoid hammering upstream sources
_cache: dict[str, TTLCache] = {
    "indices":  TTLCache(maxsize=2, ttl=90),
    "movers":   TTLCache(maxsize=2, ttl=90),
    "news":     TTLCache(maxsize=2, ttl=300),
    "calendar": TTLCache(maxsize=2, ttl=900),
    "fii":      TTLCache(maxsize=2, ttl=600),
    "regime":   TTLCache(maxsize=2, ttl=600),
}


def _cached(bucket: str, fn):
    c = _cache[bucket]
    if "v" in c:
        return c["v"]
    val = fn()
    c["v"] = val
    return val


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "AXIOM API", "time_ist": datetime.now(IST).isoformat()}


@app.get("/api/clock")
def clock():
    """Authoritative IST time for the frontend clock."""
    now = datetime.now(IST)
    is_open = now.weekday() < 5 and (now.hour, now.minute) >= (9, 15) and (now.hour, now.minute) <= (15, 30)
    return {"iso": now.isoformat(), "ist": now.strftime("%H:%M:%S"), "date": now.strftime("%a, %d %b %Y"),
            "market_open": is_open}


@app.get("/api/market/indices")
def indices():
    return {"indices": _cached("indices", fetch_indices)}


@app.get("/api/market/movers")
def movers():
    return _cached("movers", lambda: fetch_gainers_losers("NIFTY", 6))


@app.get("/api/news")
def news():
    items = _cached("news", lambda: fetch_market_news(20))
    # datetime objects aren't JSON-serialisable — drop the raw field
    return {"news": [{k: v for k, v in n.items() if k != "published"} for n in items]}


@app.get("/api/calendar")
def calendar():
    cal = _cached("calendar", lambda: fetch_calendar(14))
    corp = [{**e, "date": e["date"].isoformat() if e.get("date") else None} for e in cal.get("corporate", [])]
    macro = [{**e, "date": e["date"].isoformat() if e.get("date") else None} for e in cal.get("macro", [])]
    return {"corporate": corp, "macro": macro}


@app.get("/api/fii-dii")
def fii_dii():
    return _cached("fii", fetch_fii_dii)


@app.get("/api/regime")
def regime():
    def _run():
        from screener.regime_classifier import classify_regime
        r = classify_regime()
        return {
            "regime": r.regime, "nifty_close": r.nifty_close, "ema50": r.ema50,
            "ema200": r.ema200, "adx": r.adx_value, "max_positions": r.max_positions,
            "min_rr": r.min_rr, "reason": r.reason,
        }
    try:
        return _cached("regime", _run)
    except Exception as exc:
        logger.warning("Regime failed: {}", exc)
        raise HTTPException(status_code=503, detail="Regime classification unavailable")


@app.get("/api/watchlist")
def watchlist():
    try:
        import pandas as pd
        from config import WATCHLIST_CSV
        if WATCHLIST_CSV.exists():
            df = pd.read_csv(WATCHLIST_CSV)
            return {"watchlist": df.to_dict("records")}
    except Exception as exc:
        logger.warning("Watchlist read failed: {}", exc)
    return {"watchlist": []}


@app.get("/api/screener")
def screener(limit: int = 30):
    """Heavy — runs the full screener. Cached client-side; call sparingly."""
    try:
        from screener.screener import run_screener
        df = run_screener(None)
        if df.empty:
            return {"results": []}
        cols = [c for c in ["symbol", "grade", "score", "close", "rsi", "adx", "rs_20d", "rs_60d", "notes"] if c in df.columns]
        return {"results": df[cols].head(limit).to_dict("records")}
    except Exception as exc:
        logger.exception("Screener failed: {}", exc)
        raise HTTPException(status_code=503, detail="Screener unavailable")


@app.get("/api/backtest")
def backtest(symbol: str, period: str = "2y", rr: float = 2.5, capital: float = 1_000_000):
    """Run the breakout backtest on one symbol. Returns metrics + recent trades."""
    try:
        from backtest.backtest import BacktestConfig, backtest_symbol
        from data.fetcher import fetch_symbol_history
        sym = symbol.strip().upper()
        if not sym.endswith(".NS"):
            sym += ".NS"
        df = fetch_symbol_history(sym, period=period, interval="1d")
        if df.empty or len(df) < 220:
            raise HTTPException(status_code=422, detail="Insufficient history (need ~220+ daily bars)")
        cfg = BacktestConfig(rr_target=rr, starting_capital=float(capital))
        res = backtest_symbol(df, symbol=sym, cfg=cfg)
        trades = res.trades.copy()
        if not trades.empty:
            for c in ("entry_date", "exit_date"):
                if c in trades.columns:
                    trades[c] = trades[c].astype(str)
        equity = [round(float(v), 2) for v in res.equity.values.tolist()]
        return {"symbol": sym, "metrics": res.metrics,
                "trades": trades.tail(40).to_dict("records") if not trades.empty else [],
                "equity": equity}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Backtest failed: {}", exc)
        raise HTTPException(status_code=503, detail=f"Backtest failed: {exc}")


class AssistantBody(BaseModel):
    message: str
    history: list[dict] = []


@app.post("/api/assistant")
def assistant(body: AssistantBody):
    """AXIOM AI chat — powered by the Groq brain."""
    try:
        from ai.brain import _AXIOM_SYSTEM, _call_groq
        ctx = "\n".join(f"{m.get('role')}: {m.get('text')}" for m in body.history[-6:])
        user = (f"Conversation so far:\n{ctx}\n\n" if ctx else "") + \
               f"User: {body.message}\n\nRespond as AXIOM — institutional NSE trading assistant. Be direct, analytical, professional."
        reply = _call_groq(_AXIOM_SYSTEM, user, max_tokens=900)
        if not reply:
            raise HTTPException(status_code=503, detail="AI unavailable — check GROQ_API_KEY")
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Assistant failed: {}", exc)
        raise HTTPException(status_code=503, detail="AI assistant unavailable")


@app.get("/api/footprint")
def footprint(symbol: str, days: int = 1, bins: int = 30):
    """Approximated order-flow footprint from 1-min bars."""
    try:
        from analytics.footprint import APPROXIMATION_NOTE, build_footprint, fetch_intraday
        sym = symbol.strip().upper()
        if not sym.endswith(".NS"):
            sym += ".NS"
        df = fetch_intraday(sym, days=days, interval="1m")
        if df.empty:
            raise HTTPException(status_code=422, detail="No intraday data (market closed or bad symbol)")
        fp = build_footprint(df, symbol=sym, bins=bins)
        return {
            "symbol": sym, "poc": fp.poc, "total_delta": fp.total_delta, "bars": fp.bars,
            "last": round(float(df["close"].iloc[-1]), 2),
            "profile": fp.profile.to_dict("records"),
            "note": APPROXIMATION_NOTE,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Footprint failed: {}", exc)
        raise HTTPException(status_code=503, detail="Footprint unavailable")


_scan_cache = TTLCache(maxsize=1, ttl=180)


@app.get("/api/scan")
def scan():
    """Scan the watchlist on 15-min data for live signals (BREAKOUT / BB_SQUEEZE / MOMENTUM)."""
    if "v" in _scan_cache:
        return _scan_cache["v"]
    try:
        from monitors.intraday_monitor import _compute_signals, _fetch_15m
        from storage.watchlist_csv import load_watchlist_symbols
        symbols = load_watchlist_symbols()[:18]
        results = []
        for sym in symbols:
            df = _fetch_15m(sym)
            if df.empty:
                continue
            data = _compute_signals(df)
            if not data:
                continue
            results.append({
                "symbol": sym.replace(".NS", ""),
                "signals": data.get("signals", []),
                "close": data.get("close"), "rsi": data.get("rsi"), "adx": data.get("adx"),
                "vol_ratio": data.get("vol_ratio"), "macd_hist": data.get("macd_hist"),
            })
        # signals first, then by ADX
        results.sort(key=lambda r: (-len(r["signals"]), -(r.get("adx") or 0)))
        out = {"count": len(symbols), "results": results, "ist": datetime.now(IST).strftime("%H:%M:%S")}
        _scan_cache["v"] = out
        return out
    except Exception as exc:
        logger.exception("Scan failed: {}", exc)
        raise HTTPException(status_code=503, detail="Scanner unavailable")


@app.get("/")
def root():
    return {"service": "AXIOM API", "docs": "/docs", "health": "/api/health"}

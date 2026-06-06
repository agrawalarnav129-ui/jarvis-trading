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


@app.get("/")
def root():
    return {"service": "AXIOM API", "docs": "/docs", "health": "/api/health"}

"""
Universe closes cache — powers the Sketch Pattern Finder.

Pattern matching needs recent daily closes for the whole universe. Fetching 500+
symbols on every request is impossible on the cloud backend, so a job (GitHub
Actions, where yfinance works) dumps a compact {symbol: [last N closes]} JSON
that the backend reads (GitHub-raw first, like options_cache.json).
"""
from __future__ import annotations

import json
from datetime import datetime

import requests
from loguru import logger

from config import DATA_DIR

CACHE_FILE = DATA_DIR / "closes_cache.json"
GITHUB_RAW = "https://raw.githubusercontent.com/agrawalarnav129-ui/jarvis-trading/main/data/closes_cache.json"
BARS = 120  # daily closes kept per symbol


def build_closes_cache(period: str = "8mo") -> dict:
    """Fetch the universe's recent daily closes and write the compact cache."""
    from data.fetcher import fetch_symbols_history, load_universe

    uni = load_universe()
    symbols = uni["symbol"].dropna().astype(str).tolist()
    logger.info("Building closes cache for {} symbols…", len(symbols))

    out: dict[str, list[float]] = {}
    hist = fetch_symbols_history(symbols, period=period, interval="1d")
    for sym, df in hist.items():
        if df is None or df.empty or "close" not in df.columns:
            continue
        closes = df["close"].dropna().tail(BARS).round(2).tolist()
        if len(closes) >= 30:
            out[sym] = closes

    payload = {"updated": datetime.utcnow().isoformat() + "Z", "bars": BARS, "data": out}
    CACHE_FILE.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    logger.info("Closes cache written: {} symbols → {}", len(out), CACHE_FILE)
    return payload


def read_closes() -> dict:
    """Read the closes cache — GitHub raw first (fresh), then local build-time copy."""
    try:
        r = requests.get(GITHUB_RAW, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"updated": None, "bars": BARS, "data": {}}

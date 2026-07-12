"""
Fundamentals cache — company info / shareholding / quarterly results for the
whole universe, built nightly by GitHub Actions (yfinance works there; Yahoo's
quoteSummary API intermittently blocks Render's datacenter IP).

The Company Terminal tries a live fetch first (freshest when Yahoo allows) and
falls back to this cache, so it always works on the cloud.
"""
from __future__ import annotations

import gzip
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import requests
from loguru import logger

from config import DATA_DIR

CACHE_FILE = DATA_DIR / "fundamentals_cache.json.gz"
GITHUB_RAW = "https://raw.githubusercontent.com/agrawalarnav129-ui/jarvis-trading/main/data/fundamentals_cache.json.gz"

_RAW: dict | None = None


def _load() -> dict:
    global _RAW
    if _RAW is not None:
        return _RAW
    try:
        if CACHE_FILE.exists():
            with gzip.open(CACHE_FILE, "rt", encoding="utf-8") as f:
                _RAW = json.load(f).get("data", {})
            logger.info("Fundamentals cache loaded: {} symbols", len(_RAW))
            return _RAW
    except Exception as exc:
        logger.warning("Fundamentals cache load failed: {}", exc)
    try:
        r = requests.get(GITHUB_RAW, timeout=15)
        if r.status_code == 200:
            _RAW = json.loads(gzip.decompress(r.content).decode("utf-8")).get("data", {})
            logger.info("Fundamentals cache loaded from GitHub raw: {} symbols", len(_RAW))
            return _RAW
    except Exception as exc:
        logger.warning("Fundamentals raw fetch failed: {}", exc)
    _RAW = {}
    return _RAW


def get_cached_fundamentals(symbol: str) -> dict | None:
    sym = symbol.upper().replace(".NS", "")
    return _load().get(sym)


# ── builder (GitHub Actions / residential) ──────────────────────────────────
def build_fundamentals_cache(max_symbols: int = 520, workers: int = 6) -> dict:
    import warnings
    warnings.simplefilter("ignore")

    from data.company import fetch_company
    from data.fetcher import load_universe

    symbols = [s.replace(".NS", "") for s in
               load_universe()["symbol"].dropna().astype(str).tolist()[:max_symbols]]
    symbols = list(dict.fromkeys(symbols))
    logger.info("Building fundamentals cache for {} symbols…", len(symbols))

    def _one(sym: str):
        try:
            c = fetch_company(sym, use_cache=False)
            if not c.get("available"):
                return None
            c.pop("tech", None)          # technicals are computed fresh at read time
            if c.get("summary"):
                c["summary"] = str(c["summary"])[:400]
            # earnings dates (past + scheduled) → powers the earnings playbook
            try:
                import yfinance as yf
                ed = yf.Ticker(f"{sym}.NS").earnings_dates
                if ed is not None and len(ed):
                    c["earnings_dates"] = sorted({d.strftime("%Y-%m-%d") for d in ed.index})
            except Exception:
                pass
            return (sym, c)
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = [r for r in ex.map(_one, symbols) if r]

    out = {sym: c for sym, c in results}
    payload = {"updated": datetime.utcnow().isoformat() + "Z", "count": len(out), "data": out}
    with gzip.open(CACHE_FILE, "wt", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), default=str)
    logger.info("Fundamentals cache written: {} symbols → {} ({:.2f} MB)",
                len(out), CACHE_FILE, CACHE_FILE.stat().st_size / 1e6)
    return payload

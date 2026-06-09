"""
NSE index option-chain analytics — PCR, max-pain, support/resistance, ATM IV.

NSE blocks datacenter IPs (Render), so the deployed backend reads a JSON snapshot
committed by the GitHub Action (jobs/run_options_cache) via GitHub raw; locally /
in Actions it fetches NSE directly.
"""
from __future__ import annotations

import json
from datetime import datetime

import requests
from loguru import logger

from config import DATA_DIR

NSE_BASE = "https://www.nseindia.com"
OC_API = "https://www.nseindia.com/api/option-chain-indices?symbol={sym}"
CACHE_FILE = DATA_DIR / "options_cache.json"
GITHUB_RAW = "https://raw.githubusercontent.com/agrawalarnav129-ui/jarvis-trading/main/data/options_cache.json"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/option-chain",
}
SYMBOLS = ["NIFTY", "BANKNIFTY"]


def _analyse(payload: dict, symbol: str) -> dict:
    rec = payload.get("records", {})
    rows = rec.get("data", [])
    spot = rec.get("underlyingValue", 0)
    expiries = rec.get("expiryDates", [])
    expiry = expiries[0] if expiries else None

    ce_oi = pe_oi = 0
    strikes: dict[float, dict] = {}
    for r in rows:
        if expiry and r.get("expiryDate") != expiry:
            continue
        k = r.get("strikePrice")
        ce = r.get("CE") or {}
        pe = r.get("PE") or {}
        coi = ce.get("openInterest", 0) or 0
        poi = pe.get("openInterest", 0) or 0
        ce_oi += coi; pe_oi += poi
        strikes[k] = {"strike": k, "ceOI": coi, "peOI": poi,
                      "ceIV": ce.get("impliedVolatility", 0) or 0, "peIV": pe.get("impliedVolatility", 0) or 0}

    sl = sorted(strikes.values(), key=lambda x: x["strike"])
    # Max pain: strike minimizing total intrinsic payout to option holders
    def pain(at: float) -> float:
        tot = 0.0
        for s in sl:
            tot += s["ceOI"] * max(0, at - s["strike"]) + s["peOI"] * max(0, s["strike"] - at)
        return tot
    max_pain = min((s["strike"] for s in sl), key=pain) if sl else None

    resistance = max(sl, key=lambda x: x["ceOI"])["strike"] if sl else None  # highest CE OI
    support = max(sl, key=lambda x: x["peOI"])["strike"] if sl else None      # highest PE OI
    atm = min((s for s in sl), key=lambda x: abs(x["strike"] - spot)) if sl else None
    atm_iv = round((atm["ceIV"] + atm["peIV"]) / 2, 1) if atm else None

    return {
        "symbol": symbol, "spot": round(float(spot), 2), "expiry": expiry,
        "pcr": round(pe_oi / ce_oi, 2) if ce_oi else 0,
        "total_ce_oi": int(ce_oi), "total_pe_oi": int(pe_oi),
        "max_pain": max_pain, "support": support, "resistance": resistance, "atm_iv": atm_iv,
        # OI-by-strike near spot for the chart (±15 strikes)
        "chain": [s for s in sl if atm and abs(s["strike"] - atm["strike"]) <= 15 * (sl[1]["strike"] - sl[0]["strike"] if len(sl) > 1 else 50)][:31],
    }


def fetch_option_chain(symbol: str = "NIFTY") -> dict:
    symbol = symbol.upper()
    try:
        s = requests.Session(); s.headers.update(_HEADERS)
        s.get(NSE_BASE, timeout=10)
        s.get(f"{NSE_BASE}/option-chain", timeout=10)
        r = s.get(OC_API.format(sym=symbol), timeout=12)
        r.raise_for_status()
        out = _analyse(r.json(), symbol)
        out["source"] = "NSE live"
        return out
    except Exception as exc:
        logger.warning("Option-chain direct fetch failed ({}); trying cache", type(exc).__name__)
        cached = _read_cache().get(symbol)
        if cached:
            return {**cached, "source": "NSE snapshot (cached)"}
        return {"symbol": symbol, "available": False, "note": f"Option chain unavailable ({type(exc).__name__})"}


def write_cache() -> None:
    """Fetch all index chains and persist (run in GitHub Actions where NSE works)."""
    out = {}
    for sym in SYMBOLS:
        try:
            out[sym] = fetch_option_chain(sym)
        except Exception as exc:
            logger.warning("Options cache {} failed: {}", sym, exc)
    out["updated"] = datetime.utcnow().isoformat() + "Z"
    CACHE_FILE.write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
    logger.info("Options cache written: {}", CACHE_FILE)


def _read_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        r = requests.get(GITHUB_RAW, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return {}

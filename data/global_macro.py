"""
Global macro snapshot — world indices, commodities, crypto, FX for the AXIOM
situational-awareness dashboard. yfinance works from the cloud for these global
tickers (unlike NSE). Includes a simple risk-on/off composite.
"""
from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

from loguru import logger

# group -> [(label, ticker, kind)] ; kind drives sign interpretation for risk
INDICES = [
    ("S&P 500", "^GSPC"), ("Nasdaq", "^IXIC"), ("Dow", "^DJI"),
    ("FTSE 100", "^FTSE"), ("DAX", "^GDAXI"), ("Nikkei", "^N225"),
    ("Hang Seng", "^HSI"), ("VIX", "^VIX"),
]
COMMODITIES = [("Gold", "GC=F"), ("Silver", "SI=F"), ("Crude WTI", "CL=F"),
               ("Brent", "BZ=F"), ("Nat Gas", "NG=F"), ("Copper", "HG=F")]
CRYPTO = [("Bitcoin", "BTC-USD"), ("Ethereum", "ETH-USD"), ("Solana", "SOL-USD")]
FX = [("USD/INR", "INR=X"), ("Dollar Index", "DX-Y.NYB"), ("EUR/USD", "EURUSD=X"),
      ("USD/JPY", "JPY=X")]

_ALL = INDICES + COMMODITIES + CRYPTO + FX


def fetch_global_macro() -> dict:
    import yfinance as yf

    tickers = [t for _, t in _ALL]
    try:
        df = yf.download(tickers, period="5d", interval="1d", progress=False,
                         group_by="ticker", threads=True)
    except Exception as exc:
        logger.warning("global macro download failed: {}", exc)
        return {"available": False, "note": "Global feed temporarily unavailable."}

    def quote(t: str) -> dict | None:
        try:
            c = df[t]["Close"].dropna()
            if len(c) < 2:
                return None
            last, prev = float(c.iloc[-1]), float(c.iloc[-2])
            return {"last": round(last, 2), "pct": round((last / prev - 1) * 100, 2)}
        except Exception:
            return None

    def pack(rows):
        out = []
        for label, t in rows:
            q = quote(t)
            if q:
                out.append({"label": label, "symbol": t, **q})
        return out

    idx, com, cry, fx = pack(INDICES), pack(COMMODITIES), pack(CRYPTO), pack(FX)

    # Risk-on/off composite: equities up, VIX down, gold down, crypto up, DXY down → risk-on
    signals = []
    qd = {r["label"]: r["pct"] for r in idx + com + cry + fx}
    for nm in ("S&P 500", "Nasdaq", "Nikkei"):
        if nm in qd: signals.append(qd[nm] > 0)
    if "VIX" in qd: signals.append(qd["VIX"] < 0)
    if "Gold" in qd: signals.append(qd["Gold"] < 0)
    if "Bitcoin" in qd: signals.append(qd["Bitcoin"] > 0)
    if "Dollar Index" in qd: signals.append(qd["Dollar Index"] < 0)
    score = round(sum(signals) / len(signals) * 100) if signals else 50
    tone = "Risk-On" if score >= 60 else "Risk-Off" if score <= 35 else "Mixed"

    return {
        "available": bool(idx or com), "indices": idx, "commodities": com,
        "crypto": cry, "fx": fx, "risk_score": score, "risk_tone": tone,
    }

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


@app.get("/api/tasks")
def tasks(session: str = "pre-market"):
    """AI-generated pre/post-market checklist."""
    try:
        from ai.brain import generate_task_list
        from data.fetcher import load_universe
        try:
            n = len(load_universe())
        except Exception:
            n = 0
        checklist = generate_task_list({
            "session": session, "symbol_count": n, "market": "NSE",
            "time": datetime.now(IST).strftime("%H:%M IST"),
            "date": datetime.now(IST).strftime("%d %b %Y"),
        })
        return {"session": session, "checklist": checklist or ""}
    except Exception as exc:
        logger.exception("Tasks failed: {}", exc)
        raise HTTPException(status_code=503, detail="Checklist generation unavailable")


@app.get("/api/briefing")
def briefing():
    """Generate the institutional morning briefing text (cross-asset context + AI)."""
    try:
        from ai.brain import generate_market_briefing
        from data.market_context import build_briefing_context
        context = build_briefing_context()
        text = generate_market_briefing(context)
        if not text:
            raise HTTPException(status_code=503, detail="AI unavailable — check GROQ_API_KEY")
        return {"briefing": text, "date": datetime.now(IST).strftime("%d %b %Y")}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Briefing failed: {}", exc)
        raise HTTPException(status_code=503, detail="Briefing unavailable")


class BriefingSend(BaseModel):
    briefing: str


@app.post("/api/briefing/telegram")
def briefing_to_telegram(body: BriefingSend):
    """Render the briefing to a branded PDF and send it to Telegram."""
    try:
        from pathlib import Path
        from monitors.telegram_bot import send_document
        from reports.pdf_generator import generate_text_report
        out = ROOT / "data" / "reports"
        out.mkdir(parents=True, exist_ok=True)
        pdf = out / f"briefing_{datetime.now(IST).strftime('%Y%m%d_%H%M')}.pdf"
        generate_text_report("AXIOM Morning Briefing", body.briefing, pdf)
        ok, err = send_document(pdf, caption=f"📊 <b>AXIOM Morning Briefing — {datetime.now(IST).strftime('%d %b %Y')}</b>")
        if not ok:
            raise HTTPException(status_code=503, detail=f"Telegram send failed: {err}")
        return {"sent": True, "file": pdf.name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Briefing->Telegram failed: {}", exc)
        raise HTTPException(status_code=503, detail="Send failed")


@app.get("/api/history")
def history(symbol: str, period: str = "6mo"):
    """OHLCV + indicators for one symbol (powers the Stock Detail chart)."""
    try:
        import pandas as pd
        from data.fetcher import fetch_symbol_history
        from utils.indicators import adx_full, atr, ema, macd, rsi
        sym = symbol.strip().upper()
        if not sym.endswith(".NS"):
            sym += ".NS"
        df = fetch_symbol_history(sym, period=period, interval="1d")
        if df.empty:
            raise HTTPException(status_code=422, detail="No data for symbol")
        close = df["close"]
        ema20, ema50, ema200 = ema(close, 20), ema(close, 50), ema(close, 200)
        rsi_s = rsi(close, 14)
        adx_s = adx_full(df, 14)["adx"]
        last = df.iloc[-1]
        candles = [
            {"t": str(idx.date()), "o": round(float(r.open), 2), "h": round(float(r.high), 2),
             "l": round(float(r.low), 2), "c": round(float(r.close), 2), "v": int(r.volume),
             "e20": round(float(ema20.loc[idx]), 2) if pd.notna(ema20.loc[idx]) else None,
             "e50": round(float(ema50.loc[idx]), 2) if pd.notna(ema50.loc[idx]) else None}
            for idx, r in df.tail(180).iterrows()
        ]
        prev = float(close.iloc[-2]) if len(close) > 1 else float(last.close)
        return {
            "symbol": sym, "last": round(float(last.close), 2),
            "change": round(float(last.close) - prev, 2),
            "pct": round((float(last.close) - prev) / prev * 100, 2) if prev else 0.0,
            "rsi": round(float(rsi_s.iloc[-1]), 1) if pd.notna(rsi_s.iloc[-1]) else None,
            "adx": round(float(adx_s.iloc[-1]), 1) if pd.notna(adx_s.iloc[-1]) else None,
            "ema20": round(float(ema20.iloc[-1]), 2), "ema50": round(float(ema50.iloc[-1]), 2),
            "ema200": round(float(ema200.iloc[-1]), 2) if pd.notna(ema200.iloc[-1]) else None,
            "atr": round(float(atr(df, 14).iloc[-1]), 2),
            "high_52w": round(float(close.tail(252).max()), 2),
            "low_52w": round(float(close.tail(252).min()), 2),
            "candles": candles,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("History failed: {}", exc)
        raise HTTPException(status_code=503, detail="History unavailable")


@app.get("/api/analysis")
def analysis(symbol: str):
    """AI 9-section technical analysis for one symbol."""
    try:
        from ai.brain import generate_stock_analysis
        h = history(symbol)  # reuse computed indicators
        data = {k: h[k] for k in ("last", "pct", "rsi", "adx", "ema20", "ema50", "ema200", "atr", "high_52w", "low_52w")}
        text = generate_stock_analysis(h["symbol"], data)
        return {"symbol": h["symbol"], "analysis": text}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Analysis failed: {}", exc)
        raise HTTPException(status_code=503, detail="Analysis unavailable")


_sec_cache = TTLCache(maxsize=1, ttl=180)


@app.get("/api/sectors")
def sectors():
    """Sector performance (1-day %) for the heatmap — yfinance-based."""
    if "v" in _sec_cache:
        return _sec_cache["v"]
    from data.market_context import fetch_sector_performance
    perf = fetch_sector_performance()
    items = sorted([{"sector": k, "pct": v} for k, v in perf.items()], key=lambda x: x["pct"], reverse=True)
    out = {"sectors": items}
    _sec_cache["v"] = out
    return out


@app.get("/api/quote")
def quote(symbols: str):
    """Batch last price + day % for a comma-separated symbol list (yfinance)."""
    try:
        import yfinance as yf
        syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:40]
        tickers = [s if s.endswith(".NS") else s + ".NS" for s in syms]
        if not tickers:
            return {"quotes": []}
        data = yf.download(tickers, period="2d", interval="1d", group_by="ticker",
                           auto_adjust=True, progress=False, threads=True)
        out = []
        for s, t in zip(syms, tickers):
            try:
                df = data[t].dropna() if len(tickers) > 1 else data.dropna()
                if len(df) < 1:
                    continue
                last = float(df["Close"].iloc[-1])
                prev = float(df["Close"].iloc[-2]) if len(df) > 1 else last
                out.append({"symbol": s.replace(".NS", ""), "ltp": round(last, 2),
                            "change": round(last - prev, 2),
                            "pct": round((last - prev) / prev * 100, 2) if prev else 0.0})
            except Exception:
                continue
        return {"quotes": out}
    except Exception as exc:
        logger.warning("Quote failed: {}", exc)
        return {"quotes": []}


@app.post("/api/assistant/stream")
def assistant_stream(body: AssistantBody):
    """Streaming AXIOM chat — yields tokens as plain text as they arrive."""
    from fastapi.responses import StreamingResponse
    from ai.brain import _AXIOM_SYSTEM, call_groq_stream
    ctx = "\n".join(f"{m.get('role')}: {m.get('text')}" for m in body.history[-6:])
    user = (f"Conversation so far:\n{ctx}\n\n" if ctx else "") + \
           f"User: {body.message}\n\nRespond as AXIOM — institutional NSE trading assistant. Be direct, analytical, professional."

    def gen():
        for tok in call_groq_stream(_AXIOM_SYSTEM, user):
            yield tok

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/")
def root():
    return {"service": "AXIOM API", "docs": "/docs", "health": "/api/health"}

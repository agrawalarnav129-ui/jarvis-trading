"""
Company terminal data — fundamentals, shareholding and quarterly financials via
yfinance (works from the cloud), technicals computed from the OHLCV cache.
Powers the Bloomberg-style /terminal page.

Shareholding note: yfinance exposes insider (≈promoter) and institutional
percentages — not the full NSE quarterly FII/DII/public pattern (that API is
blocked from datacenter IPs), so the panel is honest about its granularity.
"""
from __future__ import annotations

import warnings
warnings.simplefilter("ignore")

import numpy as np
from loguru import logger

_INFO_MAP = {
    # profile
    "name": "longName", "sector": "sector", "industry": "industry",
    "summary": "longBusinessSummary", "market_cap": "marketCap",
    "shares_out": "sharesOutstanding",
    # valuation
    "pe": "trailingPE", "fwd_pe": "forwardPE", "pb": "priceToBook",
    "ev_ebitda": "enterpriseToEbitda", "div_yield": "dividendYield",
    "payout": "payoutRatio", "beta": "beta", "eps": "trailingEps", "book_value": "bookValue",
    # performance
    "roe": "returnOnEquity", "roa": "returnOnAssets",
    "profit_margin": "profitMargins", "op_margin": "operatingMargins",
    "rev_growth": "revenueGrowth", "earn_growth": "earningsGrowth",
    # health
    "de": "debtToEquity", "current_ratio": "currentRatio",
    "total_cash": "totalCash", "total_debt": "totalDebt", "fcf": "freeCashflow",
    "revenue": "totalRevenue", "net_income": "netIncomeToCommon",
    # 52w
    "high_52w": "fiftyTwoWeekHigh", "low_52w": "fiftyTwoWeekLow",
}


def _num(v):
    try:
        f = float(v)
        return None if f != f else round(f, 4)
    except (TypeError, ValueError):
        return None


def _quarters(t) -> list[dict]:
    """Last ~5 quarters of revenue / net income / EBITDA."""
    try:
        q = t.quarterly_income_stmt
        if q is None or q.empty:
            return []
        rows = []
        for col in list(q.columns)[:5]:
            def g(name):
                try:
                    return _num(q.at[name, col])
                except Exception:
                    return None
            rows.append({
                "quarter": col.strftime("%b %Y") if hasattr(col, "strftime") else str(col)[:10],
                "revenue": g("Total Revenue"),
                "net_income": g("Net Income"),
                "ebitda": g("EBITDA") or g("Normalized EBITDA"),
            })
        rows.reverse()  # oldest → newest for charting
        return rows
    except Exception as exc:
        logger.debug("quarters failed: {}", exc)
        return []


def _technicals(symbol: str) -> dict:
    """RSI/ADX/EMAs/supertrend/RS etc. from the OHLCV cache (instant)."""
    try:
        from data.ohlcv_cache import get_cached_ohlcv
        from screener.ta_engine import compute_indicators
        df = get_cached_ohlcv(symbol)
        nifty = get_cached_ohlcv("^NSEI")
        if df is None or df.empty:
            return {}
        ind = compute_indicators(df, nifty)
        last = ind.iloc[-1]

        def s(col, dec=2):
            try:
                f = float(last.get(col, np.nan))
                return None if f != f else round(f, dec)
            except (TypeError, ValueError):
                return None
        return {
            "close": s("close"), "pct_chg": s("pct_chg"), "pct_chg20": s("pct_chg20"),
            "rsi14": s("rsi14", 1), "adx14": s("adx14", 1), "atr_pct": s("atr_pct"),
            "ema20": s("ema20"), "ema50": s("ema50"), "ema200": s("ema200"),
            "supertrend_dir": int(last.get("supertrend_dir", 0) or 0),
            "vol_ratio": s("vol_ratio"), "rs_nifty": s("rs_nifty", 3),
            "pct52h": s("pct52h"), "pct52l": s("pct52l"),
            "macd_hist": s("macd_hist", 3), "bb_pctb": s("bb_pctb", 3),
        }
    except Exception as exc:
        logger.debug("technicals failed for {}: {}", symbol, exc)
        return {}


def fetch_company(symbol: str, use_cache: bool = True) -> dict:
    """Live yfinance fetch, falling back to the nightly fundamentals cache when
    Yahoo's quoteSummary blocks the server IP (intermittent on datacenters)."""
    import yfinance as yf

    sym = symbol.upper()
    ysym = sym if sym.endswith(".NS") or sym.startswith("^") else f"{sym}.NS"
    t = yf.Ticker(ysym)
    try:
        info = t.info or {}
    except Exception as exc:
        logger.warning("company info failed for {}: {}", ysym, exc)
        info = {}
    if not info.get("longName") and not info.get("marketCap"):
        if use_cache:
            try:
                from data.fundamentals_cache import get_cached_fundamentals
                cached = get_cached_fundamentals(sym)
                if cached and cached.get("available"):
                    out = dict(cached)
                    out["tech"] = _technicals(ysym)      # technicals stay fresh (OHLCV cache)
                    out["from_cache"] = True
                    return out
            except Exception as exc:
                logger.debug("fundamentals cache fallback failed: {}", exc)
        return {"symbol": sym.replace(".NS", ""), "available": False,
                "note": f"No company data for {sym.replace('.NS', '')}."}

    out: dict = {"symbol": sym.replace(".NS", ""), "available": True}
    for k, src in _INFO_MAP.items():
        out[k] = _num(info.get(src)) if k not in ("name", "sector", "industry", "summary") else info.get(src)
    if out.get("summary"):
        out["summary"] = str(out["summary"])[:600]

    # shareholding (yfinance granularity: promoters/insiders + institutions)
    out["holding"] = {
        "promoters": _num(info.get("heldPercentInsiders")),
        "institutions": _num(info.get("heldPercentInstitutions")),
        "inst_count": _num(info.get("institutionsCount")),
    }
    try:
        mh = t.major_holders
        if mh is not None and "Value" in getattr(mh, "columns", []):
            vals = mh["Value"].to_dict()
            out["holding"]["promoters"] = _num(vals.get("insidersPercentHeld", out["holding"]["promoters"]))
            out["holding"]["institutions"] = _num(vals.get("institutionsPercentHeld", out["holding"]["institutions"]))
            out["holding"]["inst_count"] = _num(vals.get("institutionsCount", out["holding"]["inst_count"]))
    except Exception:
        pass
    h = out["holding"]
    if h.get("promoters") is not None and h.get("institutions") is not None:
        h["public"] = round(max(0.0, 1 - h["promoters"] - h["institutions"]), 4)

    out["quarters"] = _quarters(t)
    out["tech"] = _technicals(ysym)
    return out

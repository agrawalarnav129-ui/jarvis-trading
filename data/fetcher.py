from __future__ import annotations

import warnings
warnings.filterwarnings("ignore", category=FutureWarning, module="yfinance")

from pathlib import Path
from typing import Any

import pandas as pd
import requests
import yfinance as yf
from loguru import logger

from config import CACHE_DIR, UNIVERSE_CSV
from data.fyers_client import FyersClient


def ensure_cache_dir() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _period_to_dates(period: str) -> tuple[str, str]:
    now = pd.Timestamp.now().normalize()
    if period.endswith("y"):
        years = int(period[:-1])
        start = now - pd.DateOffset(years=years)
    elif period.endswith("mo"):
        months = int(period[:-2])
        start = now - pd.DateOffset(months=months)
    elif period.endswith("d"):
        days = int(period[:-1])
        start = now - pd.Timedelta(days=days)
    else:
        start = now - pd.DateOffset(years=1)
    return start.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")


def _fetch_history_from_yfinance(symbol: str, period: str, interval: str) -> pd.DataFrame:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        return df
    df.columns = [c.lower() for c in df.columns]
    if hasattr(df.index, "tzinfo") and df.index.tzinfo is not None:
        df.index = df.index.tz_localize(None)
    return df


def _fetch_history_from_fyers(symbol: str, period: str, interval: str) -> pd.DataFrame:
    client = FyersClient()
    if not client.is_available():
        raise ValueError("Fyers API is not available")
    return client.fetch_historical_data(symbol, period=period, interval=interval)


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase columns and strip timezone from index."""
    if df.empty:
        return df
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    if hasattr(df.index, "tzinfo") and df.index.tzinfo is not None:
        df.index = df.index.tz_localize(None)
    return df


def fetch_symbol_history(symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV history for a single symbol and cache as parquet."""
    ensure_cache_dir()
    safe = symbol.replace(":", "_").replace(".", "_")
    symbol_path = CACHE_DIR / f"{safe}_{interval}_{period}.parquet"
    if symbol_path.exists():
        df = pd.read_parquet(symbol_path)
        if not df.empty:
            return _normalise(df)

    logger.info("Fetching history for %s", symbol)
    client = FyersClient()
    if client.is_available():
        try:
            df = _normalise(_fetch_history_from_fyers(symbol, period, interval))
            df.to_parquet(symbol_path)
            return df
        except Exception as exc:
            logger.warning("Fyers fetch failed for %s: %s", symbol, exc)

    try:
        df = _normalise(_fetch_history_from_yfinance(symbol, period, interval))
    except Exception as exc:
        logger.exception("yfinance fetch failed for %s: %s", symbol, exc)
        raise

    if df.empty:
        raise ValueError(f"No data returned for symbol: {symbol}")
    df.to_parquet(symbol_path)
    return df


def fetch_symbols_history(symbols: list[str], period: str = "6mo", interval: str = "1d") -> dict[str, pd.DataFrame]:
    """Fetch OHLCV history for multiple symbols."""
    results: dict[str, pd.DataFrame] = {}
    for symbol in symbols:
        try:
            results[symbol] = fetch_symbol_history(symbol, period=period, interval=interval)
        except Exception as exc:
            logger.warning("Failed to fetch %s: %s", symbol, exc)
    return results


def load_universe() -> pd.DataFrame:
    """Load the symbol universe from CSV."""
    if not UNIVERSE_CSV.exists():
        raise FileNotFoundError(f"Universe file not found: {UNIVERSE_CSV}")
    df = pd.read_csv(UNIVERSE_CSV)
    df.columns = df.columns.str.lower()
    # Use yfinance_ticker as symbol so .NS suffix is included for all fetches
    if "yfinance_ticker" in df.columns:
        df = df.assign(symbol=df["yfinance_ticker"])
    return df

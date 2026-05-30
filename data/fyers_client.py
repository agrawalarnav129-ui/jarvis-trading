from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import pandas as pd
import requests
from loguru import logger


class FyersClient:
    """Fyers API v2 client — historical data, positions, funds, orders."""

    def __init__(self) -> None:
        self.client_id = os.getenv("FYERS_CLIENT_ID", "")
        self.secret = os.getenv("FYERS_SECRET_KEY", "")
        self.access_token = os.getenv("FYERS_ACCESS_TOKEN", "")
        self.base_url = os.getenv("FYERS_API_BASE_URL", "https://api-t1.fyers.in/api/v3")

    def is_available(self) -> bool:
        return bool(self.access_token and self.client_id)

    def _headers(self) -> dict[str, str]:
        # Fyers v2 auth: "{client_id}:{access_token}"
        return {
            "Authorization": f"{self.client_id}:{self.access_token}",
            "Content-Type": "application/json",
        }

    # ── HISTORICAL DATA ───────────────────────────────────────────

    def fetch_historical_data(self, symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        """Fetch historical OHLCV data from Fyers."""
        if not self.is_available():
            raise ValueError("Fyers access token is not configured")

        start_date, end_date = self._period_to_dates(period)
        resolution = self._map_interval(interval)
        url = "https://api-t1.fyers.in/data/history"
        params = {
            "symbol": symbol,
            "resolution": resolution,
            "date_format": 1,
            "range_from": start_date,
            "range_to": end_date,
            "cont_flag": 0,
        }
        response = requests.get(url, headers=self._headers(), params=params, timeout=30)
        response.raise_for_status()
        return self._parse_history(response.json())

    def _period_to_dates(self, period: str) -> tuple[str, str]:
        today = datetime.utcnow().date()
        if period.endswith("y"):
            years = int(period[:-1])
            start = today.replace(year=today.year - years)
        elif period.endswith("mo"):
            months = int(period[:-2])
            start = today.replace(month=max(1, today.month - months))
        elif period.endswith("d"):
            days = int(period[:-1])
            from datetime import timedelta
            start = today - timedelta(days=days)
        else:
            from datetime import timedelta
            start = today - timedelta(days=365)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")

    def _map_interval(self, interval: str) -> str:
        if interval == "1d":
            return "1D"
        if interval.endswith("m"):
            return interval.upper()
        return interval

    def _parse_history(self, payload: dict[str, Any]) -> pd.DataFrame:
        candles = payload.get("candles")
        if not candles:
            raise ValueError("Fyers history payload did not contain candles")
        df = pd.DataFrame(candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["date"] = pd.to_datetime(df["timestamp"], unit="s")
        df.set_index("date", inplace=True)
        return df[["open", "high", "low", "close", "volume"]]

    # ── LIVE PORTFOLIO ────────────────────────────────────────────

    def get_raw_funds(self) -> dict[str, Any]:
        """Return raw Fyers /funds response for debugging."""
        if not self.is_available():
            return {"error": "Fyers not configured"}
        try:
            resp = requests.get(f"{self.base_url}/funds", headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            return {"error": str(exc)}

    def get_raw_positions(self) -> dict[str, Any]:
        """Return raw Fyers /positions response for debugging."""
        if not self.is_available():
            return {"error": "Fyers not configured"}
        try:
            resp = requests.get(f"{self.base_url}/positions", headers=self._headers(), timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            return {"error": str(exc)}

    def get_positions(self) -> list[dict[str, Any]]:
        """Fetch current open positions from Fyers."""
        if not self.is_available():
            logger.warning("Fyers not configured — skipping positions fetch")
            return []
        try:
            data = self.get_raw_positions()
            if data.get("s") != "ok":
                logger.warning("Fyers positions error: {}", data.get("message", "unknown"))
                return []
            # Handle both flat {"netPositions": [...]} and nested {"data": {"netPositions": [...]}}
            positions = (
                data.get("netPositions")
                or data.get("data", {}).get("netPositions")
                or []
            )
            return [
                {
                    "symbol":       p.get("symbol", ""),
                    "qty":          p.get("netQty", 0),
                    "avg_price":    round(float(p.get("netAvgPrice", 0)), 2),
                    "ltp":          round(float(p.get("ltp", 0)), 2),
                    "pnl":          round(float(p.get("pl", 0)), 2),
                    "pnl_pct":      round(
                        (float(p.get("ltp", 0)) - float(p.get("netAvgPrice", 1)))
                        / max(float(p.get("netAvgPrice", 1)), 0.01) * 100, 2
                    ),
                    "product_type": p.get("productType", ""),
                    "side":         "LONG" if p.get("netQty", 0) > 0 else "SHORT",
                }
                for p in positions
                if p.get("netQty", 0) != 0
            ]
        except Exception as exc:
            logger.error("Fyers get_positions failed: {}", exc)
            return []

    def get_funds(self) -> dict[str, float]:
        """Fetch available funds / margin from Fyers."""
        if not self.is_available():
            return {}
        try:
            data = self.get_raw_funds()
            if data.get("s") != "ok":
                logger.warning("Fyers funds error: {}", data.get("message", "unknown"))
                return {}
            # Handle both flat and nested response structures
            fund_limit = (
                data.get("fund_limit")
                or data.get("data", {}).get("fund_limit")
                or []
            )
            result: dict[str, float] = {}
            # Map common Fyers title strings → our keys
            label_map = {
                "Total Balance":          "total_balance",
                "Available Balance":      "available_balance",
                "Available Cash":         "available_balance",
                "Utilized Amount":        "utilized",
                "Clear Cash":             "clear_cash",
                "Collateral":             "collateral",
                "Limit at Start of Day":  "limit_start_of_day",
                "Opening Balance":        "total_balance",
            }
            for item in fund_limit:
                title = item.get("title", "")
                key = label_map.get(title, title.lower().replace(" ", "_"))
                # equityAmount is the primary field; fall back to amount
                val = item.get("equityAmount", item.get("amount", item.get("equity", 0)))
                result[key] = round(float(val), 2)
            return result
        except Exception as exc:
            logger.error("Fyers get_funds failed: {}", exc)
            return {}

    def get_order_history(self) -> list[dict[str, Any]]:
        """Fetch today's order book from Fyers."""
        if not self.is_available():
            return []
        try:
            resp = requests.get(f"{self.base_url}/orders", headers=self._headers(), timeout=15)
            resp.raise_for_status()
            data = resp.json()
            if data.get("s") != "ok":
                logger.warning("Fyers orders error: {}", data.get("message", "unknown"))
                return []
            orders = (
                data.get("orderBook")
                or data.get("data", {}).get("orderBook")
                or []
            )
            return [
                {
                    "order_id":     o.get("id", ""),
                    "symbol":       o.get("symbol", ""),
                    "side":         "BUY" if o.get("side", 1) == 1 else "SELL",
                    "qty":          o.get("qty", 0),
                    "filled_qty":   o.get("filledQty", 0),
                    "price":        round(float(o.get("limitPrice", 0)), 2),
                    "avg_price":    round(float(o.get("tradedPrice", 0)), 2),
                    "status":       o.get("status", ""),
                    "product_type": o.get("productType", ""),
                    "order_type":   o.get("type", ""),
                    "time":         o.get("orderDateTime", ""),
                }
                for o in orders
            ]
        except Exception as exc:
            logger.error("Fyers get_order_history failed: {}", exc)
            return []

    def get_portfolio_summary(self) -> dict[str, Any]:
        """Aggregate positions + funds into a single portfolio summary dict."""
        positions = self.get_positions()
        funds = self.get_funds()
        total_pnl = sum(p["pnl"] for p in positions)
        invested = sum(p["avg_price"] * abs(p["qty"]) for p in positions)
        return {
            "positions":        positions,
            "funds":            funds,
            "total_pnl":        round(total_pnl, 2),
            "invested_value":   round(invested, 2),
            "open_positions":   len(positions),
            "available_margin": funds.get("available_balance", 0.0),
            "total_balance":    funds.get("total_balance", 0.0),
        }

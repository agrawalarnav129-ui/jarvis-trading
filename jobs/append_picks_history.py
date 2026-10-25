"""Append today's graded screener picks to data/picks_history.json (idempotent).
Runs in the same workflow that refreshes data/watchlist.csv, feeding the
Signal Honesty forward-test.

Only runs on trading days. The sibling jobs in this workflow already guard on
is_market_day(); this one did not, so it recorded picks on weekends and NSE
holidays — 32 of 136 dates, nearly a quarter of the history. Those entries are
not harmless duplicates: a Saturday pick carries Friday's close, so
analytics/honesty.py measures its 5/10/20-day forward return from a date on
which nothing traded, and counts the same signal up to three times. That biases
the one tool meant to answer whether the grades mean anything."""
from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from loguru import logger

WATCHLIST = Path("data/watchlist.csv")
HISTORY = Path("data/picks_history.json")
IST = ZoneInfo("Asia/Kolkata")


def main() -> None:
    from scheduler import is_market_day

    if not is_market_day():
        logger.info("Not a trading day — picks history not appended")
        return
    if not WATCHLIST.exists():
        logger.warning("No watchlist.csv — nothing to append")
        return
    today = datetime.now(IST).strftime("%Y-%m-%d")
    try:
        data = json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else {"history": {}}
    except Exception:
        data = {"history": {}}
    with WATCHLIST.open() as f:
        rows = [{"symbol": r["symbol"].replace(".NS", ""), "grade": r.get("grade", ""),
                 "score": float(r["score"]) if r.get("score") else None}
                for r in csv.DictReader(f) if r.get("symbol")][:25]
    if not rows:
        logger.warning("Empty watchlist — skipping")
        return
    data["history"][today] = rows
    # keep last ~250 trading days
    keys = sorted(data["history"].keys())
    for k in keys[:-250]:
        del data["history"][k]
    HISTORY.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    logger.info("Picks history: {} dates (added {} with {} picks)", len(data["history"]), today, len(rows))


if __name__ == "__main__":
    main()

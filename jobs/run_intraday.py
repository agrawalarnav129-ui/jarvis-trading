"""
Intraday 15-min scanner — ONE scan pass per invocation (serverless model).

Because every GitHub Actions run is a fresh process, the monitor's in-memory
"already fired this session" dedup would reset each run and re-spam alerts.
We persist fired-state to data/state/intraday_fired_<date>.json and the
workflow commits it back, so dedup survives across runs.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
load_dotenv(override=True)

from datetime import datetime
from loguru import logger

from monitors.intraday_monitor import make_monitor_from_watchlist

IST = ZoneInfo("Asia/Kolkata")
STATE_DIR = Path("data/state")


def _state_path() -> Path:
    return STATE_DIR / f"intraday_fired_{date.today()}.json"


def _load_fired() -> dict[str, set[str]]:
    p = _state_path()
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        return {sym: set(sigs) for sym, sigs in raw.items()}
    except Exception as exc:
        logger.warning("Could not read fired-state: {}", exc)
        return {}


def _save_fired(fired: dict[str, set[str]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    serialisable = {sym: sorted(sigs) for sym, sigs in fired.items()}
    _state_path().write_text(json.dumps(serialisable, indent=2), encoding="utf-8")


def _within_market_window() -> bool:
    now = datetime.now(IST)
    if now.weekday() >= 5:
        return False
    open_ = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_ = now.replace(hour=15, minute=15, second=0, microsecond=0)
    return open_ <= now <= close_


def main() -> None:
    logger.info("[jobs.run_intraday] start")
    if not _within_market_window():
        logger.info("Outside market window (09:30–15:15 IST) — skipping scan")
        return

    monitor = make_monitor_from_watchlist()
    if not monitor.symbols:
        logger.warning("Watchlist empty — nothing to scan")
        return

    # Restore dedup state so alerts only fire once per signal per day
    saved = _load_fired()
    for sym in monitor.symbols:
        if sym in saved:
            monitor.fired[sym] = saved[sym]

    monitor.scan_once()

    _save_fired(monitor.fired)
    logger.info("[jobs.run_intraday] done — state persisted to {}", _state_path())


if __name__ == "__main__":
    main()

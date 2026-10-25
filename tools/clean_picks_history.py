"""
Strip non-trading days from data/picks_history.json.

jobs/append_picks_history.py ran without a market-day guard and recorded picks
on weekends and NSE holidays. Those entries are not harmless duplicates: a
Saturday pick carries Friday's close, so analytics/honesty.py measures its
5/10/20-day forward return from a session that never happened, and counts the
same signal up to three times. Honesty is the tool meant to tell you whether
Grade A actually beats Grade B, so padding its input biases the exact question
it exists to answer.

The guard is now in the job, so this is a one-off repair — but it is written
to be idempotent and safe to re-run, which makes it a validator too:

    python -m tools.clean_picks_history --check    # report only, exit 1 if dirty
    python -m tools.clean_picks_history            # rewrite the file

Usage is deliberately explicit rather than automatic. This edits committed
data, and a silent rewrite on import is not something a data file deserves.
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from loguru import logger

HISTORY = Path("data/picks_history.json")


def non_trading_dates(dates: list[str]) -> list[str]:
    """Return the dates that are weekends or NSE holidays.

    Args:
        dates: ISO date strings (YYYY-MM-DD).

    Returns:
        The subset that falls on a Saturday, Sunday or listed NSE holiday,
        sorted ascending.
    """
    from scheduler import NSE_HOLIDAYS

    bad: list[str] = []
    for raw in dates:
        try:
            day = date.fromisoformat(raw)
        except ValueError:
            logger.warning("Unparseable date in picks history, leaving it: {}", raw)
            continue
        if day.weekday() >= 5 or day in NSE_HOLIDAYS.get(day.year, set()):
            bad.append(raw)
    return sorted(bad)


def clean(path: Path = HISTORY, check_only: bool = False) -> dict:
    """Remove non-trading-day entries from the picks history.

    Args:
        path: The picks history JSON file.
        check_only: Report what would change without writing.

    Returns:
        A summary dict with the before/after counts and the dates removed.

    Raises:
        FileNotFoundError: If the history file does not exist.
    """
    if not path.exists():
        raise FileNotFoundError(f"Picks history not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    history: dict = data.get("history", {})
    bad = non_trading_dates(list(history))
    picks_removed = sum(len(history[d]) for d in bad)

    summary = {
        "dates_before": len(history),
        "dates_removed": len(bad),
        "dates_after": len(history) - len(bad),
        "picks_before": sum(len(v) for v in history.values()),
        "picks_removed": picks_removed,
        "removed": bad,
        "written": False,
    }

    if bad and not check_only:
        for d in bad:
            del history[d]
        data["history"] = history
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        summary["written"] = True

    return summary


def main() -> int:
    """CLI entry point. Returns a process exit code."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="report only; exit 1 if non-trading dates are present")
    args = parser.parse_args()

    result = clean(check_only=args.check)
    logger.info("Picks history: {} dates, {} non-trading ({} picks)",
                result["dates_before"], result["dates_removed"], result["picks_removed"])
    if result["removed"]:
        logger.info("  {}", ", ".join(result["removed"]))
    if args.check:
        return 1 if result["removed"] else 0
    if result["written"]:
        logger.success("Cleaned: {} -> {} dates", result["dates_before"], result["dates_after"])
    else:
        logger.info("Already clean — nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

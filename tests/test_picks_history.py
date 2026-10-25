"""
Tests for the picks-history market-day guard and the cleanup tool.

jobs/append_picks_history.py ran for months without the guard its sibling jobs
all had, recording picks on weekends and NSE holidays — 32 of 136 dates. That
fed analytics/honesty.py, the one tool meant to answer whether Grade A beats
Grade B, so the padding biased the exact question it exists to settle.

These tests cover both halves: the guard that stops it recurring, and the
cleanup tool, which is written to double as a CI validator.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from tools.clean_picks_history import clean, non_trading_dates


def _write(path: Path, dates: dict[str, int]) -> None:
    """Write a picks-history file with `n` dummy picks per date."""
    history = {d: [{"symbol": f"SYM{i}", "grade": "A", "score": 80.0} for i in range(n)]
               for d, n in dates.items()}
    path.write_text(json.dumps({"history": history}), encoding="utf-8")


# ── identifying non-trading days ────────────────────────────────────────────

def test_weekends_are_flagged() -> None:
    # 2026-10-24 Sat, 2026-10-25 Sun, 2026-10-23 Fri
    assert non_trading_dates(["2026-10-23", "2026-10-24", "2026-10-25"]) == \
        ["2026-10-24", "2026-10-25"]


def test_nse_holidays_are_flagged() -> None:
    """A weekday the exchange is shut is just as empty as a Saturday."""
    from scheduler import NSE_HOLIDAYS
    holiday = sorted(h for h in NSE_HOLIDAYS[2026] if h.weekday() < 5)[0]
    assert holiday.isoformat() in non_trading_dates([holiday.isoformat()])


def test_ordinary_trading_days_are_left_alone() -> None:
    trading = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]
    assert all(date.fromisoformat(d).weekday() < 5 for d in trading)
    assert non_trading_dates(trading) == []


def test_unparseable_dates_are_kept_not_discarded() -> None:
    """Dropping a row we failed to parse would be a silent data loss."""
    assert non_trading_dates(["not-a-date", "2026-10-24"]) == ["2026-10-24"]


def test_result_is_sorted() -> None:
    out = non_trading_dates(["2026-10-25", "2026-10-11", "2026-10-18"])
    assert out == sorted(out)


# ── clean() ─────────────────────────────────────────────────────────────────

def test_clean_removes_only_the_non_trading_dates(tmp_path: Path) -> None:
    p = tmp_path / "picks.json"
    _write(p, {"2026-10-22": 3, "2026-10-23": 3, "2026-10-24": 2, "2026-10-25": 2})
    result = clean(p)
    kept = json.loads(p.read_text())["history"]
    assert sorted(kept) == ["2026-10-22", "2026-10-23"]
    assert result["dates_before"] == 4
    assert result["dates_removed"] == 2
    assert result["dates_after"] == 2
    assert result["picks_removed"] == 4


def test_check_only_reports_without_writing(tmp_path: Path) -> None:
    p = tmp_path / "picks.json"
    _write(p, {"2026-10-23": 1, "2026-10-24": 1})
    before = p.read_text()
    result = clean(p, check_only=True)
    assert result["dates_removed"] == 1
    assert result["written"] is False
    assert p.read_text() == before, "--check must never modify the file"


def test_clean_is_idempotent(tmp_path: Path) -> None:
    p = tmp_path / "picks.json"
    _write(p, {"2026-10-23": 1, "2026-10-24": 1})
    clean(p)
    after_first = p.read_text()
    second = clean(p)
    assert second["dates_removed"] == 0
    assert second["written"] is False
    assert p.read_text() == after_first


def test_clean_on_an_already_clean_file_writes_nothing(tmp_path: Path) -> None:
    p = tmp_path / "picks.json"
    _write(p, {"2026-10-22": 2, "2026-10-23": 2})
    before = p.read_text()
    assert clean(p)["written"] is False
    assert p.read_text() == before


def test_clean_preserves_the_pick_payloads(tmp_path: Path) -> None:
    """Only whole dates are dropped; surviving rows must be untouched."""
    p = tmp_path / "picks.json"
    _write(p, {"2026-10-23": 3, "2026-10-24": 3})
    original = json.loads(p.read_text())["history"]["2026-10-23"]
    clean(p)
    assert json.loads(p.read_text())["history"]["2026-10-23"] == original


def test_missing_file_raises_rather_than_silently_passing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        clean(tmp_path / "nope.json")


# ── the guard in the job ────────────────────────────────────────────────────

def test_job_appends_nothing_on_a_non_trading_day(tmp_path: Path, monkeypatch) -> None:
    """The regression itself: the job must no-op when the market is shut."""
    import jobs.append_picks_history as job
    import scheduler

    monkeypatch.setattr(scheduler, "is_market_day", lambda: False)
    history = tmp_path / "picks.json"
    _write(history, {"2026-10-23": 2})
    monkeypatch.setattr(job, "HISTORY", history)
    monkeypatch.setattr(job, "WATCHLIST", tmp_path / "watchlist.csv")
    before = history.read_text()

    job.main()
    assert history.read_text() == before


def test_job_checks_the_market_before_touching_the_watchlist(monkeypatch) -> None:
    """
    The guard must come first. If it ran after the watchlist read, a missing
    watchlist would mask the real reason for skipping.
    """
    import jobs.append_picks_history as job
    import scheduler

    calls: list[str] = []
    monkeypatch.setattr(scheduler, "is_market_day", lambda: (calls.append("guard"), False)[1])
    monkeypatch.setattr(job, "WATCHLIST", Path("/nonexistent/watchlist.csv"))
    job.main()
    assert calls == ["guard"]


def test_the_committed_history_is_clean() -> None:
    """Guards against the shipped data file regressing."""
    history = Path("data/picks_history.json")
    if not history.exists():
        pytest.skip("picks history not present")
    dates = list(json.loads(history.read_text(encoding="utf-8")).get("history", {}))
    assert non_trading_dates(dates) == []

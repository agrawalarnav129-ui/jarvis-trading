"""
Tests for the logging behaviour around data/fetcher.py's best-effort caches.

Two bug classes are guarded here:

1. A dead parquet cache degraded to live network fetches with no visible sign.
2. loguru interpolates `{}`, not `%s`. Calls written with `%s` printed the
   literal format string and dropped their arguments — so a line that looked
   like it logged the failing symbol actually logged nothing useful.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import pytest
from loguru import logger

import data.fetcher as fetcher

ROOT = Path(__file__).resolve().parent.parent
SCANNED_DIRS = ["data", "screener", "risk", "utils", "analytics", "ai",
                "backtest", "reports", "jobs", "monitors", "storage", "backend"]


@pytest.fixture
def caplog_loguru():
    """Capture loguru output (pytest's caplog does not see loguru)."""
    buf = io.StringIO()
    sink = logger.add(buf, format="{level: <8}{message}", level="DEBUG")
    yield buf
    logger.remove(sink)


@pytest.fixture(autouse=True)
def _reset_parquet_warning():
    fetcher._parquet_warned = False
    yield
    fetcher._parquet_warned = False


def test_parquet_failure_warns_exactly_once(caplog_loguru) -> None:
    """Per-symbol warnings would mean ~500 lines; once per process is the point."""
    for _ in range(5):
        fetcher._warn_parquet_once("read", ValueError("no pyarrow engine"))
    assert caplog_loguru.getvalue().count("Parquet cache unavailable") == 1


def test_parquet_warning_names_the_action_and_the_cause(caplog_loguru) -> None:
    fetcher._warn_parquet_once("write", ValueError("no pyarrow engine"))
    out = caplog_loguru.getvalue()
    assert "write" in out
    assert "no pyarrow engine" in out
    assert "WARNING" in out


def test_parquet_warning_resets_per_process_not_per_call(caplog_loguru) -> None:
    fetcher._warn_parquet_once("read", ValueError("first"))
    fetcher._warn_parquet_once("read", ValueError("second"))
    out = caplog_loguru.getvalue()
    assert "first" in out
    assert "second" not in out, "a later cause must not re-trigger the warning"


# ── repo-wide guard against the %s bug class ────────────────────────────────

_LOGGER_CALL = re.compile(
    r"""logger\.(?:trace|debug|info|success|warning|error|critical|exception)\(
        \s*(?P<q>["'])(?P<msg>(?:\\.|(?!(?P=q))[^\\])*)(?P=q)
        \s*,""",
    re.VERBOSE,
)


def _logger_calls_with_args():
    """Yield (path, message) for every loguru call that passes arguments."""
    for d in SCANNED_DIRS:
        for path in (ROOT / d).rglob("*.py"):
            if ".venv" in path.parts or "node_modules" in path.parts:
                continue
            for m in _LOGGER_CALL.finditer(path.read_text(encoding="utf-8")):
                yield path.relative_to(ROOT), m.group("msg")


def test_no_loguru_call_uses_printf_placeholders() -> None:
    """
    loguru formats with str.format, so "%s" is printed literally and the
    arguments are silently discarded. data/fetcher.py had five of these.
    """
    offenders = [(p, msg) for p, msg in _logger_calls_with_args() if "%s" in msg or "%d" in msg]
    assert not offenders, "loguru uses {} not %s:\n" + "\n".join(
        f"  {p}: {msg}" for p, msg in offenders)


def test_logger_calls_with_args_have_braces_to_fill() -> None:
    """A call passing arguments but containing no `{}` drops them silently."""
    offenders = [(p, msg) for p, msg in _logger_calls_with_args() if "{" not in msg]
    assert not offenders, "logger call passes args but has no placeholder:\n" + "\n".join(
        f"  {p}: {msg}" for p, msg in offenders)

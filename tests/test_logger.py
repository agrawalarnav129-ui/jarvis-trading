"""
Tests for utils/logger.py.

The bug these lock in: `logger.add("stderr", ...)` passes a *string*, and loguru
treats a str sink as a file path — so logs went to a file named `stderr` in the
working directory instead of to the console. On a cloud host that means the
platform's log stream stays empty while a junk file quietly grows.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from loguru import logger

from utils.logger import configure_logger

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def _restore_logging():
    """configure_logger() calls logger.remove(), which is process-wide — put a
    plain stderr handler back so one test cannot mute logging for the rest."""
    yield
    logger.remove()
    logger.add(sys.stderr, level="INFO")


def test_configure_logger_does_not_create_a_file_named_stderr(tmp_path, monkeypatch) -> None:
    """The regression itself."""
    monkeypatch.chdir(tmp_path)
    configure_logger()
    logger.info("hello")
    assert not (tmp_path / "stderr").exists(), "logs were written to a file, not the console"
    assert list(tmp_path.iterdir()) == [], f"unexpected files: {list(tmp_path.iterdir())}"


def test_importing_the_module_has_no_side_effect(tmp_path) -> None:
    """
    Importing must not configure logging or touch the filesystem. Run in a
    subprocess so this is a genuine fresh import, not a cached one.
    """
    proc = subprocess.run(
        [sys.executable, "-c", "import utils.logger"],
        cwd=tmp_path, capture_output=True, text=True,
        env={"PYTHONPATH": str(ROOT), "PATH": "/usr/bin:/bin"},
    )
    assert proc.returncode == 0, proc.stderr
    assert not (tmp_path / "stderr").exists(), "import created a `stderr` file"
    assert list(tmp_path.iterdir()) == []


def test_stderr_sink_actually_reaches_stderr(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.chdir(tmp_path)
    configure_logger()
    logger.info("reaches-the-console")
    assert "reaches-the-console" in capsys.readouterr().err


def test_log_path_writes_a_rotating_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    target = tmp_path / "axiom.log"
    configure_logger(log_path=str(target))
    logger.info("written-to-file")
    logger.remove()          # flush and close the file sink
    assert target.exists()
    assert "written-to-file" in target.read_text()
    assert not (tmp_path / "stderr").exists()


def test_level_is_respected(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.chdir(tmp_path)
    configure_logger(level="WARNING")
    logger.info("should-be-filtered")
    logger.warning("should-appear")
    err = capsys.readouterr().err
    assert "should-be-filtered" not in err
    assert "should-appear" in err

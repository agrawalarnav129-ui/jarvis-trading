"""
Loguru configuration for the project.

Call `configure_logger()` from an entry point (a job, the scheduler, a script).
Modules themselves should just `from loguru import logger` and log — they do not
need to configure anything.

Importing this module deliberately has no side effect. `logger.configure()`
replaces every handler process-wide, so doing it at import time would silently
change log levels for anything that imported this module in passing.
"""
from __future__ import annotations

import sys

from loguru import logger


def configure_logger(log_path: str | None = None, level: str = "INFO") -> None:
    """Route loguru to stderr, and optionally to a rotating file as well.

    Args:
        log_path: If given, also write to this file, rotating at 10 MB and
            keeping 10 days of compressed history.
        level: Minimum level for the stderr sink.

    Returns:
        None. Replaces any handlers already configured on the global logger.
    """
    logger.remove()
    # sys.stderr, not the string "stderr" — loguru treats a str sink as a
    # FILE PATH, so the latter silently writes logs to a file named `stderr`
    # in the working directory instead of to the console.
    logger.add(sys.stderr, level=level)
    if log_path:
        logger.add(log_path, rotation="10 MB", retention="10 days", compression="zip")

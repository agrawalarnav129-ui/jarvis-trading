"""Pytest bootstrap: put the repo root on sys.path.

Tests import project packages (config, risk, utils, screener), and pytest's
default `prepend` import mode only adds the test file's own directory. Without
this, `from config import ...` fails when the suite runs from the repo root.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

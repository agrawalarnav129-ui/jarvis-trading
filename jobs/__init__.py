"""Serverless job entry-points for GitHub Actions / cron.

Each module is a thin wrapper around the existing pipeline functions in
scheduler.py so logic lives in ONE place (WAT rule W1). Run with, e.g.:
    python -m jobs.run_briefing
"""

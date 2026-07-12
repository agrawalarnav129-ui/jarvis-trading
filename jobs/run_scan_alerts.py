"""
Scan-as-Alert — run every saved Builder scan marked 🔔 and Telegram NEW matches.

Runs every 15 min during market hours via GitHub Actions. Saved scans are read
from Supabase (settings.prefs.builderScans, alert=true) using the service key
— set SUPABASE_URL + SUPABASE_SERVICE_KEY as repo secrets. Matches are deduped
per scan per day via a committed state file, so you're only pinged on NEW names.
"""
from __future__ import annotations

import warnings
warnings.simplefilter("ignore")

from dotenv import load_dotenv
load_dotenv(override=True)

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from loguru import logger

IST = ZoneInfo("Asia/Kolkata")
STATE = Path("data/state/scan_alerts_fired.json")
UNIVERSE_N = {"NIFTY 50": 50, "NIFTY 100": 100, "NIFTY 200": 200, "ALL (250)": 250}


def _alert_scans() -> list[dict]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set — cannot read alert scans")
        return []
    try:
        r = requests.get(
            f"{url.rstrip('/')}/rest/v1/settings?select=prefs",
            headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=15,
        )
        r.raise_for_status()
        scans = []
        for row in r.json():
            for s in (row.get("prefs") or {}).get("builderScans", []):
                if s.get("alert") and s.get("conditions"):
                    scans.append(s)
        return scans
    except Exception as exc:
        logger.error("Supabase read failed: {}", exc)
        return []


def _load_state() -> dict:
    today = datetime.now(IST).strftime("%Y-%m-%d")
    try:
        st = json.loads(STATE.read_text(encoding="utf-8"))
        if st.get("date") == today:
            return st
    except Exception:
        pass
    return {"date": today, "fired": {}}


def main() -> None:
    from monitors.telegram_bot import is_configured, send_message

    scans = _alert_scans()
    if not scans:
        logger.info("No alert-enabled scans — done")
        return
    if not is_configured():
        logger.error("Telegram not configured")
        return

    import pandas as pd
    from data.fetcher import load_universe
    from data.ohlcv_cache import get_cached_ohlcv
    from screener.ta_engine import run_builder

    def _fetch(sym, period="1y", interval="1d"):
        df = get_cached_ohlcv(sym)
        return df if df is not None else pd.DataFrame()

    all_syms = load_universe()["symbol"].dropna().astype(str).tolist()
    nifty = _fetch("^NSEI")
    state = _load_state()
    pings = []

    for s in scans:
        name = s.get("name", "scan")
        syms = all_syms[:UNIVERSE_N.get(s.get("universe", "NIFTY 100"), 100)]
        try:
            rows = run_builder(syms, s["conditions"], _fetch, nifty)
        except Exception as exc:
            logger.warning("scan '{}' failed: {}", name, exc)
            continue
        matched = [r["symbol"] for r in rows]
        already = set(state["fired"].get(name, []))
        new = [m for m in matched if m not in already]
        state["fired"][name] = sorted(already | set(matched))
        logger.info("scan '{}': {} matches, {} new", name, len(matched), len(new))
        if new:
            pings.append(f"⚡ <b>{name}</b> — {len(new)} new match{'es' if len(new) != 1 else ''}: "
                         + ", ".join(new[:12]) + ("…" if len(new) > 12 else ""))

    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")

    if pings:
        ok, err = send_message("<b>🔔 AXIOM Scan Alerts</b>\n" + "\n".join(pings)
                               + "\n<i>axiom-129.vercel.app → Screener → Builder</i>")
        logger.info("Telegram: {} {}", ok, err or "")
    else:
        logger.info("No new matches — nothing sent")


if __name__ == "__main__":
    main()

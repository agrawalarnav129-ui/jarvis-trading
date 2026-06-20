"""
Live-status check for the dashboard's Live-TV card.

The video embeds are cross-origin, so the browser can't tell which channel is
actually broadcasting. We check each channel's YouTube /live page server-side
(no API key) for live-stream signals, so the UI can auto-pick a live channel.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import requests
from loguru import logger

# name, channelId — kept in sync with the frontend card
CHANNELS = [
    ("Zee Business", "UCkXopQ3ubd-rnXnStZqCl2w"),
    ("CNBC-TV18", "UCmRbHAgG2k2vDUvb3xsEunQ"),
    ("ET Now", "UCI_mwTKUhicNzFrhm33MzBQ"),
    ("Bloomberg TV", "UCIALMKvObZNtJ6AmdCLP7Lg"),
    ("CNBC Intl", "UCF8HUTbUwPKh2Q-KpGOCVGw"),
    ("CNBC", "UCvJJ_dzjViJCoLf5uKUTwoA"),
    ("Yahoo Finance", "UCEAZeUIeJs0IjQiqTCdVSIg"),
]
_H = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+1",
}


def _is_live(cid: str) -> bool:
    try:
        r = requests.get(f"https://www.youtube.com/channel/{cid}/live", headers=_H, timeout=10)
        if r.status_code != 200:
            return False
        t = r.text
        return ("hlsManifestUrl" in t) or ('"isLive":true' in t) or ('"isLiveNow":true' in t)
    except Exception as exc:
        logger.debug("live check failed for {}: {}", cid, exc)
        return False


def live_channels() -> dict:
    out = []
    try:
        with ThreadPoolExecutor(max_workers=7) as ex:
            results = list(ex.map(lambda c: (c[0], c[1], _is_live(c[1])), CHANNELS))
    except Exception:
        results = [(n, i, False) for n, i in CHANNELS]
    for name, cid, live in results:
        out.append({"name": name, "id": cid, "live": live})
    first_live = next((c["id"] for c in out if c["live"]), None)
    return {"channels": out, "first_live": first_live}

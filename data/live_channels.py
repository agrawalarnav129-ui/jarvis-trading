"""
Live-status check for the dashboard's Live-TV card.

The video embeds are cross-origin, so the browser can't tell which channel is
actually broadcasting. We check each channel's YouTube /live page server-side
(no API key) for live-stream signals, so the UI can auto-pick a live channel.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import requests
from loguru import logger

_CANON = re.compile(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"')
_EMBED = re.compile(r'"playableInEmbed":(true|false)')
_STATUS = re.compile(r'"playabilityStatus":\{"status":"([A-Z_]+)"')

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


def _check(cid: str) -> tuple[bool, str | None]:
    """Return (playable_live, live_video_id). Playable = currently live, embeddable
    and status OK — so the UI only offers channels that actually play in an iframe."""
    try:
        r = requests.get(f"https://www.youtube.com/channel/{cid}/live", headers=_H, timeout=10)
        if r.status_code != 200:
            return (False, None)
        t = r.text
        is_live = ("hlsManifestUrl" in t) or ('"isLive":true' in t)
        if not is_live:
            return (False, None)
        vid = _CANON.search(t)
        emb = _EMBED.search(t)
        st = _STATUS.search(t)
        playable = bool(vid) and (emb is None or emb.group(1) == "true") and (st is None or st.group(1) == "OK")
        return (playable, vid.group(1) if vid else None)
    except Exception as exc:
        logger.debug("live check failed for {}: {}", cid, exc)
        return (False, None)


def live_channels() -> dict:
    try:
        with ThreadPoolExecutor(max_workers=7) as ex:
            results = list(ex.map(lambda c: (c[0], c[1], *_check(c[1])), CHANNELS))
    except Exception:
        results = [(n, i, False, None) for n, i in CHANNELS]
    out = [{"name": n, "id": i, "live": live, "videoId": vid} for n, i, live, vid in results]
    first_live = next((c["id"] for c in out if c["live"] and c["videoId"]), None)
    return {"channels": out, "first_live": first_live}

"""
Market news feed — aggregated from free Indian financial RSS sources.

No API key needed. Parses RSS 2.0 with the stdlib (xml.etree). Each source
fails independently so one bad feed never blanks the whole panel.
"""
from __future__ import annotations

import html
import re
from datetime import datetime
from xml.etree import ElementTree as ET

import requests
from loguru import logger

# (name, url) — free RSS feeds, markets/business focused
RSS_SOURCES = [
    ("ET Markets",       "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    ("ET Stocks",        "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms"),
    ("Livemint Markets", "https://www.livemint.com/rss/markets"),
    ("Livemint Money",   "https://www.livemint.com/rss/money"),
    ("ET Economy",       "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms"),
]

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AXIOM/1.0; +https://neura.capital)"}
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    text = _TAG_RE.sub("", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_pubdate(raw: str) -> datetime | None:
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S"):
        try:
            return datetime.strptime(raw.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def _fetch_feed(name: str, url: str, limit: int = 8) -> list[dict]:
    try:
        r = requests.get(url, headers=_HEADERS, timeout=10)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        items = []
        for item in root.iter("item"):
            title = _clean(item.findtext("title", ""))
            link = (item.findtext("link", "") or "").strip()
            pub = item.findtext("pubDate", "") or ""
            if not title:
                continue
            dt = _parse_pubdate(pub)
            items.append({
                "title": title,
                "link": link,
                "source": name,
                "published": dt,
                "published_str": dt.strftime("%d %b %H:%M") if dt else "",
            })
            if len(items) >= limit:
                break
        return items
    except Exception as exc:
        logger.debug("News feed failed ({}): {}", name, exc)
        return []


def fetch_market_news(max_items: int = 18) -> list[dict]:
    """
    Aggregate latest market headlines across all sources, newest first.
    Returns list of {title, link, source, published, published_str}.
    """
    all_items: list[dict] = []
    for name, url in RSS_SOURCES:
        all_items.extend(_fetch_feed(name, url))

    # Sort newest-first; items without a date sink to the bottom but stay visible
    all_items.sort(key=lambda x: x["published"] or datetime.min.replace(tzinfo=None), reverse=True)
    # De-dup by title
    seen, deduped = set(), []
    for it in all_items:
        key = it["title"].lower()[:80]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)
    if not deduped:
        logger.warning("All news feeds returned empty")
    return deduped[:max_items]

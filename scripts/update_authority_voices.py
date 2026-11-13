#!/usr/bin/env python3
"""Collect recent AI conference, interview and institutional viewpoint items.

Only explicitly curated feeds are accepted. Titles and excerpts are preserved
from the original feed and always link back to the source page.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import feedparser
import requests
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

FEEDS: tuple[dict[str, Any], ...] = (
    {
        "id": "neurips_blog",
        "name": "NeurIPS Blog",
        "url": "https://blog.neurips.cc/feed/",
        "kind": "conference",
        "trust": "official",
        "trust_label": "会议官方",
        "max_items": 4,
        "ai_filter": False,
    },
    {
        "id": "iclr_blog",
        "name": "ICLR Blog",
        "url": "https://blog.iclr.cc/feed/",
        "kind": "conference",
        "trust": "official",
        "trust_label": "会议官方",
        "max_items": 4,
        "ai_filter": False,
    },
    {
        "id": "google_research",
        "name": "Google Research",
        "url": "https://research.google/blog/rss/",
        "kind": "research",
        "trust": "research",
        "trust_label": "研究机构",
        "max_items": 3,
        "ai_filter": True,
    },
    {
        "id": "microsoft_research",
        "name": "Microsoft Research",
        "url": "https://www.microsoft.com/en-us/research/feed/",
        "kind": "research",
        "trust": "research",
        "trust_label": "研究机构",
        "max_items": 4,
        "ai_filter": True,
    },
    {
        "id": "mit_ai",
        "name": "MIT News · AI",
        "url": "https://news.mit.edu/rss/topic/artificial-intelligence2",
        "kind": "research",
        "trust": "research",
        "trust_label": "研究机构",
        "max_items": 4,
        "ai_filter": False,
    },
    {
        "id": "bair",
        "name": "Berkeley AI Research",
        "url": "https://bair.berkeley.edu/blog/feed.xml",
        "kind": "research",
        "trust": "research",
        "trust_label": "研究机构",
        "max_items": 4,
        "ai_filter": False,
    },
    {
        "id": "deepmind",
        "name": "Google DeepMind",
        "url": "https://deepmind.google/blog/rss.xml",
        "kind": "lab",
        "trust": "official",
        "trust_label": "官方实验室",
        "max_items": 3,
        "ai_filter": False,
        "include_pattern": r"research|paper|study|science|alignment|policy|perspective|interview|conversation|explain|insight|report|breakthrough|benchmark|alpha|genome|safety research",
    },
    {
        "id": "openai",
        "name": "OpenAI News",
        "url": "https://openai.com/news/rss.xml",
        "kind": "lab",
        "trust": "official",
        "trust_label": "官方实验室",
        "max_items": 3,
        "ai_filter": False,
        "exclude_pattern": r"customer[- ]stor(?:y|ies)|case study|/business/|careers|hiring|rethink(?:s)? the business|doubles revenue|ships product improvements|business of law|^\[AINews\]|^Introducing\b|now available|pricing|businesses in",
        "include_pattern": r"research|paper|study|policy|perspective|interview|conversation|alignment|science|education|health|children|chief architect|lessons|guardrails|report",
    },
    {
        "id": "dwarkesh",
        "name": "Dwarkesh Podcast",
        "url": "https://www.dwarkesh.com/feed",
        "kind": "interview",
        "trust": "interview",
        "trust_label": "访谈观点",
        "max_items": 3,
        "ai_filter": True,
    },
    {
        "id": "latent_space",
        "name": "Latent Space",
        "url": "https://www.latent.space/feed",
        "kind": "interview",
        "trust": "interview",
        "trust_label": "访谈观点",
        "max_items": 3,
        "ai_filter": True,
        "exclude_pattern": r"^\[AINews\]|AINews|newsletter|roundup|rumou?r|unconfirmed|leak",
    },
)

AI_PATTERN = re.compile(
    r"(?:\bAI\b|artificial intelligence|machine learning|deep learning|neural|"
    r"language model|\bLLMs?\b|agent|agentic|robot|robotics|computer vision|\bNLP\b|"
    r"generative|transformer|reasoning|alignment|safety|inference|training|dataset|"
    r"benchmark|multimodal|diffusion|reinforcement learning|foundation model|"
    r"人工智能|大模型|机器学习|深度学习|智能体|机器人|多模态|推理|对齐|算力)",
    re.I,
)
INTERVIEW_PATTERN = re.compile(
    r"interview|conversation|in conversation|podcast|fireside|q\s*&\s*a|"
    r"访谈|对话|采访|播客|炉边",
    re.I,
)
CONFERENCE_PATTERN = re.compile(
    r"conference|summit|forum|symposium|workshop|keynote|panel|"
    r"neurips|icml|iclr|cvpr|aaai|acl|emnlp|corl|icra|"
    r"大会|峰会|论坛|研讨会|主旨演讲|圆桌",
    re.I,
)


def clean_text(value: Any, limit: int = 300) -> str:
    raw = str(value or "")
    if not raw:
        return ""
    if "<" in raw and ">" in raw:
        text = BeautifulSoup(raw, "html.parser").get_text(" ", strip=True)
    else:
        text = raw
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def entry_datetime(entry: Any) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        value = entry.get(key)
        if value:
            try:
                return datetime.fromtimestamp(calendar.timegm(value), tz=timezone.utc)
            except (OverflowError, ValueError):
                pass
    for key in ("published", "updated", "created"):
        value = entry.get(key)
        if not value:
            continue
        try:
            parsed = date_parser.parse(str(value))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except (TypeError, ValueError, OverflowError):
            continue
    return None


def canonical_url(value: str) -> str:
    url = str(value or "").strip()
    if url.startswith("http://bair.berkeley.edu/"):
        url = "https://" + url[len("http://") :]
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return url


def classify_item(feed: dict[str, Any], title: str, summary: str, url: str) -> str:
    haystack = f"{title} {summary} {url}"
    if feed["kind"] == "interview" or INTERVIEW_PATTERN.search(haystack) or "/podcast/" in url:
        return "interview"
    if feed["kind"] == "conference" or CONFERENCE_PATTERN.search(haystack):
        return "conference"
    return "viewpoint"


def verification_text(category: str, feed: dict[str, Any]) -> tuple[str, bool]:
    if category == "interview":
        return "访谈观点，需区分事实与受访者判断", True
    if category == "conference":
        return "会议官方页面，具体安排以原文为准", False
    if feed["kind"] == "lab":
        return "机构官方发布，以原文为准", True
    return "研究机构原文，以论文或原文为准", False


def load_feed(feed: dict[str, Any], window_start: datetime, now: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    status: dict[str, Any] = {
        "id": feed["id"],
        "name": feed["name"],
        "url": feed["url"],
        "kind": feed["kind"],
        "trust": feed["trust"],
        "ok": False,
        "items_scanned": 0,
        "items_kept": 0,
        "error": "",
    }
    try:
        response = None
        last_error = None
        for attempt in range(3):
            try:
                response = requests.get(
                    feed["url"],
                    headers={"User-Agent": "TechPulse/1.1 (+https://byc2003.github.io/techpulse-dashboard/)"},
                    timeout=30,
                )
                response.raise_for_status()
                break
            except requests.RequestException as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(2 ** attempt)
        if response is None:
            raise RuntimeError(f"feed request failed: {last_error}")
        parsed = feedparser.parse(response.content)
        entries = list(parsed.entries)
        status["items_scanned"] = len(entries)
        if not entries:
            raise RuntimeError("feed has no entries")
        items: list[dict[str, Any]] = []
        exclude_pattern = re.compile(feed.get("exclude_pattern", r"$^"), re.I)
        include_pattern = re.compile(feed["include_pattern"], re.I) if feed.get("include_pattern") else None
        for entry in entries:
            title = clean_text(entry.get("title"), 220)
            url = canonical_url(entry.get("link", ""))
            published = entry_datetime(entry)
            if not title or not url or not published:
                continue
            if published > now + timedelta(days=2) or published < window_start:
                continue
            summary = clean_text(entry.get("summary") or entry.get("description"), 320)
            summary = re.sub(r"\s*The post .*? appeared first on .*$", "", summary, flags=re.I).strip()
            if re.search(r"\breceives?\b.*\bawards?\b|\bwins?\b.*\bawards?\b|\bhonors?\b", title, re.I):
                continue
            haystack = f"{title} {summary} {url}"
            if exclude_pattern.search(haystack):
                continue
            if include_pattern and not include_pattern.search(haystack):
                continue
            if feed.get("ai_filter") and not AI_PATTERN.search(haystack):
                continue
            category = classify_item(feed, title, summary, url)
            verification, is_opinion = verification_text(category, feed)
            item_id = hashlib.sha1(f"{feed['id']}|{url}|{title}".encode("utf-8")).hexdigest()[:16]
            items.append({
                "id": item_id,
                "title": title,
                "url": url,
                "summary": summary,
                "published_at": published.isoformat(),
                "source_id": feed["id"],
                "source_name": feed["name"],
                "source_kind": feed["kind"],
                "category": category,
                "trust": feed["trust"],
                "trust_label": feed["trust_label"],
                "verification": verification,
                "is_opinion": is_opinion,
            })
        items.sort(key=lambda item: item["published_at"], reverse=True)
        items = items[: int(feed.get("max_items", 4))]
        status["ok"] = True
        status["items_kept"] = len(items)
        if items:
            status["latest_at"] = max(item["published_at"] for item in items)
        return items, status
    except Exception as exc:
        status["error"] = str(exc)
        return [], status


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name
    Path(temp_name).replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/authority-voices.json")
    parser.add_argument("--window-days", type=int, default=90)
    parser.add_argument("--max-items", type=int, default=24)
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=max(1, args.window_days))
    all_items: list[dict[str, Any]] = []
    source_status: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()

    for feed in FEEDS:
        items, status = load_feed(feed, window_start, now)
        source_status.append(status)
        for item in items:
            title_key = re.sub(r"\W+", "", item["title"]).lower()
            if item["url"] in seen_urls or title_key in seen_titles:
                continue
            seen_urls.add(item["url"])
            seen_titles.add(title_key)
            all_items.append(item)

    all_items.sort(key=lambda item: item["published_at"], reverse=True)
    all_items = all_items[: max(1, args.max_items)]
    ok_sources = sum(1 for status in source_status if status["ok"])
    if len(all_items) < 8 or ok_sources < 4:
        print(
            f"Authority voices update failed: only {len(all_items)} items from {ok_sources} sources",
            file=sys.stderr,
        )
        return 1

    payload = {
        "generated_at": now.isoformat(),
        "window_days": args.window_days,
        "source": "Curated official labs, research institutions, conferences and interviews",
        "methodology": "仅采集白名单来源；保留原文标题、摘要和链接；观点类内容明确标注，不做二次事实断言。",
        "item_count": len(all_items),
        "ok_source_count": ok_sources,
        "source_count": len(source_status),
        "sources": source_status,
        "items": all_items,
    }
    atomic_write_json(Path(args.output), payload)
    print(f"Wrote {args.output}: items={len(all_items)}, sources={ok_sources}/{len(source_status)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
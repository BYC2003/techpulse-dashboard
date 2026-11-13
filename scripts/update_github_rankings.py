#!/usr/bin/env python3
"""Build weekly/monthly GitHub Trending snapshots from github.com/trending."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

TRENDING_URLS = {
    "weekly": "https://github.com/trending?since=weekly",
    "monthly": "https://github.com/trending?since=monthly",
}
HEADERS = {
    "User-Agent": "TechPulse/1.1 (+https://byc2003.github.io/techpulse-dashboard/)",
    "Accept": "text/html,application/xhtml+xml",
}


def parse_int(value: str) -> int | None:
    match = re.search(r"([\d,]+)", value or "")
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def parse_trending(period: str, url: str) -> list[dict[str, Any]]:
    response = None
    last_error = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            break
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
    if response is None:
        raise RuntimeError(f"GitHub Trending request failed: {last_error}")
    soup = BeautifulSoup(response.text, "html.parser")
    articles = soup.select("article.Box-row")
    items: list[dict[str, Any]] = []
    for article in articles:
        repo_link = article.select_one("h2 a[href]")
        if not repo_link:
            continue
        href = (repo_link.get("href") or "").strip()
        parts = [part for part in href.strip("/").split("/") if part]
        if len(parts) != 2:
            continue
        owner, repo = parts
        description_node = article.select_one("p.col-9") or article.select_one("p")
        language_node = article.select_one('[itemprop="programmingLanguage"]')
        total_stars_node = article.select_one('a[href$="/stargazers"]')
        period_node = article.find(string=lambda value: value and re.search(r"stars?\s+this\s+(?:week|month)", str(value), re.I))
        period_text = " ".join(str(period_node).split()) if period_node else ""
        period_stars = parse_int(period_text)
        total_stars = parse_int(total_stars_node.get_text(" ", strip=True) if total_stars_node else "")
        description = " ".join(description_node.get_text(" ", strip=True).split()) if description_node else ""
        if not period_stars:
            continue
        items.append({
            "rank": len(items) + 1,
            "full_name": f"{owner}/{repo}",
            "owner": owner,
            "repo": repo,
            "url": urljoin("https://github.com", href),
            "description": description[:280],
            "language": language_node.get_text(" ", strip=True) if language_node else "",
            "total_stars": total_stars,
            "period_stars": period_stars,
            "period_label": "本周新增 Star" if period == "weekly" else "本月新增 Star",
            "period_text": period_text,
        })
        if len(items) >= 10:
            break
    if len(items) < 10:
        raise RuntimeError(f"GitHub {period} trending returned only {len(items)} valid items")
    return items


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name
    Path(temp_name).replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/github-rankings.json")
    args = parser.parse_args()

    generated_at = datetime.now(timezone.utc).isoformat()
    periods: dict[str, Any] = {}
    try:
        for period, url in TRENDING_URLS.items():
            periods[period] = {
                "label": "周热榜" if period == "weekly" else "月热榜",
                "source_url": url,
                "items": parse_trending(period, url),
            }
        payload = {
            "generated_at": generated_at,
            "source": "GitHub Trending",
            "methodology": "抓取 GitHub 官方 Trending 页面，读取页面展示的周期新增 Star 与仓库信息。",
            "periods": periods,
        }
        atomic_write_json(Path(args.output), payload)
        print(f"Wrote {args.output}: weekly={len(periods['weekly']['items'])}, monthly={len(periods['monthly']['items'])}")
        return 0
    except Exception as exc:
        print(f"GitHub rankings update failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
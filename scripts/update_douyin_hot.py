#!/usr/bin/env python3
"""Fetch the public Douyin hot list and maintain lightweight rank history.

This uses only public, unauthenticated hot-list endpoints. It does not call
TikHub, log in to Douyin, or claim that the public list equals recommendation
traffic. The output is a transparent platform-trend reference for AI topic
selection.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests


SH_TZ = ZoneInfo("Asia/Shanghai")
PRIMARY_URL = "https://www.douyin.com/aweme/v1/web/hot/search/list/"
FALLBACK_URL = "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/"
SOURCE_PAGE = "https://www.douyin.com/hot"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
AI_TERMS = (
    "ai", "人工智能", "大模型", "chatgpt", "openai", "claude", "gemini",
    "deepseek", "机器人", "智能体", "agent", "算力", "芯片", "英伟达",
    "黄仁勋", "换脸", "深度伪造", "生成式",
)
HOT_BRIDGE_TERMS = (
    "苹果", "手机", "华为", "小米", "机器人", "教育", "学生", "学校",
    "医疗", "医生", "医院", "健康", "诈骗", "骗局", "换脸", "版权",
    "侵权", "就业", "工作", "裁员", "汽车", "驾驶", "芯片", "游戏",
    "短剧", "演唱会", "电影", "音乐", "绘画", "旅行", "天气", "家庭",
    "儿童", "老人", "宠物", "体育", "国足", "世界杯", "奥运",
)


def parse_active_time(value: str, now: datetime) -> datetime:
    raw = str(value or "").strip()
    if raw:
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
            return parsed.replace(tzinfo=SH_TZ)
        except ValueError:
            pass
    return now


def iso(value: datetime | None) -> str | None:
    if not value:
        return None
    return value.astimezone(SH_TZ).isoformat(timespec="seconds")


def load_existing(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def request_json(session: requests.Session, url: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
    response = session.get(url, params=params, timeout=25)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Douyin hot list response is not an object")
    status_code = payload.get("status_code")
    if status_code not in (None, 0):
        raise ValueError(f"Douyin hot list status_code={status_code}")
    return payload


def extract_word_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    rows = data.get("word_list") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        rows = payload.get("word_list")
    return [row for row in (rows or []) if isinstance(row, dict)]


def fetch_hot_payload(session: requests.Session) -> tuple[dict[str, Any], str]:
    params = {
        "device_platform": "webapp",
        "aid": "6383",
        "channel": "channel_pc_web",
        "detail_list": "1",
        "source": "6",
        "board_type": "0",
        "board_sub_type": "",
    }
    try:
        return request_json(session, PRIMARY_URL, params=params), PRIMARY_URL
    except Exception:
        return request_json(session, FALLBACK_URL), FALLBACK_URL


def as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_payload(rows: list[dict[str, Any]], payload: dict[str, Any], endpoint: str, now: datetime, previous: dict[str, Any]) -> dict[str, Any]:
    active_time = str(payload.get("active_time") or (payload.get("data") or {}).get("active_time") or "").strip()
    active_dt = parse_active_time(active_time, now)
    active_time = active_dt.strftime("%Y-%m-%d %H:%M:%S")
    previous_by_word = {
        str(item.get("word") or ""): item
        for item in previous.get("items", [])
        if isinstance(item, dict) and item.get("word")
    }
    items: list[dict[str, Any]] = []
    seen_words: set[str] = set()
    for index, row in enumerate(rows):
        word = str(row.get("word") or "").strip()
        if not word or word in seen_words:
            continue
        seen_words.add(word)
        position = as_int(row.get("position"), index + 1)
        hot_value = as_int(row.get("hot_value"))
        old = previous_by_word.get(word, {})
        first_seen_at = str(old.get("first_seen_at") or iso(active_dt) or "")
        history = list(old.get("rank_history") or []) if isinstance(old.get("rank_history"), list) else []
        point = {"active_time": active_time, "position": position, "hot_value": hot_value}
        if not history or history[-1].get("active_time") != active_time:
            history.append(point)
        history = history[-48:]
        old_position = as_int(old.get("position"), 0)
        old_hot_value = as_int(old.get("hot_value"), 0)
        rank_change = (old_position - position) if old_position else 0
        hot_change = (hot_value - old_hot_value) if old_hot_value else 0
        if not old:
            trend = "new"
        elif rank_change > 0 or hot_change > 0:
            trend = "rising"
        elif rank_change < 0 or hot_change < 0:
            trend = "falling"
        else:
            trend = "steady"
        event_ts = as_int(row.get("event_time"))
        event_at = datetime.fromtimestamp(event_ts, tz=timezone.utc).astimezone(SH_TZ) if event_ts else None
        try:
            age_minutes = max(0, int((active_dt - datetime.fromisoformat(first_seen_at)).total_seconds() // 60))
        except Exception:
            age_minutes = 0
        lower = word.lower()
        items.append({
            "word": word,
            "position": position,
            "hot_value": hot_value,
            "video_count": as_int(row.get("video_count")),
            "discuss_video_count": as_int(row.get("discuss_video_count")),
            "article_detail_count": as_int(row.get("article_detail_count")),
            "label": row.get("label"),
            "sentence_id": str(row.get("sentence_id") or ""),
            "event_time": iso(event_at),
            "first_seen_at": first_seen_at,
            "last_seen_at": iso(active_dt),
            "age_minutes": age_minutes,
            "rank_change": rank_change,
            "hot_value_change": hot_change,
            "trend": trend,
            "rank_history": history,
            "is_ai_related": any(term in lower for term in AI_TERMS),
            "bridge_term": next((term for term in HOT_BRIDGE_TERMS if term in word), ""),
        })
    items.sort(key=lambda item: item["position"])
    ai_items = [item for item in items if item["is_ai_related"]]
    bridge_items = [item for item in items if item["bridge_term"]]
    return {
        "generated_at": iso(now),
        "fetch_ok": True,
        "active_time": active_time,
        "source": "douyin-public-hotsearch",
        "source_page": SOURCE_PAGE,
        "endpoint": endpoint,
        "is_public_hotlist": True,
        "is_recommendation_feed": False,
        "count": len(items),
        "ai_related_count": len(ai_items),
        "bridge_item_count": len(bridge_items),
        "ai_related_items": ai_items,
        "bridge_items": bridge_items[:12],
        "items": items,
        "disclaimer": "公开热榜不等于推荐流或搜索热度；未命中热榜不代表选题无价值。",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch public Douyin hot search list")
    parser.add_argument("--output", default="data/douyin-hot.json")
    args = parser.parse_args()
    output_path = Path(args.output)
    previous = load_existing(output_path)
    now = datetime.now(tz=SH_TZ)
    session = requests.Session()
    session.headers.update({
        "User-Agent": BROWSER_UA,
        "Referer": "https://www.douyin.com/",
        "Accept": "application/json, text/plain, */*",
    })
    try:
        payload, endpoint = fetch_hot_payload(session)
        rows = extract_word_list(payload)
        if not rows:
            raise ValueError("Douyin public hot list returned no items")
        result = build_payload(rows, payload, endpoint, now, previous)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote: {output_path} ({result['count']} hot items, {result['ai_related_count']} AI-related)")
        return 0
    except Exception as exc:
        if previous:
            previous["fetch_ok"] = False
            previous["last_fetch_error"] = str(exc)
            previous["last_fetch_attempted_at"] = iso(now)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(previous, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            print(f"WARNING: kept previous Douyin hot list after fetch failure: {exc}")
            return 0
        result = {
            "generated_at": iso(now),
            "source": "douyin-public-hotsearch",
            "source_page": SOURCE_PAGE,
            "is_public_hotlist": True,
            "is_recommendation_feed": False,
            "fetch_ok": False,
            "last_fetch_error": str(exc),
            "count": 0,
            "ai_related_count": 0,
            "bridge_item_count": 0,
            "items": [],
            "disclaimer": "公开热榜暂无可用数据；页面不会用编辑分替代平台热度。",
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"WARNING: wrote empty Douyin hot list after fetch failure: {exc}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

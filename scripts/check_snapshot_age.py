#!/usr/bin/env python3
"""Validate that a TechPulse snapshot exists, contains items, and is fresh."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_timestamp(value: str) -> datetime:
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/latest-24h.json")
    parser.add_argument("--max-age-minutes", type=float, default=70)
    parser.add_argument("--min-items", type=int, default=1)
    args = parser.parse_args()

    path = Path(args.file)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        generated_at = parse_timestamp(str(payload["generated_at"]))
        items = payload.get("items")
        item_count = len(items) if isinstance(items, list) else 0
    except Exception as exc:
        print(f"snapshot_invalid path={path} error={exc}", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    age_minutes = (now - generated_at).total_seconds() / 60
    print(
        f"snapshot={path} generated_at={generated_at.isoformat()} "
        f"age_minutes={age_minutes:.1f} items={item_count}"
    )

    if age_minutes < -5:
        print("snapshot timestamp is more than 5 minutes in the future", file=sys.stderr)
        return 1
    if age_minutes > args.max_age_minutes:
        print(
            f"snapshot is stale: age={age_minutes:.1f}m "
            f"limit={args.max_age_minutes:.1f}m",
            file=sys.stderr,
        )
        return 1
    if item_count < args.min_items:
        print(
            f"snapshot has too few items: {item_count} < {args.min_items}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
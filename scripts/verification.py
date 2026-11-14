#!/usr/bin/env python3
"""Fact-boundary metadata derived from public story records.

The module deliberately avoids LLM calls. It classifies source roles and surfaces
limitations from explicit metadata, so the dashboard can separate a primary
announcement from reporting, analysis, rumors and preprints without spending
money or inventing facts.
"""

from __future__ import annotations

import re
from typing import Any, Iterable
from urllib.parse import urlparse


CLAIM_STATUS_META: dict[str, dict[str, str]] = {
    "confirmed": {
        "label": "已确认",
        "label_en": "Confirmed",
        "note": "主条目来自官方一手发布，仍未替代人工阅读原文。",
        "note_en": "The primary item is an official first-party release; editorial review is still required.",
    },
    "reported": {
        "label": "媒体报道",
        "label_en": "Reported",
        "note": "当前主要是媒体或聚合源转述，关键数字与结论需回到一手原文。",
        "note_en": "The claim is currently reported by media or aggregators; verify key details against a primary source.",
    },
    "analysis": {
        "label": "分析观点",
        "label_en": "Analysis",
        "note": "标题包含推测、判断或评论信号，只能作为观点，不应直接写成事实。",
        "note_en": "The title contains analysis or speculation signals; treat it as opinion, not established fact.",
    },
    "rumor": {
        "label": "传闻待核",
        "label_en": "Rumor / unverified",
        "note": "出现消息人士、据称、爆料等信号，除非一手确认，否则不应进入正式口播。",
        "note_en": "The item cites sources or speculation rather than a verified announcement and needs primary confirmation.",
    },
    "preprint": {
        "label": "预印本",
        "label_en": "Preprint",
        "note": "预印本或社区热议论文不等于同行评审结论，需核对版本、方法和复现条件。",
        "note_en": "A preprint or discussed paper is not a peer-reviewed conclusion; check version, method and reproducibility.",
    },
}

SOURCE_TIER_LABELS = {
    "official": "官方一手",
    "research": "研究/预印本",
    "ai_media": "AI 媒体",
    "ai_vertical": "AI 垂直源",
    "community": "社区发现",
    "builders": "Builders/X",
    "discussion": "热议参考",
    "user_opml": "定制 RSS",
    "self_media": "自媒体",
    "advanced": "高级源",
    "other": "其他来源",
}

SOURCE_TIER_BY_SITE = {
    "official_ai": ("official", 0),
    "curated_media": ("ai_media", 2),
    "aibreakfast": ("ai_vertical", 1),
    "aihubtoday": ("ai_vertical", 1),
    "aibase": ("ai_vertical", 1),
    "aihot": ("ai_vertical", 1),
    "bestblogs": ("ai_vertical", 1),
    "waytoagi": ("community", 2),
    "followbuilders": ("builders", 2),
    "opmlrss": ("user_opml", 3),
    "tikhub_douyin": ("self_media", 4),
    "tikhub_xiaohongshu": ("self_media", 4),
    "xapi": ("advanced", 4),
    "socialdata_x": ("advanced", 4),
    "techurls": ("discussion", 5),
    "buzzing": ("discussion", 5),
    "iris": ("discussion", 5),
    "zeli": ("discussion", 5),
    "hackernews": ("discussion", 5),
    "newsnow": ("discussion", 5),
    "github_trending": ("community", 2),
    "producthunt": ("community", 2),
}

AGGREGATOR_SITE_IDS = {
    "aihot",
    "techurls",
    "buzzing",
    "iris",
    "zeli",
    "newsnow",
    "followbuilders",
}

RUMOR_PATTERNS = re.compile(
    r"传闻|据称|据悉|消息人士|知情人士|爆料|未证实|尚未证实|网传|"
    r"\brumou?r\b|reportedly|sources?\s+say|unconfirmed|speculat",
    re.I,
)
ANALYSIS_PATTERNS = re.compile(
    r"分析|认为|观点|评论|解读|预测|评估|可能会|或许|似乎|意味着|说明了什么|"
    r"为什么会|为什么说|是否|能否|欲|"
    r"\banalysis\b|\bopinion\b|\bcommentary\b|\bwhat\s+.+\s+means\b|"
    r"\bwhy\s+.+\b(?:could|might|is|are|matters)\b|\bprediction\b",
    re.I,
)
REPORTED_PATTERNS = re.compile(
    r"报道|消息|称|披露|透露|表示|according\s+to|reports?|reported|said|told",
    re.I,
)
PREPRINT_HOSTS = (
    "arxiv.org",
    "openreview.net",
    "biorxiv.org",
    "medrxiv.org",
)
FUNDING_PATTERNS = re.compile(r"融资|估值|轮融资|ipo|上市|招股|募资|funding|valuation|series\s+[a-z]|sec filing", re.I)
PRICE_PATTERNS = re.compile(r"价格|定价|售价|收费|免费|降价|美元|人民币|万元|亿元|\$\s?\d", re.I)
AVAILABILITY_PATTERNS = re.compile(r"可用|上线|推出|支持|地区|国家|账号|权限|免费|付费|rollout|available|region|account|tier", re.I)
CAPABILITY_PATTERNS = re.compile(r"模型|能力|参数|推理|上下文|benchmark|基准|版本|model|capabilit|context|version", re.I)
POLICY_PATTERNS = re.compile(r"监管|政策|法律|法院|版权|隐私|安全|合规|regulation|policy|law|court|copyright|privacy", re.I)

OFFICIAL_COVERAGE_TARGETS: tuple[dict[str, Any], ...] = (
    {"id": "openai", "provider": "OpenAI", "configured": True, "discovery": "News RSS + Codex changelog", "official_url": "https://openai.com/news/"},
    {"id": "anthropic", "provider": "Anthropic", "configured": True, "discovery": "Newsroom HTML", "official_url": "https://www.anthropic.com/news"},
    {"id": "google", "provider": "Google / DeepMind", "configured": True, "discovery": "DeepMind RSS + Google AI RSS", "official_url": "https://deepmind.google/blog/"},
    {"id": "huggingface", "provider": "Hugging Face", "configured": True, "discovery": "Blog RSS", "official_url": "https://huggingface.co/blog"},
    {"id": "github", "provider": "GitHub", "configured": True, "discovery": "AI/ML RSS + Changelog RSS", "official_url": "https://github.blog/changelog/"},
    {"id": "nvidia", "provider": "NVIDIA", "configured": True, "discovery": "NVIDIA Newsroom via OPML", "official_url": "https://nvidianews.nvidia.com/"},
    {"id": "deepseek", "provider": "DeepSeek", "configured": True, "discovery": "Official sitemap", "official_url": "https://api-docs.deepseek.com/news/news261113"},
    {"id": "bytedance_seed", "provider": "ByteDance Seed", "configured": True, "discovery": "Official sitemap", "official_url": "https://seed.bytedance.com/en/blog"},
    {"id": "minimax", "provider": "MiniMax", "configured": True, "discovery": "Official sitemap", "official_url": "https://www.minimax.io/blog"},
    {"id": "qwen", "provider": "Qwen", "configured": True, "discovery": "Qwen Blog RSS", "official_url": "https://qwenlm.github.io/blog/"},
    {"id": "meta_ai", "provider": "Meta AI", "configured": False, "discovery": "No stable public RSS detected", "official_url": "https://ai.meta.com/blog/"},
    {"id": "microsoft_ai", "provider": "Microsoft AI", "configured": False, "discovery": "No stable public RSS detected", "official_url": "https://www.microsoft.com/en-us/ai"},
    {"id": "moonshot", "provider": "Moonshot / Kimi", "configured": False, "discovery": "No stable public feed detected", "official_url": "https://www.moonshot.cn/"},
    {"id": "zhipu", "provider": "Zhipu AI", "configured": False, "discovery": "No stable public feed detected", "official_url": "https://www.zhipuai.cn/"},
    {"id": "investor_relations", "provider": "公司 IR / SEC", "configured": False, "discovery": "Manual verification required", "official_url": "https://www.sec.gov/edgar/search/"},
)


def _tier(item: dict[str, Any]) -> str:
    explicit = str(item.get("source_tier") or "").strip().lower()
    if explicit:
        return explicit
    site_id = str(item.get("site_id") or "").strip().lower()
    return SOURCE_TIER_BY_SITE.get(site_id, ("other", 9))[0]


def _tier_rank(item: dict[str, Any]) -> int:
    try:
        return int(item.get("source_tier_rank"))
    except (TypeError, ValueError):
        site_id = str(item.get("site_id") or "").strip().lower()
        return SOURCE_TIER_BY_SITE.get(site_id, ("other", 9))[1]


def _title(item: dict[str, Any]) -> str:
    return str(
        item.get("title_enhanced_zh")
        or item.get("title_bilingual")
        or item.get("title")
        or item.get("title_original")
        or ""
    ).strip()


def _text(item: dict[str, Any]) -> str:
    return " ".join(
        part for part in (
            _title(item),
            str(item.get("summary") or ""),
            str(item.get("recommend_reason_zh") or ""),
        ) if part
    ).strip()


def _domain(url: str) -> str:
    try:
        host = urlparse(str(url or "")).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


def _canonical_url(url: str) -> str:
    try:
        parsed = urlparse(str(url or "").strip())
        if parsed.scheme not in {"http", "https"}:
            return ""
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        path = re.sub(r"/+", "/", parsed.path or "/").rstrip("/")
        return f"{host}{path}"
    except Exception:
        return ""


def _is_preprint(item: dict[str, Any]) -> bool:
    domain = _domain(str(item.get("url") or ""))
    source = str(item.get("source") or "").lower()
    return _tier(item) == "research" or any(host in domain for host in PREPRINT_HOSTS) or "daily papers" in source


def _is_primary_candidate(item: dict[str, Any]) -> bool:
    tier = _tier(item)
    url = str(item.get("url") or "")
    lower = url.lower()
    if not url.startswith(("http://", "https://")):
        return False
    if tier in {"official", "research"}:
        return True
    if "github.com/" in lower and "/releases/" in lower:
        return True
    if "huggingface.co/papers/" in lower:
        return True
    return False


def _choose_primary_source(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [item for item in items if _is_primary_candidate(item)]
    if not candidates:
        return None
    return min(
        candidates,
        key=lambda item: (
            0 if _tier(item) == "official" else 1,
            _tier_rank(item),
            0 if "github.com/" in str(item.get("url") or "").lower() else 1,
            str(item.get("url") or ""),
        ),
    )


def _claim_status(primary: dict[str, Any], items: list[dict[str, Any]]) -> tuple[str, str]:
    text = _text(primary) or " ".join(_text(item) for item in items[:3])
    if RUMOR_PATTERNS.search(text):
        return "rumor", "matched_rumor_signal"
    if _is_preprint(primary):
        return "preprint", "primary_item_is_preprint"
    if ANALYSIS_PATTERNS.search(text):
        return "analysis", "matched_analysis_signal"
    if _tier(primary) in {"official"}:
        return "confirmed", "primary_item_is_official"
    return "reported", "primary_item_is_not_official"


def _verification_level(status: str, official_present: bool, independent_count: int) -> str:
    if status == "rumor":
        return "unverified"
    if status == "preprint":
        return "preprint"
    if status == "analysis":
        return "opinion"
    if status == "confirmed" and official_present:
        return "primary_confirmed"
    if independent_count >= 2 and official_present:
        return "primary_corroborated"
    if independent_count >= 2:
        return "multi_report"
    return "single_report"


def _verification_score(status: str, primary_official: bool, official_present: bool, independent_count: int, summary_missing: bool) -> int:
    base = {
        "confirmed": 76,
        "reported": 48,
        "analysis": 42,
        "preprint": 50,
        "rumor": 18,
    }.get(status, 35)
    score = base
    if primary_official:
        score += 16
    elif official_present:
        score += 8
    score += min(8, max(0, independent_count - 1) * 3)
    if summary_missing:
        score -= 5
    return max(1, min(99, score))


def _limits(primary: dict[str, Any], items: list[dict[str, Any]], primary_source_url: str) -> list[str]:
    title = _title(primary)
    blob = " ".join(_text(item) for item in items[:5])
    limits: list[str] = []
    if FUNDING_PATTERNS.search(blob):
        limits.append("融资、估值和上市信息必须再核对公司公告、SEC/交易所文件或权威原始报道。")
    if PRICE_PATTERNS.search(blob):
        limits.append("价格、币种、优惠期限和适用套餐需以官方页面为准。")
    if AVAILABILITY_PATTERNS.search(blob):
        limits.append("可用地区、账号资格、版本和灰度范围可能有额外限制。")
    if CAPABILITY_PATTERNS.search(blob):
        limits.append("模型能力、版本与权限需核对官方模型卡、发布页或技术报告。")
    if POLICY_PATTERNS.search(blob):
        limits.append("监管、法律或政策口径需核对适用地区、生效日期和原文。")
    if _tier(primary) in {"community", "discussion"} or str(primary.get("site_id") or "") == "producthunt":
        limits.append("社区榜单或产品发现页不等于官方发布，不能直接当成已确认新闻。")
    if not primary_source_url:
        limits.append("当前未在同一事件中找到官方原文或论文页，正式写稿前必须补一手来源。")
    if not str(primary.get("summary") or "").strip():
        limits.append("当前条目只有标题和链接，标题中的数字、范围和因果关系均需打开原文复核。")
    if not limits:
        limits.append("标题只代表事件摘要；正式口播前仍需人工阅读原文并记录版本和日期。")
    return list(dict.fromkeys(limits))[:5]


def build_story_verification(primary: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, Any]:
    """Return public fact-boundary fields for one merged story."""
    unique_items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in items:
        key = str(item.get("id") or item.get("url") or _title(item))
        if not key or key in seen_ids:
            continue
        seen_ids.add(key)
        unique_items.append(item)
    if not unique_items:
        unique_items = [primary]

    status, reason = _claim_status(primary, unique_items)
    primary_source = _choose_primary_source(unique_items)
    primary_source_url = str(primary_source.get("url") or "") if primary_source else ""
    primary_url_key = _canonical_url(str(primary.get("url") or ""))
    source_url_key = _canonical_url(primary_source_url)
    official_present = any(_tier(item) == "official" for item in unique_items)
    primary_official = _tier(primary) == "official"

    source_chain: list[dict[str, Any]] = []
    independent_keys: set[str] = set()
    repost_count = 0
    for item in unique_items:
        url = str(item.get("url") or "")
        url_key = _canonical_url(url)
        site_id = str(item.get("site_id") or "")
        if site_id in AGGREGATOR_SITE_IDS:
            role = "aggregator"
        elif url_key and url_key == source_url_key:
            role = "primary_source"
        elif url_key and primary_url_key and url_key == primary_url_key:
            role = "primary_report"
        elif url_key and url_key in independent_keys:
            role = "repost"
        else:
            role = "report" if _tier(item) != "official" else "primary_source"
        source_chain.append({
            "source": str(item.get("source") or item.get("site_name") or ""),
            "site_id": site_id,
            "url": url,
            "title": _title(item),
            "source_tier": _tier(item),
            "source_tier_label": SOURCE_TIER_LABELS.get(_tier(item), "其他来源"),
            "role": role,
            "is_aggregator": site_id in AGGREGATOR_SITE_IDS,
        })
        domain = _domain(url)
        if role in {"primary_source", "primary_report", "report"} and domain:
            independent_keys.add(domain)
        else:
            repost_count += 1

    independent_count = max(1 if primary_url_key else 0, len(independent_keys))
    repost_count = max(0, len(unique_items) - independent_count)
    summary_missing = not str(primary.get("summary") or "").strip()
    verification_score = _verification_score(status, primary_official, official_present, independent_count, summary_missing)
    meta = CLAIM_STATUS_META[status]
    basis_url = primary_source_url or str(primary.get("url") or "")
    basis_source = str((primary_source or primary).get("source") or "")
    claim_texts = [_title(primary)]
    summary_text = re.sub(r"<[^>]+>", " ", str(primary.get("summary") or ""))
    summary_text = re.sub(r"\s+", " ", summary_text).strip()
    if summary_text:
        claim_texts.extend(
            sentence.strip()
            for sentence in re.split(r"(?<=[。！？.!?])\s+|(?<=[。！？])", summary_text)
            if len(sentence.strip()) >= 12
        )
    deduped_claims: list[str] = []
    seen_claim_keys: set[str] = set()
    for claim_text in claim_texts:
        key = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", claim_text).lower()
        if not key or key in seen_claim_keys:
            continue
        seen_claim_keys.add(key)
        deduped_claims.append(claim_text[:320])
        if len(deduped_claims) >= 5:
            break
    key_claims = [{
        "claim": claim_text,
        "claim_type": status,
        "basis_source": basis_source,
        "basis_url": basis_url,
        "status": "source_available" if primary_source_url else "needs_primary_source",
        "note": "标题或摘要级声明，须回原文逐句核验。",
    } for claim_text in deduped_claims]
    limits = _limits(primary, unique_items, primary_source_url)
    return {
        "claim_status": status,
        "claim_status_label": meta["label"],
        "claim_status_note": meta["note"],
        "claim_status_reason": reason,
        "is_opinion": status == "analysis",
        "primary_source_url": primary_source_url or None,
        "official_source_present": official_present,
        "verification_level": _verification_level(status, official_present, independent_count),
        "verification_score": verification_score,
        "review_required": True,
        "publish_ready": False,
        "source_chain": source_chain[:12],
        "key_claims": key_claims,
        "limits": limits,
        "independent_source_count": independent_count,
        "repost_count": repost_count,
        "summary_missing": summary_missing,
    }


def _provider_for_item(item: dict[str, Any]) -> str:
    source = str(item.get("source") or "").lower()
    domain = _domain(str(item.get("url") or ""))
    source_checks = (
        ("openai", ("openai",)),
        ("anthropic", ("anthropic", "claude devs")),
        ("google", ("google", "deepmind")),
        ("huggingface", ("hugging face", "huggingface")),
        ("github", ("github",)),
        ("nvidia", ("nvidia", "英伟达")),
        ("deepseek", ("deepseek",)),
        ("bytedance_seed", ("bytedance seed", "seed：", "seed blog", "doubao", "豆包")),
        ("minimax", ("minimax",)),
        ("qwen", ("qwen", "通义千问", "阿里云")),
        ("meta_ai", ("meta ai", "ai at meta")),
        ("microsoft_ai", ("microsoft ai", "microsoft research")),
        ("moonshot", ("moonshot", "kimi", "月之暗面")),
        ("zhipu", ("zhipu", "智谱", "glm")),
    )
    for provider_id, needles in source_checks:
        if any(needle in source for needle in needles):
            return provider_id
    domain_checks = (
        ("openai", ("openai.com", "developers.openai.com")),
        ("anthropic", ("anthropic.com",)),
        ("google", ("deepmind.google", "blog.google")),
        ("huggingface", ("huggingface.co",)),
        ("github", ("github.blog", "github.com")),
        ("nvidia", ("nvidianews.nvidia.com", "nvidia.com")),
        ("deepseek", ("api-docs.deepseek.com", "deepseek.com")),
        ("bytedance_seed", ("seed.bytedance.com",)),
        ("minimax", ("minimax.io", "minimax.cn")),
        ("qwen", ("qwenlm.github.io",)),
        ("meta_ai", ("ai.meta.com",)),
        ("microsoft_ai", ("microsoft.com",)),
        ("moonshot", ("moonshot.cn",)),
        ("zhipu", ("zhipuai.cn",)),
    )
    for provider_id, suffixes in domain_checks:
        if any(domain == suffix or domain.endswith("." + suffix) for suffix in suffixes):
            return provider_id
    return ""


def build_official_coverage(items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Build a transparent coverage matrix for first-party sources."""
    official_items = [item for item in items if _tier(item) == "official"]
    counts: dict[str, int] = {}
    latest: dict[str, dict[str, Any]] = {}
    for item in official_items:
        provider_id = _provider_for_item(item)
        if not provider_id:
            continue
        counts[provider_id] = counts.get(provider_id, 0) + 1
        latest.setdefault(provider_id, item)

    providers: list[dict[str, Any]] = []
    for target in OFFICIAL_COVERAGE_TARGETS:
        provider_id = str(target["id"])
        count = counts.get(provider_id, 0)
        if count:
            status = "active"
        elif target.get("configured"):
            status = "connected_no_recent"
        else:
            status = "not_configured"
        latest_item = latest.get(provider_id) or {}
        providers.append({
            **target,
            "status": status,
            "current_official_items": count,
            "latest_url": str(latest_item.get("url") or ""),
            "latest_title": _title(latest_item),
            "latest_published_at": latest_item.get("published_at"),
        })
    return {
        "version": "official_coverage_v1",
        "configured_count": sum(1 for p in providers if p.get("configured")),
        "active_count": sum(1 for p in providers if p.get("status") == "active"),
        "gap_count": sum(1 for p in providers if p.get("status") == "not_configured"),
        "providers": providers,
    }

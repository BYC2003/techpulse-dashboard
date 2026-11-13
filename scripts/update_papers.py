#!/usr/bin/env python3
"""Build the authoritative papers section.

The 40 authoritative papers are an editorially curated landmark set with
canonical source links. The 10 hot papers are selected from Hugging Face
Daily Papers by upvotes, comments and recency within a 21-day window.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

DAILY_PAPERS_API = "https://huggingface.co/api/daily_papers?limit=100"
HEADERS = {"User-Agent": "TechPulse/1.2 (+https://byc2003.github.io/techpulse-dashboard/)"}

AUTHORITATIVE_PAPERS: list[dict[str, Any]] = [
    {"id": "1706.03762", "title": "Attention Is All You Need", "year": 2017, "category": "基础架构", "venue": "NeurIPS 2017", "url": "https://arxiv.org/abs/1706.03762", "why": "提出 Transformer，成为现代大语言模型和多模态模型的基础架构。"},
    {"id": "1512.03385", "title": "Deep Residual Learning for Image Recognition", "year": 2015, "category": "基础架构", "venue": "CVPR 2016", "url": "https://arxiv.org/abs/1512.03385", "why": "ResNet 残差连接解决了深层网络训练难题，是视觉与深度网络的基础工作。"},
    {"id": "1406.2661", "title": "Generative Adversarial Networks", "year": 2014, "category": "基础架构", "venue": "NeurIPS 2014", "url": "https://arxiv.org/abs/1406.2661", "why": "提出 GAN 对抗生成框架，深刻影响图像、视频与生成式 AI。"},
    {"id": "1412.6980", "title": "Adam: A Method for Stochastic Optimization", "year": 2014, "category": "基础架构", "venue": "ICLR 2015", "url": "https://arxiv.org/abs/1412.6980", "why": "Adam 优化器成为深度学习训练最常用的基础算法之一。"},
    {"id": "alexnet", "title": "ImageNet Classification with Deep Convolutional Neural Networks", "year": 2012, "category": "基础架构", "venue": "NeurIPS 2012", "url": "https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html", "why": "AlexNet 引爆深度学习浪潮，证明大规模神经网络与 GPU 训练的威力。"},
    {"id": "1409.3215", "title": "Sequence to Sequence Learning with Neural Networks", "year": 2014, "category": "基础架构", "venue": "NeurIPS 2014", "url": "https://arxiv.org/abs/1409.3215", "why": "Seq2Seq 奠定神经机器翻译和序列生成的基础范式。"},
    {"id": "1409.0473", "title": "Neural Machine Translation by Jointly Learning to Align and Translate", "year": 2014, "category": "基础架构", "venue": "ICLR 2015", "url": "https://arxiv.org/abs/1409.0473", "why": "引入注意力机制，直接影响后续 Transformer 与长上下文建模。"},
    {"id": "1207.0580", "title": "Improving neural networks by preventing co-adaptation of feature detectors", "year": 2012, "category": "基础架构", "venue": "arXiv", "url": "https://arxiv.org/abs/1207.0580", "why": "Dropout 的代表性论文，是神经网络正则化的经典方法。"},
    {"id": "1810.04805", "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "year": 2018, "category": "大模型与缩放", "venue": "NAACL 2019", "url": "https://arxiv.org/abs/1810.04805", "why": "确立预训练+微调范式，推动 NLP 进入预训练模型时代。"},
    {"id": "2005.14165", "title": "Language Models are Few-Shot Learners", "year": 2020, "category": "大模型与缩放", "venue": "NeurIPS 2020", "url": "https://arxiv.org/abs/2005.14165", "why": "GPT-3 展示规模扩展与少样本学习的涌现能力。"},
    {"id": "2001.08361", "title": "Scaling Laws for Neural Language Models", "year": 2020, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2001.08361", "why": "建立参数量、数据量与计算量之间的缩放规律，成为大模型研发的重要依据。"},
    {"id": "2203.02155", "title": "Training language models to follow instructions with human feedback", "year": 2022, "category": "大模型与缩放", "venue": "NeurIPS 2022", "url": "https://arxiv.org/abs/2203.02155", "why": "InstructGPT/RLHF 让大模型从补全文本转向遵循人类指令。"},
    {"id": "2203.15556", "title": "Training Compute-Optimal Large Language Models", "year": 2022, "category": "大模型与缩放", "venue": "NeurIPS 2022", "url": "https://arxiv.org/abs/2203.15556", "why": "Chinchilla 重新定义模型规模与训练 token 的配比。"},
    {"id": "2303.08774", "title": "GPT-4 Technical Report", "year": 2023, "category": "大模型与缩放", "venue": "OpenAI Technical Report", "url": "https://arxiv.org/abs/2303.08774", "why": "系统披露 GPT-4 的能力、评测与安全对齐方法。"},
    {"id": "2302.13971", "title": "LLaMA: Open and Efficient Foundation Language Models", "year": 2023, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2302.13971", "why": "推动开放权重基础模型生态，成为开源大模型的重要起点。"},
    {"id": "2307.09288", "title": "Llama 2: Open Foundation and Fine-Tuned Chat Models", "year": 2023, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2307.09288", "why": "系统说明开放基础模型与对话模型的训练、评测和安全策略。"},
    {"id": "2412.19437", "title": "DeepSeek-V3 Technical Report", "year": 2024, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2412.19437", "why": "MoE 大模型的高效训练与推理代表工作，对低成本大模型路线影响显著。"},
    {"id": "2501.12948", "title": "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", "year": 2025, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2501.12948", "why": "以强化学习激发推理能力的代表性工作，推动推理模型成为研究热点。"},
    {"id": "2412.15115", "title": "Qwen2.5 Technical Report", "year": 2024, "category": "大模型与缩放", "venue": "arXiv", "url": "https://arxiv.org/abs/2412.15115", "why": "覆盖多尺寸、多语言与长上下文能力的开放模型技术报告。"},
    {"id": "2201.11903", "title": "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", "year": 2022, "category": "Agent、推理与对齐", "venue": "NeurIPS 2022", "url": "https://arxiv.org/abs/2201.11903", "why": "提出思维链提示，显著提升大模型的复杂推理能力。"},
    {"id": "2210.03629", "title": "ReAct: Synergizing Reasoning and Acting in Language Models", "year": 2022, "category": "Agent、推理与对齐", "venue": "ICLR 2023", "url": "https://arxiv.org/abs/2210.03629", "why": "将推理与工具行动结合，是 AI Agent 的核心基础论文之一。"},
    {"id": "2302.04761", "title": "Toolformer: Language Models Can Teach Themselves to Use Tools", "year": 2023, "category": "Agent、推理与对齐", "venue": "NeurIPS 2023", "url": "https://arxiv.org/abs/2302.04761", "why": "展示语言模型自主调用外部工具的可行路径。"},
    {"id": "2005.11401", "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "year": 2020, "category": "Agent、推理与对齐", "venue": "NeurIPS 2020", "url": "https://arxiv.org/abs/2005.11401", "why": "提出 RAG，成为知识增强、搜索问答和企业知识库的基础方法。"},
    {"id": "2305.18290", "title": "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", "year": 2023, "category": "Agent、推理与对齐", "venue": "NeurIPS 2023", "url": "https://arxiv.org/abs/2305.18290", "why": "DPO 简化偏好对齐流程，成为 RLHF 之外的重要对齐方法。"},
    {"id": "2212.08073", "title": "Constitutional AI: Harmlessness from AI Feedback", "year": 2022, "category": "Agent、推理与对齐", "venue": "Anthropic", "url": "https://arxiv.org/abs/2212.08073", "why": "提出基于原则与 AI 反馈的安全对齐框架。"},
    {"id": "2106.09685", "title": "LoRA: Low-Rank Adaptation of Large Language Models", "year": 2021, "category": "Agent、推理与对齐", "venue": "ICLR 2022", "url": "https://arxiv.org/abs/2106.09685", "why": "低秩微调方法，大幅降低大模型适配与部署成本。"},
    {"id": "2205.14135", "title": "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness", "year": 2022, "category": "Agent、推理与对齐", "venue": "NeurIPS 2022", "url": "https://arxiv.org/abs/2205.14135", "why": "重构注意力计算的显存与速度路径，成为长上下文训练基础设施。"},
    {"id": "2101.03961", "title": "Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity", "year": 2021, "category": "Agent、推理与对齐", "venue": "JMLR 2022", "url": "https://arxiv.org/abs/2101.03961", "why": "推动稀疏 MoE 架构在大模型中的规模化应用。"},
    {"id": "2312.00752", "title": "Mamba: Linear-Time Sequence Modeling with Selective State Spaces", "year": 2023, "category": "Agent、推理与对齐", "venue": "COLM 2024", "url": "https://arxiv.org/abs/2312.00752", "why": "以选择性状态空间挑战 Transformer 的长序列计算瓶颈。"},
    {"id": "2006.11239", "title": "Denoising Diffusion Probabilistic Models", "year": 2020, "category": "生成与多模态", "venue": "NeurIPS 2020", "url": "https://arxiv.org/abs/2006.11239", "why": "DDPM 奠定现代扩散生成模型的理论与训练基础。"},
    {"id": "2105.05233", "title": "Diffusion Models Beat GANs on Image Synthesis", "year": 2021, "category": "生成与多模态", "venue": "NeurIPS 2021", "url": "https://arxiv.org/abs/2105.05233", "why": "证明扩散模型在图像生成质量上可以超越 GAN。"},
    {"id": "2112.10752", "title": "High-Resolution Image Synthesis with Latent Diffusion Models", "year": 2021, "category": "生成与多模态", "venue": "CVPR 2022", "url": "https://arxiv.org/abs/2112.10752", "why": "Latent Diffusion/Stable Diffusion 的基础论文，推动高质量图像生成普及。"},
    {"id": "2103.00020", "title": "Learning Transferable Visual Models From Natural Language Supervision", "year": 2021, "category": "生成与多模态", "venue": "ICML 2021", "url": "https://arxiv.org/abs/2103.00020", "why": "CLIP 建立图文对比学习范式，成为多模态模型的重要基础。"},
    {"id": "2010.11929", "title": "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale", "year": 2020, "category": "生成与多模态", "venue": "ICLR 2021", "url": "https://arxiv.org/abs/2010.11929", "why": "ViT 证明 Transformer 可以成为通用视觉主干网络。"},
    {"id": "2204.14198", "title": "Flamingo: a Visual Language Model for Few-Shot Learning", "year": 2022, "category": "生成与多模态", "venue": "NeurIPS 2022", "url": "https://arxiv.org/abs/2204.14198", "why": "展示少样本视觉语言模型的跨模态推理能力。"},
    {"id": "2304.02643", "title": "Segment Anything", "year": 2023, "category": "生成与多模态", "venue": "ICCV 2023", "url": "https://arxiv.org/abs/2304.02643", "why": "SAM 推动通用图像分割与视觉基础模型的发展。"},
    {"id": "2308.04079", "title": "3D Gaussian Splatting for Real-Time Radiance Field Rendering", "year": 2023, "category": "生成与多模态", "venue": "SIGGRAPH 2023", "url": "https://arxiv.org/abs/2308.04079", "why": "3DGS 以实时高质量渲染推动三维重建与生成式 3D 发展。"},
    {"id": "2003.08934", "title": "NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis", "year": 2020, "category": "生成与多模态", "venue": "ECCV 2020", "url": "https://arxiv.org/abs/2003.08934", "why": "NeRF 开创神经辐射场，成为三维视觉与场景重建的重要基础。"},
    {"id": "alphafold2", "title": "Highly accurate protein structure prediction with AlphaFold", "year": 2021, "category": "AI for Science", "venue": "Nature", "url": "https://www.nature.com/articles/s41586-021-03819-2", "why": "AlphaFold 2 解决长期困扰生物学的蛋白质结构预测难题。"},
    {"id": "alphago", "title": "Mastering the game of Go with deep neural networks and tree search", "year": 2016, "category": "AI for Science", "venue": "Nature", "url": "https://www.nature.com/articles/nature16961", "why": "AlphaGo 是深度强化学习与复杂博弈结合的里程碑。"},
]


def clean_text(value: Any, limit: int = 500) -> str:
    raw = str(value or "")
    if not raw:
        return ""
    text = BeautifulSoup(raw, "html.parser").get_text(" ", strip=True) if "<" in raw else raw
    text = re.sub(r"\s+", " ", text).strip()
    return text[: limit - 1].rstrip() + "…" if len(text) > limit else text


def fetch_daily_papers() -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.get(DAILY_PAPERS_API, headers=HEADERS, timeout=45)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Daily Papers request failed: {last_error}")


def parse_datetime(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def hot_paper_items(raw_rows: list[dict[str, Any]], now: datetime, window_days: int) -> list[dict[str, Any]]:
    window_start = now - timedelta(days=window_days)
    items: list[dict[str, Any]] = []
    for row in raw_rows:
        paper = row.get("paper") or {}
        paper_id = str(paper.get("id") or "").strip()
        title = clean_text(paper.get("title"), 300)
        published = parse_datetime(paper.get("publishedAt", ""))
        if not paper_id or not title or not published or published < window_start:
            continue
        authors = [a.get("name", "") for a in (paper.get("authors") or []) if isinstance(a, dict) and a.get("name")]
        upvotes = int(paper.get("upvotes") or 0)
        comments = int(row.get("numComments") or 0)
        freshness = max(0.0, 1.0 - (now - published).total_seconds() / (window_days * 86400))
        score = upvotes * 10 + comments * 2 + freshness
        arxiv_url = f"https://arxiv.org/abs/{paper_id}" if re.fullmatch(r"\d{4}\.\d{4,5}(?:v\d+)?", paper_id) else ""
        items.append({
            "id": paper_id,
            "title": title,
            "authors": authors[:8],
            "published_at": published.isoformat(),
            "upvotes": upvotes,
            "comments": comments,
            "discussion_score": round(score, 2),
            "summary": clean_text(paper.get("ai_summary") or paper.get("summary"), 520),
            "keywords": [str(k) for k in (paper.get("ai_keywords") or []) if k][:8],
            "url": arxiv_url or f"https://huggingface.co/papers/{paper_id}",
            "arxiv_url": arxiv_url,
            "discussion_url": f"https://huggingface.co/papers/{paper_id}",
            "source": "Hugging Face Daily Papers",
        })
    items.sort(key=lambda item: (item["upvotes"], item["comments"], item["published_at"]), reverse=True)
    return items[:10]


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        name = handle.name
    Path(name).replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/papers.json")
    parser.add_argument("--hot-window-days", type=int, default=21)
    args = parser.parse_args()
    if len(AUTHORITATIVE_PAPERS) != 40:
        print(f"Expected 40 authoritative papers, got {len(AUTHORITATIVE_PAPERS)}", file=sys.stderr)
        return 1
    now = datetime.now(timezone.utc)
    try:
        hot = hot_paper_items(fetch_daily_papers(), now, args.hot_window_days)
        if len(hot) != 10:
            raise RuntimeError(f"Expected 10 hot papers, got {len(hot)}")
        payload = {
            "generated_at": now.isoformat(),
            "authoritative": {
                "count": len(AUTHORITATIVE_PAPERS),
                "selection": "editorial-landmarks",
                "note": "人工精选的 AI 里程碑论文，不按时间限制；以原始论文、官方会议页或 Nature 页面为准。",
                "items": AUTHORITATIVE_PAPERS,
            },
            "hot": {
                "count": len(hot),
                "selection": "huggingface-daily-papers",
                "window_days": args.hot_window_days,
                "note": "Hugging Face Daily Papers 近 21 天按点赞、评论与时效综合排序。",
                "source_url": "https://huggingface.co/papers",
                "items": hot,
            },
        }
        atomic_write_json(Path(args.output), payload)
        print(f"Wrote {args.output}: authoritative=40, hot={len(hot)}")
        return 0
    except Exception as exc:
        print(f"Papers update failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
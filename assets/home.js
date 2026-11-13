const OVERVIEW_REFRESH_MS = 5 * 60 * 1000;
const overviewState = {
  news: null,
  github: null,
  voices: null,
  papers: null,
  status: null,
  lastRefresh: 0,
  lastDataKey: "",
};

const overviewEls = {
  updatedAt: document.getElementById("overviewUpdatedAt"),
  sourceStatus: document.getElementById("overviewSourceStatus"),
  itemCount: document.getElementById("overviewItemCount"),
  siteCount: document.getElementById("overviewSiteCount"),
  newsCount: document.getElementById("overviewNewsCount"),
  newsSources: document.getElementById("overviewNewsSources"),
  githubCount: document.getElementById("overviewGithubCount"),
  voiceCount: document.getElementById("overviewVoiceCount"),
  voiceSources: document.getElementById("overviewVoiceSources"),
  paperCount: document.getElementById("overviewPaperCount"),
  hotPaperCount: document.getElementById("overviewHotPaperCount"),
  wordCloud: document.getElementById("wordCloud"),
  wordCloudMeta: document.getElementById("wordCloudMeta"),
  wordCloudDetails: document.getElementById("wordCloudDetails"),
  latestList: document.getElementById("overviewLatestList"),
};

const KEYWORD_DEFS = [
  { label: "Gemini", query: "Gemini", aliases: [/gemini/i] },
  { label: "OpenAI", query: "OpenAI", aliases: [/openai/i] },
  { label: "ChatGPT", query: "ChatGPT", aliases: [/chatgpt/i] },
  { label: "Claude", query: "Claude", aliases: [/claude/i] },
  { label: "DeepSeek", query: "DeepSeek", aliases: [/deepseek/i] },
  { label: "千问 / Qwen", query: "Qwen", aliases: [/qwen/i, /千问/] },
  { label: "Codex", query: "Codex", aliases: [/codex/i] },
  { label: "Copilot", query: "Copilot", aliases: [/copilot/i] },
  { label: "Agent", query: "Agent", aliases: [/\bagents?\b/i, /agentic/i, /代理/] },
  { label: "智能体", query: "智能体", aliases: [/智能体/] },
  { label: "大模型", query: "大模型", aliases: [/大模型/i, /\bllms?\b/i, /language model/i] },
  { label: "开源", query: "开源", aliases: [/开源/i, /open[- ]?source/i] },
  { label: "多模态", query: "多模态", aliases: [/多模态/i, /multimodal/i] },
  { label: "推理", query: "推理", aliases: [/推理/i, /reasoning/i] },
  { label: "语音", query: "语音", aliases: [/语音/i, /voice/i, /speech/i, /audio/i] },
  { label: "视频生成", query: "视频生成", aliases: [/视频生成/i, /video generation/i, /text-to-video/i] },
  { label: "机器人", query: "机器人", aliases: [/机器人/i, /robotics?/i] },
  { label: "芯片", query: "芯片", aliases: [/芯片/i, /chip/i, /semiconductor/i] },
  { label: "算力", query: "算力", aliases: [/算力/i, /compute/i, /infrastructure/i] },
  { label: "GitHub", query: "GitHub", aliases: [/github/i] },
  { label: "融资", query: "融资", aliases: [/融资/i, /funding/i, /investment/i] },
  { label: "IPO", query: "IPO", aliases: [/\bipo\b/i] },
  { label: "AI 安全", query: "AI安全", aliases: [/ai safety/i, /\bsafety\b/i, /安全/i] },
  { label: "隐私", query: "隐私", aliases: [/隐私/i, /privacy/i] },
  { label: "监管", query: "监管", aliases: [/监管/i, /regulation/i, /policy/i] },
  { label: "教育", query: "教育", aliases: [/教育/i, /education/i, /学生/i, /学校/i] },
  { label: "工作", query: "工作", aliases: [/工作/i, /办公/i, /workflow/i, /productivity/i] },
  { label: "基准测试", query: "基准测试", aliases: [/基准测试/i, /benchmark/i] },
  { label: "世界模型", query: "世界模型", aliases: [/世界模型/i, /world model/i] },
  { label: "英伟达", query: "NVIDIA", aliases: [/nvidia/i, /英伟达/i] },
  { label: "微软", query: "Microsoft", aliases: [/microsoft/i, /微软/i] },
  { label: "苹果", query: "Apple", aliases: [/apple/i, /苹果/i] },
  { label: "谷歌", query: "Google", aliases: [/google/i, /谷歌/i] },
];

function overviewFetch(path) {
  return fetch(`${path}?t=${Date.now()}`, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  });
}

function formatOverviewTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatOverviewRelative(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function formatOverviewNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function safeOverviewUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function overviewItems() {
  return Array.isArray(overviewState.news?.items) ? overviewState.news.items : [];
}

function itemOverviewTitle(item) {
  return String(item?.title_zh || item?.title || item?.title_original || item?.title_en || "未命名信息").trim();
}

function itemOverviewText(item) {
  return [
    item?.title,
    item?.title_zh,
    item?.title_en,
    item?.summary,
    ...(Array.isArray(item?.ai_signals) ? item.ai_signals : []),
    item?.ai_label,
  ].filter(Boolean).join(" ").toLowerCase();
}

const SIGNAL_LABELS = {  "openai": { label: "OpenAI", query: "OpenAI" },  "anthropic": { label: "Anthropic", query: "Anthropic" },  "gemini": { label: "Gemini", query: "Gemini" },  "claude": { label: "Claude", query: "Claude" },  "chatgpt": { label: "ChatGPT", query: "ChatGPT" },  "deepseek": { label: "DeepSeek", query: "DeepSeek" },  "codex": { label: "Codex", query: "Codex" },  "copilot": { label: "Copilot", query: "Copilot" },  "grok": { label: "Grok", query: "Grok" },  "qwen": { label: "Qwen", query: "Qwen" },  "hugging face": { label: "Hugging Face", query: "Hugging Face" },  "huggingface": { label: "Hugging Face", query: "Hugging Face" },  "mcp": { label: "MCP", query: "MCP" },  "gpu": { label: "GPU", query: "GPU" },  "cloud": { label: "云基础设施", query: "云" },  "chip": { label: "芯片", query: "芯片" },  "agent skills": { label: "Agent Skills", query: "Agent Skills" },  "context": { label: "长上下文", query: "上下文" },  "eval": { label: "Eval", query: "Eval" },  "benchmark": { label: "Benchmark", query: "Benchmark" },  "diffusion": { label: "扩散模型", query: "Diffusion" },  "prompt": { label: "Prompt", query: "Prompt" },  "vision": { label: "视觉模型", query: "Vision" },  "robot": { label: "机器人", query: "机器人" },};const GENERIC_SIGNAL_PATTERN = /^(?:ai|a\.i\.|llm|llms?|model|models?|人工智能|模型|developer|software|technology|tech|news|update|aibase|techcrunch ai|the decoder ai news|for agents|open source|技术|大模型|technical)$/i;const MODEL_ENTITY_PATTERN = /\b(?:GPT(?:-\d+(?:\.\d+)?)?|Gemini(?:\s+\d+(?:\.\d+)?)?(?:\s+[A-Z][A-Za-z0-9.-]+)?|Claude(?:\s+(?:Code|Opus|Sonnet|Haiku|\d+(?:\.\d+)?))?|DeepSeek(?:[- ](?:Harness|R1|V\d+|[A-Za-z0-9.]+))?|Qwen(?:\d+(?:\.\d+)?)?|Llama(?:\s+\d+(?:\.\d+)?)?|Grok(?:\s+Bot)?(?:\s+\d+(?:\.\d+)?)?|Codex(?:\s+CLI)?(?:\s+\d+(?:\.\d+){1,2})?|Edge0(?:-\d+B)?|Scribe\s+v\d+(?:\.\d+)?|SparkAudio\s+\d+(?:\.\d+)?|Hy\s+Realtime|H3[-\s]?Image|Seedance\s*\d+(?:\.\d+)?(?:flash)?|Matrix-Game\s*\d+(?:\.\d+)?|Gemini\s+Robotics\s+\d+(?:\.\d+)?|AlphaGenome\s*2|AlphaProof(?:\s+Code)?|MCP|RAG|RLHF|DPO|MoE|LoRA|CoT|Mamba|NeRF|CLIP|ViT|SAM|3DGS)\b/gi;const PAPER_TOPIC_DEFS = [  { label: "Transformer", query: "Transformer", aliases: [/transformer/i] },  { label: "Chain-of-Thought", query: "Chain-of-Thought", aliases: [/chain[- ]of[- ]thought/i, /\bcot\b/i] },  { label: "RAG", query: "RAG", aliases: [/retrieval[- ]augmented/i, /\brag\b/i] },  { label: "RLHF", query: "RLHF", aliases: [/reinforcement learning from human feedback/i, /rlhf/i] },  { label: "DPO", query: "DPO", aliases: [/\bdpo\b/i, /direct preference optimization/i] },  { label: "MoE", query: "MoE", aliases: [/mixture[- ]of[- ]experts/i, /\bmoe\b/i] },  { label: "LoRA", query: "LoRA", aliases: [/\blora\b/i] },  { label: "Diffusion", query: "Diffusion", aliases: [/diffusion/i] },  { label: "多模态", query: "多模态", aliases: [/multimodal/i, /多模态/i] },  { label: "World Model", query: "World Model", aliases: [/world model/i, /世界模型/i] },  { label: "Alignment", query: "Alignment", aliases: [/alignment/i, /对齐/i] },  { label: "NeRF / 3DGS", query: "NeRF", aliases: [/nerf/i, /gaussian splatting/i, /3dgs/i] },  { label: "Mamba", query: "Mamba", aliases: [/mamba/i] },  { label: "Benchmark", query: "Benchmark", aliases: [/benchmark/i, /基准测试/i] },  { label: "Agent", query: "Agent", aliases: [/\bagents?\b/i, /agentic/i, /智能体/i] },  { label: "AI Safety", query: "AI安全", aliases: [/ai safety/i, /alignment/i, /\bsafety\b/i, /AI安全/i, /对齐/i] },  { label: "Privacy", query: "隐私", aliases: [/privacy/i, /隐私/i] },  { label: "Regulation", query: "监管", aliases: [/regulation/i, /policy/i, /监管/i, /政策/i] },  { label: "Education", query: "教育", aliases: [/education/i, /教育/i, /学生/i, /学校/i] },  { label: "Robotics", query: "机器人", aliases: [/robot/i, /robotics/i, /机器人/i] },  { label: "Open Source", query: "开源", aliases: [/open[- ]?source/i, /开源/i] },];function normalizeSignal(value) {  const raw = String(value || "").trim().replace(/\s+/g, " ");  const key = raw.toLowerCase();  if (!raw || raw.length > 48 || GENERIC_SIGNAL_PATTERN.test(key)) return null;  const pretty = /^[a-z]/.test(raw) ? raw.replace(/\b[a-z]/g, (char) => char.toUpperCase()) : raw;  return SIGNAL_LABELS[key] || { label: pretty, query: pretty };}function cloudItemWeight(item) {  const published = new Date(item.published_at || item.first_seen_at || 0).getTime();  const ageHours = published ? Math.max(0, (Date.now() - published) / 3600000) : 24;  const recency = ageHours <= 6 ? 1.5 : ageHours <= 12 ? 1.3 : ageHours <= 24 ? 1.1 : 0.8;  const aiScore = Math.max(0, Math.min(1, Number(item.ai_score) || 0.6));  const tierRank = Math.max(0, Math.min(3, Number(item.source_tier_rank ?? 0)));  return 1 + aiScore * 1.4 + (3 - tierRank) * 0.25 + recency;}function addCloudTerm(terms, seen, label, query, score, sample) {  const cleanLabel = String(label || "").trim();  if (!cleanLabel || score <= 0) return;  const key = cleanLabel.toLowerCase();  if (seen.has(key)) return;  seen.add(key);  if (!terms.has(key)) terms.set(key, { label: cleanLabel, query: query || cleanLabel, score: 0, mentions: 0, samples: [] });  const row = terms.get(key);  row.score += score;  row.mentions += 1;  if (sample && row.samples.length < 4 && !row.samples.includes(sample)) row.samples.push(sample);}function buildKeywordCloud(items, papers) {  const terms = new Map();  items.forEach((item) => {    const seen = new Set();    const sample = itemOverviewTitle(item);    const haystack = itemOverviewText(item);    const weight = cloudItemWeight(item);    (Array.isArray(item.ai_signals) ? item.ai_signals : []).forEach((signal) => {      const normalized = normalizeSignal(signal);      if (normalized) addCloudTerm(terms, seen, normalized.label, normalized.query, weight * 1.35, sample);    });    const title = String(item.title_zh || item.title || "");    for (const match of title.matchAll(new RegExp(MODEL_ENTITY_PATTERN.source, "gi"))) {      const label = match[0].replace(/\s+/g, " ").trim();      if (label.length >= 2) addCloudTerm(terms, seen, label, label, weight * 1.8, sample);    }      });  const authoritative = Array.isArray(papers?.authoritative?.items) ? papers.authoritative.items : [];  authoritative.forEach((paper) => {    const seen = new Set();    const sample = paper.title || "权威论文";    const haystack = `${paper.title || ""} ${paper.why || ""} ${paper.category || ""} ${paper.venue || ""}`;    PAPER_TOPIC_DEFS.forEach((definition) => {      if (definition.aliases.some((pattern) => pattern.test(haystack))) {        addCloudTerm(terms, seen, definition.label, definition.query, 2.0, sample);      }    });      });  const hot = Array.isArray(papers?.hot?.items) ? papers.hot.items : [];  hot.forEach((paper) => {    const seen = new Set();    const sample = paper.title || "最新热议论文";    const haystack = `${paper.title || ""} ${paper.summary || ""} ${(paper.keywords || []).join(" ")}`;    const weight = 1.4 + Math.min(2.2, (Number(paper.upvotes) || 0) / 40);    (Array.isArray(paper.keywords) ? paper.keywords : []).forEach((keyword) => {      const normalized = normalizeSignal(keyword);      if (normalized) addCloudTerm(terms, seen, normalized.label, normalized.query, weight * 0.9, sample);    });    for (const match of `${paper.title || ""} ${(paper.keywords || []).join(" ")}`.matchAll(new RegExp(MODEL_ENTITY_PATTERN.source, "gi"))) {      const label = match[0].replace(/\s+/g, " ").trim();      if (label.length >= 2) addCloudTerm(terms, seen, label, label, weight * 1.6, sample);    }    PAPER_TOPIC_DEFS.forEach((definition) => {      if (definition.aliases.some((pattern) => pattern.test(haystack))) {        addCloudTerm(terms, seen, definition.label, definition.query, weight * 1.9, sample);      }    });  });  const sorted = Array.from(terms.values()).sort((a, b) => b.score - a.score || b.mentions - a.mentions);  const filtered = sorted.filter((term) => {    const label = term.label.toLowerCase();    return !sorted.some((other) => other !== term && other.label.toLowerCase().startsWith(`${label} `) && other.score >= term.score * 0.8);  });  return filtered.slice(0, 30);}function renderWordCloud(terms) {  if (!overviewEls.wordCloud) return;  overviewEls.wordCloud.replaceChildren();  if (!terms.length) {    const empty = document.createElement("p");    empty.className = "overview-loading";    empty.textContent = "暂无可计算的热词信号。";    overviewEls.wordCloud.appendChild(empty);    renderWordCloudDetails([]);    return;  }  const maxScore = terms[0].score || 1;  const minScore = terms[terms.length - 1].score || 0;  terms.forEach((term, index) => {    const ratio = maxScore === minScore ? 1 : (term.score - minScore) / (maxScore - minScore);    const button = document.createElement("button");    button.type = "button";    button.className = `cloud-term cloud-tone-${index % 5}`;    button.style.setProperty("--cloud-size", `${14 + Math.round(ratio * 25)}px`);    button.style.setProperty("--cloud-rotate", `${((index * 7) % 9) - 4}deg`);    button.title = `${term.mentions} 条信息命中`;    button.textContent = term.label;    button.addEventListener("click", () => {      window.location.href = `dashboard.html?view=news&q=${encodeURIComponent(term.query || term.label)}`;    });    overviewEls.wordCloud.appendChild(button);  });  renderWordCloudDetails(terms);}function renderWordCloudDetails(terms) {  if (!overviewEls.wordCloudDetails) return;  overviewEls.wordCloudDetails.replaceChildren();  terms.slice(0, 8).forEach((term) => {    const link = document.createElement("a");    link.className = "cloud-detail-item";    link.href = `dashboard.html?view=news&q=${encodeURIComponent(term.query || term.label)}`;    const label = document.createElement("span");    label.className = "cloud-detail-term";    label.textContent = `${term.label} · ${term.mentions} 条`;    const arrow = document.createElement("span");    arrow.className = "cloud-detail-arrow";    arrow.textContent = "↗";    const sample = document.createElement("span");    sample.className = "cloud-detail-sample";    sample.textContent = term.samples[0] || "查看相关信息";    link.append(label, arrow, sample);    overviewEls.wordCloudDetails.appendChild(link);  });}function renderOverviewCards() {
  const items = overviewItems();
  const uniqueSites = new Set(items.map((item) => item.site_id || item.site || item.source).filter(Boolean));
  if (overviewEls.newsCount) overviewEls.newsCount.textContent = formatOverviewNumber(items.length);
  if (overviewEls.newsSources) overviewEls.newsSources.textContent = formatOverviewNumber(uniqueSites.size);
  if (overviewEls.itemCount) overviewEls.itemCount.textContent = formatOverviewNumber(items.length);
  if (overviewEls.siteCount) overviewEls.siteCount.textContent = formatOverviewNumber(uniqueSites.size);
  if (overviewEls.updatedAt) overviewEls.updatedAt.textContent = formatOverviewTime(overviewState.news?.generated_at);
  const githubTotal = (overviewState.github?.periods?.weekly?.items?.length || 0) + (overviewState.github?.periods?.monthly?.items?.length || 0);
  if (overviewEls.githubCount) overviewEls.githubCount.textContent = formatOverviewNumber(githubTotal);
  if (overviewEls.voiceCount) overviewEls.voiceCount.textContent = formatOverviewNumber(overviewState.voices?.item_count || overviewState.voices?.items?.length || 0);
  if (overviewEls.voiceSources) overviewEls.voiceSources.textContent = formatOverviewNumber(overviewState.voices?.ok_source_count || 0);
  if (overviewEls.paperCount) overviewEls.paperCount.textContent = formatOverviewNumber(overviewState.papers?.authoritative?.count || 0);
  if (overviewEls.hotPaperCount) overviewEls.hotPaperCount.textContent = formatOverviewNumber(overviewState.papers?.hot?.count || 0);
}

function renderSourceStatus() {
  if (!overviewEls.sourceStatus) return;
  const status = overviewState.status;
  if (!status) {
    overviewEls.sourceStatus.textContent = "来源状态暂不可用";
    overviewEls.sourceStatus.classList.add("warn");
    return;
  }
  const total = Array.isArray(status.sites) ? status.sites.length : 0;
  const ok = Number(status.successful_sites) || 0;
  const failed = Math.max(0, total - ok);
  overviewEls.sourceStatus.textContent = failed ? `${ok}/${total} 来源正常 · 失败 ${failed}` : `${ok}/${total} 来源正常`;
  overviewEls.sourceStatus.classList.toggle("warn", failed > 0);
}

function renderLatestItems() {
  if (!overviewEls.latestList) return;
  const seen = new Set();
  const items = overviewItems()
    .filter((item) => {
      const title = itemOverviewTitle(item);
      const url = safeOverviewUrl(item.url);
      if (!url || seen.has(title)) return false;
      seen.add(title);
      return true;
    })
    .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
    .slice(0, 6);
  overviewEls.latestList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "overview-loading";
    empty.textContent = "暂时没有可展示的最新信息。";
    overviewEls.latestList.appendChild(empty);
    return;
  }
  items.forEach((item, index) => {
    const link = document.createElement("a");
    link.className = "overview-latest-item";
    link.href = safeOverviewUrl(item.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const rank = document.createElement("span");
    rank.className = "overview-latest-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const body = document.createElement("div");
    body.className = "overview-latest-body";
    const title = document.createElement("h3");
    title.textContent = itemOverviewTitle(item);
    const meta = document.createElement("p");
    meta.textContent = `${item.source || item.site_name || "来源"} · ${formatOverviewRelative(item.published_at)}`;
    body.append(title, meta);
    const arrow = document.createElement("span");
    arrow.className = "overview-latest-arrow";
    arrow.textContent = "↗";
    link.append(rank, body, arrow);
    overviewEls.latestList.appendChild(link);
  });
}

function renderWordCloudMeta(terms) {
  if (!overviewEls.wordCloudMeta) return;
  const items = overviewItems();
  const paperCount = (overviewState.papers?.authoritative?.count || 0) + (overviewState.papers?.hot?.count || 0);
  overviewEls.wordCloudMeta.textContent = `${items.length} 条资讯 + ${paperCount} 篇论文 · ${terms.length} 个具体热词 · ${formatOverviewTime(overviewState.news?.generated_at)} 更新`;
}

async function refreshOverview() {
  overviewState.lastRefresh = Date.now();
  const [newsResult, githubResult, voicesResult, papersResult, statusResult] = await Promise.allSettled([
    overviewFetch("data/latest-24h.json"),
    overviewFetch("data/github-rankings.json"),
    overviewFetch("data/authority-voices.json"),
    overviewFetch("data/papers.json"),
    overviewFetch("data/source-status.json"),
  ]);
  if (newsResult.status === "fulfilled") overviewState.news = newsResult.value;
  if (githubResult.status === "fulfilled") overviewState.github = githubResult.value;
  if (voicesResult.status === "fulfilled") overviewState.voices = voicesResult.value;
  if (papersResult.status === "fulfilled") overviewState.papers = papersResult.value;
  if (statusResult.status === "fulfilled") overviewState.status = statusResult.value;
  renderOverviewCards();
  renderSourceStatus();
  renderLatestItems();
  const terms = buildKeywordCloud(overviewItems(), overviewState.papers);
  renderWordCloud(terms);
  renderWordCloudMeta(terms);
}

refreshOverview();
window.setInterval(refreshOverview, OVERVIEW_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - overviewState.lastRefresh > 60 * 1000) refreshOverview();
});
window.addEventListener("online", refreshOverview);
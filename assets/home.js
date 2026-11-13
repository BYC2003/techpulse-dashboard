const OVERVIEW_REFRESH_MS = 5 * 60 * 1000;
const overviewState = {
  news: null,
  github: null,
  voices: null,
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
  wordCloud: document.getElementById("wordCloud"),
  wordCloudMeta: document.getElementById("wordCloudMeta"),
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

function buildKeywordCloud(items) {
  const byKeyword = new Map(KEYWORD_DEFS.map((definition) => [definition.label, { ...definition, score: 0, mentions: 0 }]));
  const now = Date.now();
  items.forEach((item) => {
    const haystack = itemOverviewText(item);
    const published = new Date(item.published_at || item.first_seen_at || 0).getTime();
    const ageHours = published ? Math.max(0, (now - published) / 3600000) : 24;
    const recency = ageHours <= 6 ? 1.5 : ageHours <= 12 ? 1.3 : ageHours <= 24 ? 1.1 : 0.8;
    const aiScore = Math.max(0, Math.min(1, Number(item.ai_score) || 0.5));
    const tierRank = Math.max(0, Math.min(3, Number(item.source_tier_rank) || 3));
    const weight = 1 + aiScore * 1.4 + (3 - tierRank) * 0.25 + recency;
    KEYWORD_DEFS.forEach((definition) => {
      if (!definition.aliases.some((pattern) => pattern.test(haystack))) return;
      const row = byKeyword.get(definition.label);
      row.score += weight;
      row.mentions += 1;
    });
  });
  return Array.from(byKeyword.values())
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.mentions - a.mentions)
    .slice(0, 26);
}

function renderWordCloud(terms) {
  if (!overviewEls.wordCloud) return;
  overviewEls.wordCloud.replaceChildren();
  if (!terms.length) {
    const empty = document.createElement("p");
    empty.className = "overview-loading";
    empty.textContent = "暂无可计算的热词信号。";
    overviewEls.wordCloud.appendChild(empty);
    return;
  }
  const maxScore = terms[0].score || 1;
  const minScore = terms[terms.length - 1].score || 0;
  terms.forEach((term, index) => {
    const ratio = maxScore === minScore ? 1 : (term.score - minScore) / (maxScore - minScore);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `cloud-term cloud-tone-${index % 5}`;
    button.style.setProperty("--cloud-size", `${14 + Math.round(ratio * 26)}px`);
    button.style.setProperty("--cloud-rotate", `${((index * 7) % 9) - 4}deg`);
    button.title = `${term.mentions} 条信息命中`;
    button.textContent = term.label;
    button.addEventListener("click", () => {
      window.location.href = `dashboard.html?view=news&q=${encodeURIComponent(term.query || term.label)}`;
    });
    overviewEls.wordCloud.appendChild(button);
  });
}

function renderOverviewCards() {
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
  overviewEls.wordCloudMeta.textContent = `${items.length} 条信息 · ${terms.length} 个热词 · ${formatOverviewTime(overviewState.news?.generated_at)} 更新`;
}

async function refreshOverview() {
  overviewState.lastRefresh = Date.now();
  const [newsResult, githubResult, voicesResult, statusResult] = await Promise.allSettled([
    overviewFetch("data/latest-24h.json"),
    overviewFetch("data/github-rankings.json"),
    overviewFetch("data/authority-voices.json"),
    overviewFetch("data/source-status.json"),
  ]);
  if (newsResult.status === "fulfilled") overviewState.news = newsResult.value;
  if (githubResult.status === "fulfilled") overviewState.github = githubResult.value;
  if (voicesResult.status === "fulfilled") overviewState.voices = voicesResult.value;
  if (statusResult.status === "fulfilled") overviewState.status = statusResult.value;
  renderOverviewCards();
  renderSourceStatus();
  renderLatestItems();
  const terms = buildKeywordCloud(overviewItems());
  renderWordCloud(terms);
  renderWordCloudMeta(terms);
}

refreshOverview();
window.setInterval(refreshOverview, OVERVIEW_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - overviewState.lastRefresh > 60 * 1000) refreshOverview();
});
window.addEventListener("online", refreshOverview);
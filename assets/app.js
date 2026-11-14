// i18n：assets/i18n.js 先于本文件加载，按 <html lang> 选 zh / en 词典；
// 下面各处匹配逻辑用的中文关键词（不安全词、语气嗅探、标题修复、栏目正则、来源识别）不是 UI 文案，不翻译。
const i18n = window.AINewsRadarI18n;
const { t, isEN: IS_EN, locale: LOCALE } = i18n;

const DASHBOARD_VIEW = (() => {
  const view = new URLSearchParams(window.location.search).get("view") || "news";
  return ["news", "douyin", "github", "papers", "voices"].includes(view) ? view : "news";
})();
const INITIAL_QUERY = new URLSearchParams(window.location.search).get("q") || "";

const state = {
  itemsAi: [],
  itemsAll: [],
  itemsAllRaw: [],
  creatorItemsAi: [],
  creatorItemsAll: [],
  creatorWindowDays: 7,
  statsAi: [],
  totalAi: 0,
  totalRaw: 0,
  totalAllMode: 0,
  allDedup: true,
  allDataLoaded: false,
  allDataUrl: "data/latest-24h-all.json",
  allDataPromise: null,
  siteFilter: "",
  authorFilter: "",
  query: INITIAL_QUERY,
  // 单层信息架构：category（内容 tab） x mode（精选/全量全局开关）两个维度。
  // mode=selected 主列表读 mergedStories()（AI 相关合并事件池，纯时间倒序）；
  // mode=all 主列表读 itemsAllRaw/itemsAll（全量原始条目池）。
  mode: "selected",
  waytoagiMode: "today",
  waytoagiData: null,
  sourceStatus: null,
  generatedAt: null,
  dailyBrief: null,
  top3Personas: null,
  storiesMerged: null,
  storiesDataUrl: "data/stories-merged.json",
  // 内容 tab：单值，默认 "all"（全部，无过滤）
  activeSection: "all",
  officialOnly: false,
  mainListVisibleCount: 0,
  xAuthorsExpanded: false,
  douyinPickRound: 0,
  douyinHot: null,
  githubRankings: null,
  githubRankingPeriod: "weekly",
  authorityVoices: null,
  authorityFilter: "all",
  authorityVisibleCount: 8,
  papers: null,
  paperMode: "authoritative",
  paperCategory: "all",
  papersVisibleCount: 12,
};

// DATA_BASE_URL 数据同源开关：优先级 ?data= 查询参数 > localStorage("dataBaseUrl") > "" (相对路径，原行为)
// ?data= 命中时持久化到 localStorage，方便刷新/后续访问保持同一数据源。
function resolveDataBaseUrl() {
  let fromQuery = "";
  try {
    fromQuery = new URLSearchParams(window.location.search).get("data") || "";
  } catch {
    fromQuery = "";
  }
  if (fromQuery) {
    const normalized = fromQuery.trim().replace(/\/+$/, "");
    try { localStorage.setItem("dataBaseUrl", normalized); } catch {}
    return normalized;
  }
  try {
    const stored = localStorage.getItem("dataBaseUrl") || "";
    return stored.trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

state.dataBaseUrl = resolveDataBaseUrl();

// 所有 data/*.json 抓取都必须经过这个 helper，才能让 ?data= / localStorage 覆盖生效。
// 传入的 path 可能是 "data/xxx.json"（本地默认）或后端下发的同款相对路径；
// 一旦切换到远端 base，只拼文件名，避免拼出 base/data/xxx.json 这种双重 data/ 路径。
// 站点根（<html data-root>）为绝对路径（如 /en/）时，本地数据取站点根下的 /data/…；
// zh 页没有 data-root，保持原来的相对路径。?data= / localStorage 覆盖永远优先。
const DATA_ROOT_ABSOLUTE = String(document.documentElement?.dataset?.root || "").startsWith("/");

function dataUrl(path) {
  const base = state.dataBaseUrl;
  if (!base) {
    const raw = String(path || "");
    if (!DATA_ROOT_ABSOLUTE || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return path;
    return `/${raw}`;
  }
  const file = String(path || "").split("/").pop();
  return `${base}/${file}`;
}

const siteSelectEl = document.getElementById("siteSelect");
const newsListEl = document.getElementById("newsList");
const updatedAtEl = document.getElementById("updatedAt");
const sourceStatusPillEl = document.getElementById("sourceStatusPill");
const searchInputEl = document.getElementById("searchInput");
const resultCountEl = document.getElementById("resultCount");
const listTitleEl = document.getElementById("listTitle");
const itemTpl = document.getElementById("itemTpl");
const modeSelectedBtnEl = document.getElementById("modeSelectedBtn");
const modeAllBtnEl = document.getElementById("modeAllBtn");
const officialOnlyBtnEl = document.getElementById("officialOnlyBtn");
const hotBoardWrapEl = document.getElementById("hotBoardWrap");
const hotBoardListEl = document.getElementById("hotBoardList");
const hotBoardMetaEl = document.getElementById("hotBoardMeta");
const douyinPicksWrapEl = document.getElementById("douyinPicksWrap");
const douyinPicksListEl = document.getElementById("douyinPicksList");
const douyinPicksMetaEl = document.getElementById("douyinPicksMeta");
const douyinPicksRefreshBtnEl = document.getElementById("douyinPicksRefreshBtn");
const douyinVerificationSummaryEl = document.getElementById("douyinVerificationSummary");
const douyinHotBoardEl = document.getElementById("douyinHotBoard");
const githubRankingsWrapEl = document.getElementById("githubRankingsWrap");
const githubRankingListEl = document.getElementById("githubRankingList");
const githubRankingMetaEl = document.getElementById("githubRankingMeta");
const githubWeeklyBtnEl = document.getElementById("githubWeeklyBtn");
const githubMonthlyBtnEl = document.getElementById("githubMonthlyBtn");
const authorityVoicesWrapEl = document.getElementById("authorityVoicesWrap");
const authorityVoicesListEl = document.getElementById("authorityVoicesList");
const authorityVoicesMetaEl = document.getElementById("authorityVoicesMeta");
const papersWrapEl = document.getElementById("papersWrap");
const papersListEl = document.getElementById("papersList");
const papersMetaEl = document.getElementById("papersMeta");
const papersAuthoritativeBtnEl = document.getElementById("papersAuthoritativeBtn");
const papersHotBtnEl = document.getElementById("papersHotBtn");
const paperCategoryFiltersEl = document.getElementById("paperCategoryFilters");

document.body.dataset.dashboardView = DASHBOARD_VIEW;
document.querySelectorAll("[data-view-link]").forEach((link) => {
  const active = link.dataset.viewLink === DASHBOARD_VIEW;
  link.classList.toggle("active", active);
  if (active) link.setAttribute("aria-current", "page");
});
const DASHBOARD_TITLES = { news: "今日情报", douyin: "AI 视频选题", github: "GitHub 周/月热榜", papers: "AI 权威论文", voices: "AI 权威观点与会议" };
document.title = `TechPulse｜${DASHBOARD_TITLES[DASHBOARD_VIEW]}`;
if (searchInputEl && INITIAL_QUERY) searchInputEl.value = INITIAL_QUERY;
const top3BoardWrapEl = document.getElementById("top3BoardWrap");
const top3BoardListEl = document.getElementById("top3BoardList");
const top3BoardMetaEl = document.getElementById("top3BoardMeta");
const newsListWrapEl = document.getElementById("newsListWrap");
const modeHintEl = document.getElementById("modeHint");
const allDedupeWrapEl = document.getElementById("allDedupeWrap");
const allDedupeToggleEl = document.getElementById("allDedupeToggle");
const allDedupeLabelEl = document.getElementById("allDedupeLabel");
const sourceHealthEl = document.getElementById("sourceHealth");
const sourceHealthDetailsEl = document.getElementById("sourceHealthDetails");
const sourceStatusTableEl = document.getElementById("sourceStatusTable");
const clearFiltersBtnEl = document.getElementById("clearFiltersBtn");
const dataSourceIndicatorEl = document.getElementById("dataSourceIndicator");
const dataSourceIndicatorTextEl = document.getElementById("dataSourceIndicatorText");
const dataSourceResetBtnEl = document.getElementById("dataSourceResetBtn");

const waytoagiWrapEl = document.querySelector(".waytoagi-wrap");
const waytoagiUpdatedAtEl = document.getElementById("waytoagiUpdatedAt");
const waytoagiMetaEl = document.getElementById("waytoagiMeta");
const waytoagiListEl = document.getElementById("waytoagiList");
const waytoagiTodayBtnEl = document.getElementById("waytoagiTodayBtn");
const waytoagi7dBtnEl = document.getElementById("waytoagi7dBtn");
const sectionTabsEl = document.getElementById("sectionTabs");

const SOURCE_KINDS = {
  official_ai: { label: t("sourceKind.official"), tone: "official" },
  curated_media: { label: t("sourceKind.curatedMedia"), tone: "aihub" },
  aihot: { label: "AI HOT", tone: "hot" },
  aibreakfast: { label: t("sourceKind.newsletter"), tone: "newsletter" },
  followbuilders: { label: "Builders/X", tone: "builders" },
  github_trending: { label: "GitHub Trending", tone: "builders" },
  producthunt: { label: "Product Hunt", tone: "aihub" },
  xapi: { label: "X API", tone: "builders" },
  socialdata_x: { label: t("sourceKind.xSearch"), tone: "builders" },
  tikhub_douyin: { label: t("sourceKind.douyin"), tone: "creator" },
  tikhub_xiaohongshu: { label: t("sourceKind.xiaohongshu"), tone: "creator" },
  techurls: { label: t("sourceKind.aggregate"), tone: "aggregate" },
  buzzing: { label: t("sourceKind.aggregate"), tone: "aggregate" },
  iris: { label: t("sourceKind.aggregate"), tone: "aggregate" },
  bestblogs: { label: t("sourceKind.blogs"), tone: "blogs" },
  zeli: { label: t("sourceKind.aggregate"), tone: "aggregate" },
  hackernews: { label: "HN", tone: "aggregate" },
  aihubtoday: { label: t("sourceKind.aiSites"), tone: "aihub" },
  aibase: { label: t("sourceKind.aiSites"), tone: "aihub" },
  waytoagi: { label: t("sourceKind.community"), tone: "builders" },
  newsnow: { label: t("sourceKind.aggregate"), tone: "aggregate" },
  opmlrss: { label: "OPML", tone: "newsletter" },
};

// aihotSubSource() 结果 → 卡片小标签文案/色调，色调复用既有 .category.kind-* 规则，不新增样式
const AIHOT_SUB_LABELS = { x: "X", wechat: t("aihotSub.wechat"), hn: "HN", rss: "RSS" };
const AIHOT_SUB_TONES = { x: "builders", wechat: "creator", hn: "aggregate", rss: "newsletter" };

// 单层内容 tab：全部（默认，无过滤）+ 5 个主题栏目 + 社区 + 自媒体，互斥单值。
// 英文版不展示自媒体栏目（抖音、小红书、公众号创作者内容不翻译）。
const SECTION_DEFS = [
  { id: "all", label: t("section.all.label"), short: t("section.all.label"), description: t("section.all.description") },
  { id: "models", label: t("section.models.label"), short: t("section.models.label"), description: t("section.models.description") },
  { id: "products", label: t("section.products.label"), short: t("section.products.label"), description: t("section.products.description") },
  { id: "devtools", label: t("section.devtools.label"), short: t("section.devtools.label"), description: t("section.devtools.description") },
  { id: "industry", label: t("section.industry.label"), short: t("section.industry.label"), description: t("section.industry.description") },
  { id: "research", label: t("section.research.label"), short: t("section.research.label"), description: t("section.research.description") },
];

const SECTION_BY_ID = Object.fromEntries(SECTION_DEFS.map((section) => [section.id, section]));

function fmtNumber(n) {
  return i18n.fmtNumber(n);
}

const UNSAFE_HARD_PATTERNS = [
  /\bcreampie\b/i,
  /\bblowjob\b/i,
  /\bsuck (?:your|my) (?:dick|cock)\b/i,
  /中出|婊子|吸你的鸡鸡|操虚拟女友/i,
];

const UNSAFE_PROMO_PATTERNS = [
  /\b(?:nsfw|nudes?|porn(?:ography)?)\b/i,
  /\buncensored pictures?\b/i,
  /\bvirtual girlfriends?\b/i,
  /\bknock her up\b/i,
  /未经审查的图片|虚拟女友|色情内容|成人内容/i,
];

function contentSafetyText(record) {
  return [
    record?.title,
    record?.title_zh,
    record?.title_en,
    record?.title_original,
    record?.source,
    record?.source_name,
  ].filter(Boolean).join(" ");
}

function isUnsafeContent(record) {
  const text = contentSafetyText(record);
  if (!text) return false;
  if (UNSAFE_HARD_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return UNSAFE_PROMO_PATTERNS.filter((pattern) => pattern.test(text)).length >= 2;
}

// 英文版整体隐藏自媒体来源（itemSourceGroup 为 creator）：条目、故事、来源状态行都不展示。
function isLocaleHiddenItem(item) {
  return IS_EN && itemSourceGroup(item) === "creator";
}

function safeItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => !isUnsafeContent(item) && !isLocaleHiddenItem(item));
}

function isLocaleHiddenStory(story) {
  return IS_EN && itemSourceGroup(storyRepresentativeItem(story) || story) === "creator";
}

function isUnsafeStory(story) {
  const refs = [
    story,
    story?.primary_item,
    ...(Array.isArray(story?.sources) ? story.sources : []),
    ...(Array.isArray(story?.items) ? story.items : []),
  ].filter(Boolean);
  return refs.some((ref) => isUnsafeContent(ref));
}

// Today's projects are optional and load independently from the news timeline.
const todayProjectsListEl = document.getElementById("todayProjectsList");
const todayProjectsMetaEl = document.getElementById("todayProjectsMeta");

function todayProjectsDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function todayProjectUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

// 英文版只用英文推荐语（recommend_reason_en / en.reason），没有就不展示该项目，不回退中文。
function todayProjectReason(item) {
  return IS_EN ? (item.recommend_reason_en || item.en?.reason) : item.recommend_reason_zh;
}

function renderTodayProjects(payload, failed = false) {
  if (!todayProjectsListEl || !todayProjectsMetaEl) return;
  todayProjectsListEl.replaceChildren();
  todayProjectsMetaEl.textContent = "";
  const current = payload?.date === todayProjectsDate();
  const items = current && Array.isArray(payload?.items) ? payload.items : [];
  // Project names and recommendations need the same last-mile safety gate as news.
  const visible = safeItems(items.filter((item) => item && typeof item === "object").map((item) => ({
    ...item, title: item.project_name, title_zh: todayProjectReason(item), title_original: item.summary,
  }))).filter((item) => typeof item.project_name === "string" && item.project_name.trim()
    && typeof todayProjectReason(item) === "string" && todayProjectReason(item).trim()
    && todayProjectUrl(item.url)).slice(0, 4);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "today-projects-empty";
    const sourcesFailed = Array.isArray(payload?.sources) && payload.sources.length > 0
      && payload.sources.every((source) => source?.ok === false);
    empty.textContent = failed || sourcesFailed ? t("today.failed")
      : payload && !current ? t("today.updating") : t("today.none");
    todayProjectsListEl.appendChild(empty);
    return;
  }
  todayProjectsMetaEl.textContent = t("today.count", { n: visible.length });
  visible.forEach((item) => {
    const card = document.createElement("article");
    card.className = "today-project-card";
    const heading = document.createElement("div");
    heading.className = "today-project-heading";
    const name = document.createElement("h3");
    name.textContent = item.project_name.trim();
    const source = document.createElement("span");
    source.className = "today-project-source";
    source.textContent = (item.site_name || t("today.sourceFallback"))
      + (item.site_id === "producthunt" && item.recency_basis === "updated_at" ? ` · ${t("today.recentUpdate")}` : "");
    heading.append(name, source);
    const recommendation = document.createElement("p");
    recommendation.className = "today-project-reason";
    recommendation.textContent = todayProjectReason(item).trim();
    const link = document.createElement("a");
    link.className = "today-project-link";
    link.href = todayProjectUrl(item.url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("today.open");
    link.setAttribute("aria-label", t("today.openAria", { name: item.project_name.trim() }));
    card.append(heading, recommendation, link);
    todayProjectsListEl.appendChild(card);
  });
}

async function initTodayProjects() {
  if (!todayProjectsListEl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${dataUrl("data/today-projects.json")}?t=${Date.now()}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(t("error.load", { file: "today-projects.json", status: res.status }));
    const payload = await res.json();
    if (!payload || typeof payload.date !== "string" || !Array.isArray(payload.items)) {
      throw new Error(t("error.badFormat"));
    }
    renderTodayProjects(payload);
  } catch {
    renderTodayProjects(null, true);
  } finally {
    clearTimeout(timeout);
  }
}
// End of today's projects module.

function fmtTime(iso) {
  if (!iso) return t("common.unknownTime");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("common.unknownTime");
  return new Intl.DateTimeFormat(LOCALE, IS_EN
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    : {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
}

function fmtDate(iso) {
  if (!iso) return t("common.unknownDate");
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE, IS_EN
    ? { month: "short", day: "numeric" }
    : {
      month: "2-digit",
      day: "2-digit",
    }).format(d);
}

function fmtHHMM(ms) {
  if (!ms) return "--:--";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat(LOCALE, IS_EN
    ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
    : { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function fmtRelativeTime(ms) {
  return i18n.fmtRelative(ms);
}

// 条目“更新于 …”前缀与相对时间合并成一个可翻译串
function fmtUpdatedRelative(ms, withPrefix) {
  const rel = fmtRelativeTime(ms);
  return withPrefix ? t("rel.updatedAt", { time: rel }) : rel;
}

function failedSourceCount(status = state.sourceStatus) {
  const failedSites = Array.isArray(status?.failed_sites) ? status.failed_sites.length : 0;
  const rss = status?.rss_opml || {};
  const failedFeeds = Array.isArray(rss.failed_feeds) ? rss.failed_feeds.length : 0;
  return failedSites + failedFeeds;
}

function renderSourceStatusPill(errorMessage = "") {
  if (!sourceStatusPillEl) return;
  const status = state.sourceStatus;
  sourceStatusPillEl.className = "source-status-pill";
  if (!status) {
    sourceStatusPillEl.textContent = errorMessage || t("status.loading");
    if (errorMessage) sourceStatusPillEl.classList.add("bad");
    return;
  }
  const totalSites = Array.isArray(status.sites) ? status.sites.length : 0;
  const okSites = Number(status.successful_sites || 0);
  const failed = failedSourceCount(status);
  sourceStatusPillEl.textContent = failed
    ? t("status.okFailed", { ok: okSites, total: totalSites, failed })
    : t("status.ok", { ok: okSites, total: totalSites });
  if (failed) sourceStatusPillEl.classList.add("warn");
}

// 模式文案：精选（AI 相关合并事件池，纯时间序）/ 全量（原始条目池）
function modeLabelText() {
  return state.mode === "all" ? t("mode.all") : t("mode.selected");
}

function sourceKind(siteId) {
  return SOURCE_KINDS[siteId] || { label: t("common.source"), tone: "default" };
}

function sourceSignalTone(signal) {
  const text = String(signal || "").toLowerCase();
  if (text.includes("官方") || text.includes("official")) return "official";
  if (text.includes("ai hot") || text.includes("精选")) return "hot";
  if (text.includes("自媒体") || text.includes("tikhub") || text.includes("douyin") || text.includes("xiaohongshu") || text.includes("抖音") || text.includes("小红书")) return "creator";
  if (text.includes("builders") || text.includes("github") || text.includes("x")) return "builders";
  if (text.includes("aihub") || text.includes("aibase") || text.includes("媒体")) return "aihub";
  if (text.includes("hn") || text.includes("hacker") || text.includes("聚合")) return "aggregate";
  if (text.includes("opml") || text.includes("日报")) return "newsletter";
  return "default";
}

function sourceChip(label, tone = "default", className = "source-chip") {
  const chip = document.createElement("span");
  chip.className = `${className} kind-${tone}`.trim();
  const dot = document.createElement("span");
  dot.className = "source-dot";
  dot.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "source-chip-label";
  text.textContent = label || t("common.source");
  chip.append(dot, text);
  return chip;
}

function appendSourceChip(parent, label, tone = "default", className = "source-chip") {
  parent.appendChild(sourceChip(label, tone, className));
}

function siteRows() {
  return Array.isArray(state.sourceStatus?.sites) ? state.sourceStatus.sites : [];
}

function siteRow(siteId) {
  return siteRows().find((site) => site.site_id === siteId) || null;
}

function aiSiteStat(siteId) {
  const stats = safeAiSiteStats();
  return stats.find((site) => site.site_id === siteId) || null;
}

function safeAiSiteStats() {
  const visibleStats = computeSiteStats(safeItems(state.itemsAi));
  const visibleById = new Map(visibleStats.map((site) => [site.site_id, site]));
  const baseStats = Array.isArray(state.statsAi) && state.statsAi.length ? state.statsAi : visibleStats;
  return baseStats.map((site) => ({
    ...site,
    count: Number(visibleById.get(site.site_id)?.count || 0),
  }));
}

function siteAiPoolCount(siteId) {
  return Number(aiSiteStat(siteId)?.count || 0);
}

function activeAdjustmentCount() {
  return [
    Boolean(state.query.trim()),
    state.activeSection !== "all",
    Boolean(state.siteFilter || state.authorFilter),
    state.mode !== "selected",
    state.mode === "all" && !state.allDedup,
    state.officialOnly,
  ].filter(Boolean).length;
}

function sourceTierInfo(item) {
  if (item?.source_tier_label) {
    return { tier: item.source_tier || "other", label: item.source_tier_label };
  }
  const siteId = String(item?.site_id || "").toLowerCase();
  const source = `${item?.source || ""} ${item?.site_name || ""}`.toLowerCase();
  if (siteId === "official_ai") return { tier: "official", label: "一手官方" };
  if (siteId === "github_trending" || source.includes("github trending")) return { tier: "community", label: "开源发现" };
  if (siteId === "producthunt" || siteId === "hackernews" || source.includes("product hunt") || source.includes("hacker news") || source.includes("show hn")) return { tier: "community", label: "社区发现" };
  if (siteId === "arxiv" || source.includes("arxiv") || source.includes("bair") || source.includes("berkeley ai research")) return { tier: "research", label: "研究/预印本" };
  if (["aihot", "aibase", "bestblogs", "aihubtoday"].includes(siteId)) return { tier: "ai_vertical", label: "AI垂直源" };
  if (siteId === "curated_media") return { tier: "ai_media", label: "精选AI媒体" };
  if (["newsnow", "techurls", "buzzing", "zeli", "iris"].includes(siteId)) return { tier: "discussion", label: "热议参考" };
  if (["socialdata_x", "followbuilders", "xapi"].includes(siteId)) return { tier: "builders", label: "Builders/X" };
  if (siteId === "waytoagi") return { tier: "community", label: "社区更新" };
  if (siteId.startsWith("tikhub_")) return { tier: "self_media", label: "自媒体源" };
  if (source.includes("github blog") || source.includes("github changelog") || source.includes("openai") || source.includes("deepmind") || source.includes("google ai") || source.includes("hugging face") || source.includes("microsoft research") || source.includes("mit news ai") || source.includes("apple newsroom") || source.includes("nvidia newsroom") || source.includes("google blog")) return { tier: "official", label: "一手官方" };
  if (source.includes("techcrunch") || source.includes("the verge") || source.includes("ars technica") || source.includes("technology review") || source.includes("wired") || source.includes("engadget") || source.includes("solidot") || source.includes("it之家") || source.includes("爱范儿") || source.includes("infoq") || source.includes("少数派") || source.includes("量子位")) return { tier: "ai_media", label: "媒体核验" };
  if (siteId === "opmlrss") return { tier: "user_opml", label: "定制 RSS" };
  return { tier: "other", label: "其他来源" };
}

function isFirstPartyItem(item) {
  return ["official", "research"].includes(sourceTierInfo(item).tier);
}

function storyIsFirstParty(story) {
  const refs = [story?.primary_item, ...(Array.isArray(story?.sources) ? story.sources : []), story];
  return refs.filter(Boolean).some(isFirstPartyItem);
}


function renderClearFiltersButton() {
  if (!clearFiltersBtnEl) return;
  const count = activeAdjustmentCount();
  clearFiltersBtnEl.hidden = count === 0;
  clearFiltersBtnEl.textContent = count ? t("filters.clearN", { n: count }) : t("filters.clear");
}

// 数据同源指示：非空 dataBaseUrl 生效时提示当前数据源 + 提供一键恢复本地相对路径的入口。
function renderDataSourceIndicator() {
  if (!dataSourceIndicatorEl) return;
  const base = state.dataBaseUrl;
  dataSourceIndicatorEl.hidden = !base;
  if (base && dataSourceIndicatorTextEl) {
    dataSourceIndicatorTextEl.textContent = t("dataSource.label", { base });
  }
}

function clearAllFilters() {
  state.query = "";
  state.activeSection = "all";
  state.siteFilter = "";
  state.authorFilter = "";
  state.mode = "selected";
  state.allDedup = true;
  state.officialOnly = false;
  state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
  state.waytoagiMode = "today";
  state.xAuthorsExpanded = false;
  if (searchInputEl) searchInputEl.value = "";
  if (siteSelectEl) siteSelectEl.value = "";
  rerenderCurrentView();
}

function computeSiteStats(items) {
  const m = new Map();
  items.forEach((item) => {
    if (!m.has(item.site_id)) {
      m.set(item.site_id, { site_id: item.site_id, site_name: item.site_name, count: 0, raw_count: 0 });
    }
    const row = m.get(item.site_id);
    row.count += 1;
    row.raw_count += 1;
  });
  return Array.from(m.values()).sort((a, b) => b.count - a.count || a.site_name.localeCompare(b.site_name, LOCALE));
}

// 具体来源下拉/站点 pill 的统计口径跟随当前模式：精选=AI 相关池，全量=原始条目池。
function currentSiteStats() {
  if (state.mode === "all") return computeSiteStats(effectiveAllItems());
  return safeAiSiteStats().filter((site) => site.count > 0);
}

function creatorHotScore(item) {
  return normalizedPercent(item?.creator_hot_score);
}

function highPriorityScore(item) {
  if (itemSourceGroup(item) === "creator" && creatorHotScore(item)) return creatorHotScore(item);
  return scorePercent(item);
}

function isHighPriorityItem(item) {
  return highPriorityScore(item) >= 75 || itemPriorityScore(item) >= 82 || item.site_id === "official_ai" || item.site_id === "aihot";
}

// tab 计数跟随当前模式的可见集合（忽略当前已选栏目本身，展示"如果点这个 tab 会有多少条"）
function sectionTabCount(sectionId) {
  if (state.mode === "all") {
    let pool = mainListRawItemsBase();
    if (state.officialOnly) pool = pool.filter(isFirstPartyItem);
    return sectionId === "all" ? pool.length : pool.filter((item) => itemSection(item) === sectionId).length;
  }
  let pool = mainListStoriesBase();
  if (state.officialOnly) pool = pool.filter(storyIsFirstParty);
  return sectionId === "all" ? pool.length : pool.filter((story) => storySectionOf(story) === sectionId).length;
}

function renderSectionTabs() {
  if (!sectionTabsEl) return;
  sectionTabsEl.innerHTML = "";
  SECTION_DEFS.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `section-tab ${state.activeSection === section.id ? "active" : ""}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", state.activeSection === section.id ? "true" : "false");
    btn.dataset.section = section.id;
    btn.innerHTML = `<span>${section.label}</span><strong>${fmtNumber(sectionTabCount(section.id))}</strong>`;
    btn.addEventListener("click", () => {
      if (state.activeSection === section.id) return;
      state.activeSection = section.id;
      state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
      renderSectionTabs();
      renderModeSwitch();
      renderSiteFilters();
      renderHotBoard();
      if (state.waytoagiData) renderWaytoagi(state.waytoagiData);
      renderMainList();
    });
    sectionTabsEl.appendChild(btn);
  });
}


function siteRatioText(siteStats) {
  const count = Number(siteStats.count || 0);
  const raw = Number(siteStats.raw_count ?? siteStats.count ?? 0);
  if (!raw) {
    const scanned = Number(siteRow(siteStats.site_id)?.item_count || 0);
    if (!count && scanned) return t("site.scanned", { n: scanned });
    if (!count) return t("site.scannedZero");
    return t("count.items", { n: count });
  }
  if (raw === count) return t("count.items", { n: count });
  return t("site.ratio", { count, raw, pct: Math.round((count / raw) * 100) });
}

function renderSiteFilters() {
  const stats = currentSiteStats();

  siteSelectEl.innerHTML = `<option value="">${t("common.allSites")}</option>`;
  stats.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.site_id;
    opt.textContent = `${s.site_name} (${siteRatioText(s)})`;
    siteSelectEl.appendChild(opt);
  });
  siteSelectEl.value = state.siteFilter;
}

// 全局 精选/全量 开关：热点排行区只在精选模式显示；主列表两种模式共用同一套时间序+日期分组模板。
function renderModeSwitch() {
  if (modeSelectedBtnEl) {
    modeSelectedBtnEl.classList.toggle("active", state.mode === "selected");
    modeSelectedBtnEl.setAttribute("aria-pressed", state.mode === "selected" ? "true" : "false");
  }
  if (modeAllBtnEl) {
    modeAllBtnEl.classList.toggle("active", state.mode === "all");
    modeAllBtnEl.setAttribute("aria-pressed", state.mode === "all" ? "true" : "false");
  }
  if (officialOnlyBtnEl) {
    officialOnlyBtnEl.classList.toggle("active", state.officialOnly);
    officialOnlyBtnEl.setAttribute("aria-pressed", state.officialOnly ? "true" : "false");
  }
  if (hotBoardWrapEl) hotBoardWrapEl.hidden = state.mode !== "selected";
  if (allDedupeWrapEl) allDedupeWrapEl.classList.toggle("show", state.mode === "all");
  if (allDedupeToggleEl) allDedupeToggleEl.checked = state.allDedup;
  if (allDedupeLabelEl) allDedupeLabelEl.textContent = state.allDedup ? t("mode.dedupOn") : t("mode.dedupOff");
  const count = mainListEntries().length;
  if (modeHintEl) {
    modeHintEl.textContent = t("mode.hint", { mode: modeLabelText(), n: count });
    modeHintEl.setAttribute("aria-label", t("mode.hintAria", { mode: modeLabelText(), n: count }));
  }
  if (listTitleEl) listTitleEl.textContent = listTitleText();
  renderClearFiltersButton();
  renderDouyinPicks();
  renderGithubRankings();
  renderAuthorityVoices();
  renderPapers();
}

function listTitleText() {
  const section = state.activeSection !== "all" ? SECTION_BY_ID[state.activeSection] : null;
  const label = modeLabelText();
  return section ? `${section.label} · ${label}` : label;
}

// 全量模式条目池：去重开=itemsAll（已去重），去重关=itemsAllRaw（原始单条池）
function effectiveAllItems() {
  return safeItems(state.allDedup ? state.itemsAll : state.itemsAllRaw);
}

function repairDisplayedTitle(original, translated) {
  let result = String(translated || "").trim();
  const source = String(original || "");
  if (/\bCodex\b/i.test(source)) result = result.replaceAll("法典", "Codex");
  if (/\bBug Bounty\b/i.test(source)) result = result.replaceAll("错误赏金", "漏洞悬赏").replaceAll("Bug 赏金", "漏洞悬赏");
  if (/\bBio Bug Bounty\b/i.test(source)) result = result.replaceAll("生物漏洞悬赏", "生物安全漏洞悬赏");
  if (/\brepositor(?:y|ies)\b/i.test(source)) result = result.replaceAll("存储库", "代码仓库");
  if (/\bdesktop app\b/i.test(source)) result = result.replaceAll("桌面应用程序", "桌面应用");
  return result;
}

function isMostlyEnglishTitle(text) {
  const value = String(text || "").trim();
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const cjk = (value.match(/[㐀-鿿]/g) || []).length;
  return latin >= 4 && latin > cjk * 2;
}

// 英文版标题：en.title → title_en（多数英文时）→ title_original → title（双语标题取英文段）。
// record 是条目或故事的 primary_item；fallbackTitle 用于 primary_item 没有 title 时回退故事标题。
function englishTitleText(record, fallbackTitle = "") {
  const translated = String(record?.en?.title || "").trim();
  if (translated) return translated;
  const titleEn = String(record?.title_en || "").trim();
  if (isMostlyEnglishTitle(titleEn)) return titleEn;
  const original = String(record?.title_original || "").trim();
  if (original) return original;
  const title = String(record?.title || fallbackTitle || "").trim();
  if (title.includes(" / ")) {
    const english = title.split(" / ").map((part) => part.trim()).find((part) => isMostlyEnglishTitle(part));
    if (english) return english;
  }
  return title || t("common.untitled");
}

function itemTitleText(item) {
  return IS_EN ? englishTitleText(item) : itemTitleTextZh(item);
}

function itemTitleTextZh(item) {
  const zhTitle = item.title_enhanced_zh || item.title_zh || "";
  const preferred = (zhTitle || item.title || item.title_en || t("common.untitled")).trim();
  const titleParts = preferred.includes(" / ") ? preferred.split(" / ") : [];
  const display = !zhTitle && titleParts.length ? titleParts[0].trim() : preferred;
  const original = item.title_en || item.title_original || (titleParts.length > 1 ? titleParts.slice(1).join(" / ") : "");
  return repairDisplayedTitle(original, display);
}

function itemOriginalTitleText(item) {
  // 英文版标题本身已是英文，不再出副标题
  if (IS_EN) return "";
  const explicit = String(item?.title_en || "").trim();
  if (isMostlyEnglishTitle(explicit) && explicit !== itemTitleTextZh(item)) return explicit;
  const bilingual = String(item?.title || item?.title_bilingual || "").trim();
  if (bilingual.includes(" / ")) {
    const [, ...rest] = bilingual.split(" / ");
    const original = rest.join(" / ").trim();
    if (isMostlyEnglishTitle(original) && original !== itemTitleTextZh(item)) return original;
  }
  const original = String(item?.title_original || "").trim();
  if (isMostlyEnglishTitle(original) && original !== itemTitleTextZh(item)) return original;
  return "";
}

function itemSummaryText(item, maxLength = 180) {
  const raw = IS_EN ? (item?.en?.summary || item?.summary) : item?.summary;
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function scorePercent(item) {
  const score = Number(item.ai_score ?? item.score ?? 0);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(score <= 1 ? score * 100 : score);
}

function normalizedPercent(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(score <= 1 ? score * 100 : score)));
}

function scoreTone(score) {
  if (score >= 90) return "hot";
  if (score >= 75) return "strong";
  return "watch";
}

function itemLabelTone(item) {
  const label = item.ai_label || "";
  if (item.site_id === "official_ai") return "official";
  if (item.site_id === "aihot" || label === "curated_hotlist") return "hot";
  if (itemSourceGroup(item) === "creator") return "creator";
  if (label === "model_release") return "models";
  if (label === "developer_tool" || label === "developer_tooling" || label === "infrastructure" || label === "infra_compute") return "devtools";
  if (label === "research_paper") return "research";
  if (label === "industry_business") return "industry";
  if (label === "ai_product_update" || label === "agent_workflow" || label === "robotics") return "products";
  return "default";
}

function itemTagTone(label) {
  const text = String(label || "");
  if (text.includes("多源")) return "strong";
  if (text.includes("官方")) return "official";
  if (text.includes("精选") || text.includes("热点")) return "hot";
  if (text.includes("HN")) return "aggregate";
  if (text.includes("模型")) return "models";
  if (text.includes("开发")) return "devtools";
  if (text.includes("研究")) return "research";
  if (text.includes("自媒体")) return "creator";
  if (text.includes("社区")) return "community";
  if (text.includes("产品")) return "products";
  if (text.includes("行业")) return "industry";
  return "default";
}

// 栏目 chip 的色调按栏目 id 取（与原先对中文短标签嗅探的结果一致），不随语言变化。
const SECTION_TAG_TONES = {
  all: "default",
  models: "models",
  products: "products",
  devtools: "devtools",
  industry: "industry",
  research: "default",
  community: "community",
  creator: "creator",
};

function itemTagChip(label, tone = itemTagTone(label)) {
  const tag = document.createElement("span");
  tag.className = `signal-tag tone-${tone}`;
  tag.textContent = label;
  return tag;
}

function setSourceBadge(el, label, tone = "default", title = "") {
  el.className = `source source-chip kind-${tone}`;
  el.innerHTML = "";
  if (title) el.title = title;
  const dot = document.createElement("span");
  dot.className = "source-dot";
  dot.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "source-chip-label";
  text.textContent = label || t("common.source");
  el.append(dot, text);
}

function sourceTierPercent(item) {
  if (item.site_id === "official_ai") return 100;
  if (item.site_id === "aihot") return 90;
  const rank = Number(item.source_tier_rank);
  if (!Number.isFinite(rank)) return 38;
  return Math.max(28, Math.min(86, 86 - rank * 9));
}

function editorialPercent(item) {
  const aihotScore = normalizedPercent(item.aihot_score);
  if (aihotScore) return aihotScore;
  if (item.site_id === "official_ai") return 90;
  if (item.site_id === "aihot") return 78;
  const internal = scorePercent(item);
  return internal ? Math.max(45, Math.round(internal * 0.72)) : 36;
}

function freshnessPercent(item, halfLifeHours = 48) {
  const ageMs = Date.now() - timelineMs(item);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 100;
  const ageHours = ageMs / 3600000;
  return Math.max(0, Math.min(100, Math.round(100 * Math.pow(0.5, ageHours / halfLifeHours))));
}

function itemPriorityScore(item) {
  const creatorScore = creatorHotScore(item);
  if (creatorScore && itemSourceGroup(item) === "creator") return creatorScore;
  const internal = scorePercent(item);
  const editorial = editorialPercent(item);
  const source = sourceTierPercent(item);
  const freshness = freshnessPercent(item);
  const signal = Array.isArray(item.ai_signals) ? Math.min(100, item.ai_signals.length * 18) : 0;
  return Math.round((editorial * 0.3) + (source * 0.22) + (internal * 0.2) + (freshness * 0.18) + (signal * 0.1));
}

function labelText(item) {
  const key = `aiLabel.${item.ai_label}`;
  return (item.ai_label && i18n.has(key) ? t(key) : "") || item.ai_label || t("aiLabel.fallback");
}

// 故事的 importance_label 由 update_news.py 写成中文；按中文原文映射到 i18n（当前页面未渲染该字段，供复用）。
const IMPORTANCE_LABEL_KEYS = {
  "官方更新": "importance.official",
  "多源热议": "importance.multi_source",
  "行业动态": "importance.industry",
  "值得关注": "importance.watch",
};

function importanceLabelText(label) {
  const key = IMPORTANCE_LABEL_KEYS[label];
  return key ? t(key) : String(label || "");
}

function itemHaystack(item) {
  return [
    item.title,
    item.title_zh,
    item.title_en,
    item.title_original,
    item.source,
    item.site_name,
    item.site_id,
    item.ai_label,
    ...(Array.isArray(item.ai_signals) ? item.ai_signals : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

// 主题分类：优先用后端 ai_label，泛化标签走正则优先级（首个命中即停）
const AI_LABEL_SECTION_MAP = {
  model_release: "models",
  ai_product_update: "products",
  agent_workflow: "products",
  robotics: "products",
  developer_tool: "devtools",
  developer_tooling: "devtools",
  infra_compute: "devtools",
  research_paper: "research",
  industry_business: "industry",
};

const SECTION_FALLBACK_RULES = [
  ["research", [
    /paper|arxiv|research|benchmark|eval|dataset|lmsys|rdi|berkeley|huggingface daily papers|论文|研究|基准|评测|数据集|训练|k-means|speculative decoding/,
  ]],
  ["models", [
    /gpt[-\s]?\d|claude|gemini|grok|llama|qwen|deepseek|mistral|kimi\s?k\d|glm|gemma|模型|model|weights|权重|多模态|视频生成|diffusion|sora|seedance|llm|大模型/,
  ]],
  ["devtools", [
    /github|cursor|codex|copilot|openrouter|api|sdk|mcp|cli|framework|inference|推理|开发者|开源|代码|编程|算力|芯片|nvidia|cloud|部署|benchmarking|token/,
  ]],
  ["products", [
    /app|product|agent|workflow|siri|copilot|chatgpt|perplexity|runway|suno|支付宝|产品|应用|智能体|机器人|浏览器|搜索|助手|生成工具|办公|教育/,
  ]],
  ["industry", [
    /funding|raised|ipo|acquire|acquisition|lawsuit|regulation|policy|white house|pentagon|nvidia|salesforce|meta|microsoft|融资|收购|上市|监管|政策|裁员|估值|债券|芯片|公司|行业|政府|五角大楼|白宫/,
  ]],
];

// AIHOT 聚合器条目按原始平台粗分类（从 item.source 字符串推断），
// 供社区/自媒体归类与卡片小标签复用；无法识别时返回 null，不影响原有主题分类兜底。
function aihotSubSource(item) {
  if (!item || item.site_id !== "aihot") return null;
  const source = String(item.source || "");
  if (source.includes("公众号")) return "wechat";
  if (/^X[:：]/.test(source)) return "x";
  if (source.includes("Hacker News")) return "hn";
  if (/（RSS）\s*$/.test(source) || /\(RSS\)\s*$/.test(source)) return "rss";
  return null;
}

// X 作者身份统一：canonical identity = @handle（大小写不敏感提取，用于筛选/去重比较）。
// socialdata_x 的 source 本身就是裸 handle；aihot 转发的 X 帖子 source 形如 "X：Name (@handle)"。
function itemXAuthorSource(item) {
  if (!item) return null;
  if (item.site_id === "socialdata_x") return String(item.source || "").trim() || null;
  if (aihotSubSource(item) === "x") return String(item.source || "").trim() || null;
  return null;
}

function itemXAuthor(item) {
  const source = itemXAuthorSource(item);
  if (!source) return null;
  const match = source.match(/@([A-Za-z0-9_]+)/);
  return match ? `@${match[1]}` : null;
}

// 展示名：socialdata_x 只有裸 handle；aihot 去掉 "X：" 前缀后是更丰富的 "Name (@handle)"。
function itemXAuthorDisplay(item) {
  if (item?.site_id === "socialdata_x") {
    return String(item.source || "").trim() || null;
  }
  if (aihotSubSource(item) === "x") {
    return String(item.source || "").replace(/^X[:：]\s*/, "").trim() || null;
  }
  return null;
}

// 来源形态归类：自媒体 / 社区（HN + 中文技术社区），只看来源字段，不看标题内容
function itemSourceGroup(item) {
  const siteId = item.site_id || "";
  const aihotSub = aihotSubSource(item);
  if (aihotSub === "wechat") return "creator";
  if (aihotSub === "hn") return "community";
  const source = `${item.source || ""} ${item.site_name || ""}`.toLowerCase();
  if (
    siteId === "tikhub_douyin" ||
    siteId === "tikhub_xiaohongshu" ||
    source.includes("douyin") ||
    source.includes("xiaohongshu") ||
    source.includes("小红书") ||
    source.includes("抖音")
  ) return "creator";
  if (
    siteId === "hackernews" ||
    siteId === "zeli" ||
    siteId === "waytoagi" ||
    siteId === "followbuilders" ||
    siteId === "aibase" ||
    source.includes("hacker news") ||
    source.includes("hackernews") ||
    source.includes("hn algolia") ||
    source.includes("it之家") ||
    source.includes("36氪") ||
    source.includes("掘金") ||
    source.includes("readhub") ||
    source.includes("aibase") ||
    source.includes("公众号") ||
    source.includes("宝玉") ||
    source.includes("小互")
  ) return "community";
  return "other";
}

// 唯一分类入口：自媒体源 → 社区源 → 主题分类（AI_LABEL_SECTION_MAP/SECTION_FALLBACK_RULES）→ 兜底"全部"
// 每条 item 只落一个 tag；无法归入任何具体栏目的条目只在"全部"里可见，不强行塞进"行业"。
function itemSection(item) {
  const siteId = String(item.site_id || "").toLowerCase();
  const source = `${item.source || ""} ${item.site_name || ""}`.toLowerCase();
  if (siteId === "arxiv" || source.includes("arxiv") || source.includes("bair") || source.includes("berkeley ai research")) return "research";
  if (siteId === "github_trending" || source.includes("github")) return "models";
  if (siteId === "hackernews" || siteId === "producthunt" || source.includes("hacker news") || source.includes("show hn") || source.includes("product hunt") || source.includes("hellogithub") || source.includes("hn algolia")) return "products";
  if (siteId === "official_ai" || source.includes("openai") || source.includes("deepmind") || source.includes("google ai") || source.includes("hugging face") || source.includes("huggingface") || source.includes("microsoft research") || source.includes("anthropic") || source.includes("claude") || source.includes("meta ai") || source.includes("mit news ai") || source.includes("aihot") || source.includes("aibase") || source.includes("venturebeat ai") || source.includes("the decoder") || source.includes("marktechpost") || source.includes("wired ai")) return "industry";
  if (source.includes("techcrunch") || source.includes("the verge") || source.includes("ars technica") || source.includes("technology review") || source.includes("wired") || source.includes("engadget") || source.includes("solidot") || source.includes("it之家") || source.includes("ifanr") || source.includes("爱范儿") || source.includes("infoq") || source.includes("少数派") || source.includes("量子位") || source.includes("google blog") || source.includes("apple newsroom") || source.includes("nvidia") || source.includes("android police") || source.includes("techmeme") || source.includes("the next web")) return "devtools";
  return "devtools";
}

function itemMatchesSection(item, sectionId = state.activeSection) {
  return !sectionId || sectionId === "all" || itemSection(item) === sectionId;
}

function sectionBadgeLabel(sectionId) {
  return SECTION_BY_ID[sectionId]?.short || t("section.fallback");
}

// ---- 故事级辅助：按 primary_item（无则第一个 source）判定 ----
function storyRepresentativeItem(story) {
  if (!story) return null;
  if (story.primary_item && (story.primary_item.title || story.primary_item.url)) {
    const primary = story.primary_item;
    // primary_item 常缺 site_id/site_name：从 sources 里找同 url 的补全
    if (!primary.site_id && Array.isArray(story.sources)) {
      const match = story.sources.find((src) => src.url && src.url === primary.url) || story.sources[0];
      if (match) return { ...match, ...primary, site_id: match.site_id, site_name: match.site_name || match.source_name };
    }
    return primary;
  }
  if (Array.isArray(story.sources) && story.sources.length) return story.sources[0];
  return story;
}

function storySectionOf(story) {
  const rep = storyRepresentativeItem(story);
  return rep ? itemSection(rep) : "all";
}

function storyMatchesSection(story, sectionId = state.activeSection) {
  return !sectionId || sectionId === "all" || storySectionOf(story) === sectionId;
}

function storyMatchesQuery(story, query = state.query.trim().toLowerCase()) {
  if (!query) return true;
  const refs = [
    story,
    story.primary_item,
    ...(Array.isArray(story.sources) ? story.sources : []),
  ].filter(Boolean);
  return refs.some((ref) => {
    const hay = `${ref.title || ""} ${ref.title_zh || ""} ${ref.title_en || ""} ${ref.source || ""} ${ref.source_name || ""} ${ref.site_name || ""}`.toLowerCase();
    return hay.includes(query);
  });
}

// 站点等条目级筛选映射到故事：任意 source 命中即可
function storyMatchesSiteFilter(story) {
  if (!state.siteFilter && !state.authorFilter) return true;
  const refs = [
    storyRepresentativeItem(story),
    ...(Array.isArray(story.sources) ? story.sources : []),
  ].filter(Boolean);
  return refs.some((ref) => {
    if (state.siteFilter && ref.site_id !== state.siteFilter) return false;
    if (state.authorFilter && itemXAuthor(ref) !== state.authorFilter) return false;
    return true;
  });
}

function reasonText(item) {
  const creatorScore = creatorHotScore(item);
  if (creatorScore && itemSourceGroup(item) === "creator") {
    const metrics = item.creator_metrics || {};
    const parts = [
      t("reason.likes", { n: Number(metrics.likes) || 0 }),
      t("reason.collects", { n: Number(metrics.collects) || 0 }),
      t("reason.comments", { n: Number(metrics.comments) || 0 }),
      t("reason.shares", { n: Number(metrics.shares) || 0 }),
    ];
    if (Number(item.creator_freshness_bonus || 0) > 0) parts.push(t("reason.freshBonus"));
    return t("reason.creatorEngagement", { parts: parts.join(" · ") });
  }
  // 英文版只认 en.reason，不回退中文推荐语
  const recommendReason = String(IS_EN ? (item?.en?.reason || "") : (item?.recommend_reason_zh || "")).trim();
  if (recommendReason) return recommendReason;
  const signals = Array.isArray(item.ai_signals) ? item.ai_signals.filter(Boolean).slice(0, 3) : [];
  if (signals.length) return `${t("reason.signalsPrefix")}${signals.join(" / ")}`;
  if (item.ai_relevance_reason) return String(item.ai_relevance_reason).replaceAll("_", " ");
  return t("reason.default");
}

function timelineIso(item) {
  if (item.site_id === "producthunt" && item.recency_basis === "updated_at") return item.updated_at || "";
  const published = item.published_at || "";
  const seen = item.first_seen_at || "";
  const generated = state.generatedAt || "";
  if (published && generated) {
    const publishedMs = new Date(published).getTime();
    const generatedMs = new Date(generated).getTime();
    if (Number.isFinite(publishedMs) && Number.isFinite(generatedMs) && publishedMs > generatedMs + 10 * 60 * 1000) {
      return seen || published;
    }
  }
  return published || seen;
}

function timelineMs(item) {
  const d = new Date(timelineIso(item));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function normalizedEventText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\s　]+/g, "")
    .replace(/[，。、“”‘’：:；;！!？?（）()\[\]【】《》<>·.,/\\|_-]/g, "");
}

function eventKey(item) {
  // 事件去重键与语言无关，始终用中文站的标题取法，英文版切换标题不会改变合并结果
  const raw = itemTitleTextZh(item);
  const bracket = raw.match(/《([^》]{4,40})》/);
  if (bracket) return `book:${normalizedEventText(bracket[1]).slice(0, 36)}`;

  const normalized = normalizedEventText(raw);
  const model = normalized.match(/(bitcpmcann|deepseekv\d+(?:pro)?|grokv\d+(?:medium)?|gemini\d+(?:\.\d+)?(?:flash|pro)?|gpt\d+(?:\.\d+)?|llama\d+)/);
  if (model) return `entity:${model[1]}`;

  return `title:${normalized.slice(0, 34)}`;
}

function itemIdentityKeys(item) {
  const keys = new Set();
  if (!item) return keys;
  const url = item.url || item.primary_url;
  if (url) keys.add(`url:${url}`);
  if (item.id) keys.add(`id:${item.id}`);
  const title = item.title_zh || item.title || item.title_en || item.title_original;
  if (title) {
    keys.add(`event:${eventKey({ ...item, title, title_zh: item.title_zh || title })}`);
    keys.add(`title:${normalizedEventText(title).slice(0, 34)}`);
  }
  return keys;
}

function storyIdentityKeys(story) {
  const keys = new Set();
  if (!story) return keys;
  const refs = [
    { id: story.story_id, title: story.title, url: story.primary_url || story.url },
    story.primary_item,
    ...(Array.isArray(story.sources) ? story.sources : []),
    ...(Array.isArray(story.items) ? story.items : []),
  ].filter(Boolean);
  refs.forEach((ref) => {
    itemIdentityKeys(ref).forEach((key) => keys.add(key));
  });
  return keys;
}

function storyHasAnyKey(story, keys) {
  if (!keys || !keys.size) return false;
  for (const key of storyIdentityKeys(story)) {
    if (keys.has(key)) return true;
  }
  return false;
}

// sourceSignal 返回的是内部规范串（中文，供 sourceSignalTone 嗅探色调、去重用）；
// 展示时再经 sourceSignalLabel 翻译，保证语气色调逻辑不随语言变化。
const SOURCE_SIGNAL_KEYS = {
  "AI HOT精选": "signal.aihot",
  "HN热议": "signal.hn",
  "GitHub趋势": "signal.github",
  "官方更新": "signal.official",
  "抖音自媒体": "signal.douyin",
  "小红书自媒体": "signal.xiaohongshu",
  "来源": "common.source",
};

function sourceSignalLabel(signal) {
  const key = SOURCE_SIGNAL_KEYS[signal];
  return key ? t(key) : signal;
}

function sourceSignal(item) {
  const site = item.site_name || "";
  const source = item.source || "";
  const hay = `${site} ${source}`.toLowerCase();
  if (site === "AI HOT") return "AI HOT精选";
  if (hay.includes("hackernews") || hay.includes("hacker news")) return "HN热议";
  if (source.includes("GitHub · Trending Today") || hay.includes("github")) return "GitHub趋势";
  if (site === "Official AI Updates") return "官方更新";
  if (site === "Follow Builders") return "Builders";
  if (site === "TikHub Douyin" || hay.includes("tikhub douyin")) return "抖音自媒体";
  if (site === "TikHub Xiaohongshu" || hay.includes("tikhub xiaohongshu")) return "小红书自媒体";
  if (site === "AIbase") return "AIbase";
  if (site === "OPML RSS") return "OPML";
  return site || "来源";
}

function storyTimeMs(story, key) {
  const iso = story && story[key];
  if (!iso) return 0;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function storyScore(story) {
  const raw = (story && (story.importance_score ?? story.score ?? story.importance)) || 0;
  const score = Number(raw);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(score <= 1 ? score * 100 : score);
}

function storyPrimaryTitleText(story) {
  if (IS_EN) return englishTitleText((story && story.primary_item) || {}, story && story.title);
  const primary = (story && story.primary_item) || {};
  const explicit = String(primary.title_enhanced_zh || primary.title_zh || "").trim();
  const explicitOriginal = String(primary.title_en || primary.title_original || "").trim();
  if (explicit) return repairDisplayedTitle(explicitOriginal, explicit);
  const bilingual = String(primary.title || (story && story.title) || "").trim();
  if (bilingual.includes(" / ")) {
    const [zh, en] = bilingual.split(" / ");
    return repairDisplayedTitle(explicitOriginal || en, (zh || en || bilingual).trim());
  }
  return bilingual || t("common.untitled");
}

function storyPrimaryEnText(story) {
  if (IS_EN) return "";
  const primary = (story && story.primary_item) || {};
  const explicit = String(primary.title_en || primary.title_original || "").trim();
  if (isMostlyEnglishTitle(explicit) && explicit !== storyPrimaryTitleText(story)) return explicit;
  const bilingual = String(primary.title || (story && story.title) || "").trim();
  if (bilingual.includes(" / ")) {
    const [, en] = bilingual.split(" / ");
    const original = (en || "").trim();
    return isMostlyEnglishTitle(original) ? original : "";
  }
  return "";
}

function storySourceCount(story) {
  const sources = Array.isArray(story && story.sources) ? story.sources : [];
  const explicit = Number(story && story.duplicate_count);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(1, sources.length);
}

const CLAIM_STATUS_UI = {
  confirmed: {
    label: IS_EN ? "Confirmed" : "已确认",
    note: IS_EN ? "Primary official release; editorial review is still required." : "主条目来自官方一手发布，仍需人工阅读原文。",
  },
  reported: {
    label: IS_EN ? "Reported" : "媒体报道",
    note: IS_EN ? "Media or aggregator reporting; verify key details against the primary source." : "当前主要是媒体或聚合源转述，关键数字与结论需回到一手原文。",
  },
  analysis: {
    label: IS_EN ? "Analysis" : "分析观点",
    note: IS_EN ? "Contains opinion or speculation signals; do not present it as established fact." : "标题包含推测、判断或评论信号，只能作为观点，不应直接写成事实。",
  },
  rumor: {
    label: IS_EN ? "Unverified" : "传闻待核",
    note: IS_EN ? "Cites sources or speculation rather than a verified announcement." : "出现消息人士、据称、爆料等信号，除非一手确认，否则不应进入正式口播。",
  },
  preprint: {
    label: IS_EN ? "Preprint" : "预印本",
    note: IS_EN ? "Not a peer-reviewed conclusion; check method, version and reproducibility." : "预印本或社区热议论文不等于同行评审结论，需核对版本、方法和复现条件。",
  },
};
const VERIFICATION_UI = IS_EN
  ? {
      title: "Evidence boundary",
      score: "Evidence score",
      independent: "independent",
      repost: "reposts / same chain",
      primaryFound: "Primary source linked",
      primaryMissing: "Primary source missing",
      titleClaim: "Title-level claim",
      limits: "Limits to verify",
      chain: "View source chain",
      openPrimary: "Open primary source ↗",
      needsPrimary: "Add a primary source before scripting",
      rolePrimary: "Primary source",
      roleReport: "Report",
      roleAggregate: "Aggregator",
      roleRepost: "Repost / same chain",
    }
  : {
      title: "事实边界",
      score: "核验参考分",
      independent: "个独立来源",
      repost: "条转载/同链",
      primaryFound: "已定位一手原文",
      primaryMissing: "待补一手原文",
      titleClaim: "标题级声明",
      limits: "必须核验的限制",
      chain: "查看来源链",
      openPrimary: "打开一手原文 ↗",
      needsPrimary: "写稿前先补一手来源",
      rolePrimary: "一手原文",
      roleReport: "独立报道",
      roleAggregate: "聚合入口",
      roleRepost: "转载/同链",
    };

function urlHostKey(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceItemTier(item) {
  return sourceTierInfo(item || {}).tier;
}

function storyOfficialSource(story) {
  const refs = [story?.primary_item, ...(Array.isArray(story?.sources) ? story.sources : []), story].filter(Boolean);
  return refs.find((item) => ["official", "research"].includes(sourceItemTier(item)) && item.url) || null;
}

function inferClaimStatus(story, title) {
  const value = String(title || "");
  if (/传闻|据称|据悉|消息人士|知情人士|爆料|未证实|尚未证实|网传|\brumou?r\b|reportedly|sources?\s+say|unconfirmed|speculat/i.test(value)) return "rumor";
  if (["research"].includes(sourceItemTier(story?.primary_item || story)) || /arxiv\.org|openreview\.net/i.test(String(story?.primary_url || story?.url || ""))) return "preprint";
  if (/分析|认为|观点|评论|解读|预测|评估|可能会|或许|似乎|意味着|说明了什么|为什么会|为什么说|\banalysis\b|\bopinion\b|\bcommentary\b|\bwhat\s+.+\s+means\b|\bwhy\s+.+\b(?:could|might|is|are|matters)\b/i.test(value)) return "analysis";
  if (sourceItemTier(story?.primary_item || story) === "official") return "confirmed";
  return "reported";
}

function storyFactBoundary(story) {
  const title = storyPrimaryTitleText(story).trim();
  const sources = Array.isArray(story?.sources) ? story.sources : [];
  const primary = story?.primary_item || story || {};
  const official = storyOfficialSource(story);
  const status = CLAIM_STATUS_UI[story?.claim_status] ? story.claim_status : inferClaimStatus(story, title);
  const primarySourceUrl = story?.primary_source_url || official?.url || "";
  const domainSet = new Set();
  sources.forEach((source) => {
    const host = urlHostKey(source?.url);
    if (host) domainSet.add(host);
  });
  const primaryHost = urlHostKey(primary?.url);
  if (primaryHost) domainSet.add(primaryHost);
  const sourceCount = Math.max(1, sources.length, Number(story?.source_count || 0), Number(story?.duplicate_count || 0));
  const independent = Number.isFinite(Number(story?.independent_source_count))
    ? Number(story.independent_source_count)
    : Math.max(1, domainSet.size);
  const repost = Number.isFinite(Number(story?.repost_count))
    ? Number(story.repost_count)
    : Math.max(0, sourceCount - independent);
  const statusBase = { confirmed: 86, reported: 54, analysis: 40, preprint: 50, rumor: 16 }[status] || 40;
  const score = Number.isFinite(Number(story?.verification_score))
    ? Number(story.verification_score)
    : Math.max(1, Math.min(98, statusBase + (primarySourceUrl ? 8 : 0) + Math.max(0, independent - 1) * 3));
  let limits = Array.isArray(story?.limits) ? story.limits.filter(Boolean) : [];
  if (!limits.length) {
    if (!primarySourceUrl) limits.push(IS_EN ? "No primary source is linked in this event; add one before scripting." : "当前事件未定位一手原文，写稿前必须补官方公告、论文或仓库页面。");
    if (!String(primary?.summary || "").trim()) limits.push(IS_EN ? "Only a title and link are available; verify numbers, scope and causality in the original." : "当前只有标题和链接，标题中的数字、范围和因果关系都要打开原文复核。");
    if (/融资|估值|ipo|上市|funding|valuation|series\s+[a-z]/i.test(title)) limits.push(IS_EN ? "Funding and IPO details require company, SEC or exchange filings." : "融资、估值和上市信息必须再核对公司公告、SEC/交易所文件。");
    if (/发布|上线|推出|可用|launch|release|available/i.test(title)) limits.push(IS_EN ? "Check regions, account tiers, rollout timing and model/version limits." : "需核对可用地区、账号资格、灰度时间和模型/版本限制。");
  }
  if (!limits.length) limits.push(IS_EN ? "Read the original and record publication/update dates before recording." : "正式口播前仍需阅读原文，并记录发布日期和后续更新。");
  const chain = Array.isArray(story?.source_chain) && story.source_chain.length
    ? story.source_chain
    : sources.map((source, index) => {
        const samePrimary = primarySourceUrl && source?.url === primarySourceUrl;
        const aggregator = ["aihot", "techurls", "buzzing", "iris", "zeli", "newsnow", "followbuilders"].includes(source?.site_id);
        return {
          source: source?.source || source?.site_name || "",
          url: source?.url || "",
          title: itemTitleText(source || {}),
          role: aggregator ? "aggregator" : (samePrimary ? "primary_source" : (index === 0 ? "primary_report" : "report")),
        };
      });
  return {
    status,
    label: story?.claim_status_label || CLAIM_STATUS_UI[status].label,
    note: story?.claim_status_note || CLAIM_STATUS_UI[status].note,
    primarySourceUrl,
    independent,
    repost,
    score,
    claimCount: Math.max(1, Array.isArray(story?.key_claims) ? story.key_claims.length : 1),
    limits: limits.slice(0, 5),
    chain,
  };
}

function factRoleLabel(role) {
  if (role === "primary_source") return VERIFICATION_UI.rolePrimary;
  if (role === "primary_report") return VERIFICATION_UI.roleReport;
  if (role === "aggregator") return VERIFICATION_UI.roleAggregate;
  if (role === "repost") return VERIFICATION_UI.roleRepost;
  return VERIFICATION_UI.roleReport;
}

function renderFactBoundary(node, story) {
  const panel = node.querySelector(".fact-boundary");
  if (!panel || !story) return;
  const fact = storyFactBoundary(story);
  panel.hidden = false;
  const badge = panel.querySelector(".claim-status-badge");
  badge.textContent = fact.label;
  badge.className = `claim-status-badge claim-${fact.status}`;
  panel.querySelector(".verification-score").textContent = `${VERIFICATION_UI.score} ${fact.score}`;
  panel.querySelector(".claim-status-note").textContent = fact.note;

  const metrics = panel.querySelector(".verification-metrics");
  metrics.replaceChildren();
  const metricValues = [
    IS_EN ? `${fact.claimCount} verifiable claims` : `${fact.claimCount} 条可核验声明`,
    `${fact.independent} ${VERIFICATION_UI.independent}`,
    `${fact.repost} ${VERIFICATION_UI.repost}`,
    fact.primarySourceUrl ? VERIFICATION_UI.primaryFound : VERIFICATION_UI.primaryMissing,
  ];
  metricValues.forEach((value, index) => {
    const chip = document.createElement("span");
    chip.className = index === 3 ? (fact.primarySourceUrl ? "metric-good" : "metric-warn") : "";
    chip.textContent = value;
    metrics.appendChild(chip);
  });

  const basis = panel.querySelector(".claim-basis");
  basis.replaceChildren();
  const basisLabel = document.createElement("span");
  basisLabel.textContent = `${VERIFICATION_UI.titleClaim}：`;
  basis.appendChild(basisLabel);
  if (fact.primarySourceUrl) {
    const link = document.createElement("a");
    link.href = fact.primarySourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = VERIFICATION_UI.openPrimary;
    basis.appendChild(link);
  } else {
    const missing = document.createElement("strong");
    missing.textContent = VERIFICATION_UI.needsPrimary;
    basis.appendChild(missing);
  }

  const limits = panel.querySelector(".evidence-limits");
  limits.replaceChildren();
  fact.limits.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    limits.appendChild(li);
  });

  const chainDetails = panel.querySelector(".source-chain-details");
  const chainList = panel.querySelector(".source-chain-list");
  chainList.replaceChildren();
  if (fact.chain.length > 1) {
    chainDetails.hidden = false;
    chainDetails.querySelector("summary").textContent = VERIFICATION_UI.chain;
    fact.chain.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "source-chain-row";
      const role = document.createElement("span");
      role.className = "source-chain-role";
      role.textContent = factRoleLabel(entry.role);
      const link = document.createElement(entry.url ? "a" : "span");
      if (entry.url) {
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      link.className = "source-chain-link";
      link.textContent = entry.source || entry.title || t("common.source");
      const title = document.createElement("span");
      title.className = "source-chain-title";
      title.textContent = entry.title || "";
      row.append(role, link, title);
      chainList.appendChild(row);
    });
  } else {
    chainDetails.hidden = true;
  }
}

// 同一事件展开：source_count>=2 的故事可以展开看每家独立报道（标题+来源+相对时间）。
// 去重：跳过 url 与主条目重复的信源（已经在卡片主体展示过），除非去重后一条不剩——
// 那种情况说明所有信源 url 都和主条目一致，只能保留原始 sources 列表兜底展示。
function dedupedStorySources(row) {
  const story = row && row.story;
  if (!story) return [];
  const sources = Array.isArray(story.sources) ? story.sources : [];
  const primaryUrl = (row.item && row.item.url) || story.primary_url || story.url || "";
  const filtered = primaryUrl ? sources.filter((src) => src && src.url !== primaryUrl) : sources;
  return filtered.length ? filtered : sources;
}

function buildEventSourceRow(source) {
  const row = document.createElement("div");
  row.className = "event-source-row";

  const titleLink = document.createElement("a");
  titleLink.className = "event-source-title";
  titleLink.href = source.url || "#";
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = itemTitleText(source);

  const nameEl = document.createElement("span");
  nameEl.className = "event-source-name";
  nameEl.textContent = source.source_name || source.site_name || source.source || t("common.source");

  const timeEl = document.createElement("span");
  timeEl.className = "event-source-time";
  timeEl.textContent = fmtUpdatedRelative(timelineMs(source), source.site_id === "producthunt" && source.recency_basis === "updated_at");

  row.append(titleLink, nameEl, timeEl);
  return row;
}

function buildEventSourceList(row) {
  const sources = dedupedStorySources(row);
  if (!sources.length) return null;
  const list = document.createElement("div");
  list.className = "event-expand-list";
  sources.forEach((source) => list.appendChild(buildEventSourceRow(source)));
  return list;
}

const PERSONA_NAMES = { pragmatic: t("persona.pragmatic"), cynic: t("persona.cynic"), "paper-police": t("persona.paperPolice") };

// 三口味 persona 的网页展示暂时下线（2026-07-15 归档，样式待重设计，见 docs/ROADMAP.md）。
// 数据管线（persona_score.py）与 Skill 端不受影响；置回 true 即恢复 TOP3 板块与卡片锐评行。
const PERSONA_UI_ENABLED = false;

// 锐评字段（persona_review/persona_id）由 persona_score.py 只写进 daily-brief.json；
// 主列表/热点榜的 story 对象来自 stories-merged.json，天然没有这两个字段，
// 必须按 story_id 回查每日精选才能拿到锐评。
let _briefByIdCache = null;
function briefStoryById(storyId) {
  if (!storyId) return null;
  if (!_briefByIdCache) {
    _briefByIdCache = new Map();
    briefStories().forEach((s) => {
      if (s && s.story_id) _briefByIdCache.set(s.story_id, s);
    });
  }
  return _briefByIdCache.get(storyId) || null;
}

function buildStoryPersonaLine(story) {
  let source = story;
  let reviewText = typeof story?.persona_review === "string" ? story.persona_review.trim() : "";
  if (!reviewText) {
    source = briefStoryById(story?.story_id);
    reviewText = typeof source?.persona_review === "string" ? source.persona_review.trim() : "";
  }
  if (!reviewText) return null;
  const line = document.createElement("div");
  line.className = "story-persona";
  const label = document.createElement("span");
  label.className = "story-persona-label";
  label.textContent = PERSONA_NAMES[source?.persona_id] || PERSONA_NAMES.pragmatic;
  const text = document.createElement("span");
  text.className = "story-persona-text";
  text.textContent = reviewText;
  line.append(label, text);
  return line;
}

function findTop3PersonaEntry(storyId) {
  if (!storyId) return null;
  const items = state.top3Personas?.items;
  if (!Array.isArray(items) || !items.length) return null;
  return items.find((entry) => entry && entry.story_id === storyId) || null;
}

function buildPersonaPanel(entry) {
  const reviews = entry?.reviews;
  if (!reviews || typeof reviews !== "object") return null;
  const panel = document.createElement("div");
  panel.className = "persona-panel";
  let cols = 0;
  Object.keys(PERSONA_NAMES).forEach((personaId) => {
    const review = reviews[personaId];
    if (!review || typeof review.review !== "string" || !review.review.trim()) return;
    const col = document.createElement("div");
    col.className = "persona-col";
    col.dataset.persona = personaId;
    const name = document.createElement("span");
    name.className = "persona-name";
    name.textContent = PERSONA_NAMES[personaId];
    const score = document.createElement("strong");
    score.className = "persona-score";
    score.textContent = Number.isFinite(Number(review.score)) ? String(review.score) : "-";
    const text = document.createElement("p");
    text.className = "persona-review";
    text.textContent = review.review.trim();
    col.append(name, score, text);
    panel.appendChild(col);
    cols += 1;
  });
  return cols > 0 ? panel : null;
}

const HOT_DECAY_HOURS = 12;
const HOT_SCORE_SCALE = 60;

function storyHotness(story) {
  const sources = storySourceCount(story);
  if (sources < 2) return 0;
  const latest = storyTimeMs(story, "latest_at") || storyTimeMs(story, "earliest_at");
  const ageHours = latest ? Math.max(0, (Date.now() - latest) / 3600000) : 24;
  return (sources - 1) * Math.exp(-ageHours / HOT_DECAY_HOURS);
}

function storyHotScore(story) {
  const raw = storyHotness(story);
  if (raw <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round(raw * HOT_SCORE_SCALE)));
}

function hotStories(stories) {
  return stories
    .filter((story) => storyHotness(story) > 0)
    .sort((a, b) => {
      const byHotScore = storyHotScore(b) - storyHotScore(a);
      if (byHotScore !== 0) return byHotScore;
      const byHotRaw = storyHotness(b) - storyHotness(a);
      if (byHotRaw !== 0) return byHotRaw;
      const byEditorial = storyScore(b) - storyScore(a);
      if (byEditorial !== 0) return byEditorial;
      return storyTimeMs(b, "latest_at") - storyTimeMs(a, "latest_at");
    });
}

const HOT_BOARD_LIMIT = 20;

function briefStories() {
  return (Array.isArray(state.dailyBrief?.items) ? state.dailyBrief.items : []).filter((story) => !isUnsafeStory(story) && !isLocaleHiddenStory(story));
}

function mergedStories() {
  return (Array.isArray(state.storiesMerged?.stories) ? state.storiesMerged.stories : []).filter((story) => !isUnsafeStory(story) && !isLocaleHiddenStory(story));
}

// 精选徽章：故事命中每日精选（daily-brief.json）即视为"精选"来源，与分数徽章分开显示
let _briefIdentityKeyCache = null;
function briefIdentityKeySet() {
  if (_briefIdentityKeyCache) return _briefIdentityKeyCache;
  const keys = new Set();
  briefStories().forEach((story) => storyIdentityKeys(story).forEach((key) => keys.add(key)));
  _briefIdentityKeyCache = keys;
  return keys;
}
function isStoryCurated(story) {
  return storyHasAnyKey(story, briefIdentityKeySet());
}
function isCuratedSourceRef(ref) {
  if (!ref) return false;
  return ref.site_id === "official_ai" || ref.site_id === "aihot" || ref.source_tier === "official" || ref.source_tier === "curated";
}

// 热点排行区候选池：stories-merged 中 source_count>=2，按热度降序（不含栏目过滤，供 tab 计数复用）
function hotBoardStories() {
  return hotStories(mergedStories().filter((story) =>
    storySourceCount(story) >= 2 &&
    (!state.officialOnly || storyIsFirstParty(story)) &&
    storyMatchesSiteFilter(story) &&
    storyMatchesQuery(story)));
}

function hotBoardEntries() {
  if (state.mode !== "selected") return [];
  return hotBoardStories()
    .filter((story) => storyMatchesSection(story))
    .slice(0, HOT_BOARD_LIMIT)
    .map((story, index) => storyToRow(story, index));
}

// ---- AI 视频选题：事实门 + 抖音公开热榜 + 规则化传播参考，不调用付费模型 ----
const DOUYIN_PICK_LIMIT = 5;
const DOUYIN_PICK_ROUNDS = 3;
const DOUYIN_BUCKET_DEFS = [
  {
    id: "research",
    label: IS_EN ? "Research & safety" : "研究与安全",
    signal: IS_EN ? "Explain the science" : "原理拆解",
    angle: IS_EN
      ? "Start with the real problem, explain the mechanism with a simple analogy, then show what changes for ordinary people."
      : "先讲它解决的真实问题，再用生活化类比拆原理，最后说普通人何时能感受到。",
    pattern: /研究|论文|benchmark|基准|dna|基因|细胞|疾病|医学|医疗|科学|机器人|robotics|隐私保护/i,
  },
  {
    id: "opensource",
    label: IS_EN ? "Open source" : "开源与开发",
    signal: IS_EN ? "Try it yourself" : "可跟练",
    angle: IS_EN
      ? "Explain what was open-sourced, how it differs from closed models, and who can actually use it."
      : "讲清开源了什么、和闭源差在哪、开发者或普通人能不能直接使用。",
    pattern: /开源|open[- ]?source|github|apache|权重|sdk|cli|mcp|开发者|编程|coding|代码|repo|仓库/i,
  },
  {
    id: "society",
    label: IS_EN ? "Society & education" : "社会与教育",
    signal: IS_EN ? "Real-world impact" : "社会影响",
    angle: IS_EN
      ? "Open with one person and one concrete scene, then explain the rule change, the controversy and the boundary."
      : "从一个具体的人和场景切入，再解释规则变化、争议和边界。",
    pattern: /作弊|教育|学生|大学|考试|老师|学校|职场|就业|工作方式|儿童|青少年|版权|确权|法律|法院|监管|政策|伦理|隐私|安全|风险|社会|争议|用户不买账/i,
  },
  {
    id: "business",
    label: IS_EN ? "Industry & business" : "行业与商业",
    signal: IS_EN ? "Follow the money" : "利益与格局",
    angle: IS_EN
      ? "Start with what changed in money and competition, then translate it into user choice, pricing or jobs."
      : "先讲钱和格局发生了什么，再落到用户选择、价格或工作机会。",
    pattern: /营收|融资|ipo|收购|裁员|诉讼|投资|估值|上市|交易|市场|竞争|成本|价格|收费|免费|用户|访问量|亿美元|万元|折扣|促销|业务/i,
  },
  {
    id: "model",
    label: IS_EN ? "Models & capability" : "模型与能力",
    signal: IS_EN ? "Side-by-side test" : "能力对比",
    angle: IS_EN
      ? "Use the same task to compare old and new models, then explain the gain, the limit and the practical use."
      : "用同一道题做新旧或同类对比，讲清能力提升、局限和实际用途。",
    pattern: /大模型|模型|gemini|gpt|claude|qwen|deepseek|llama|grok|文心|千问|ernie|copilot|多模态|推理|语音|图像|视频|agent|智能体/i,
  },
  {
    id: "product",
    label: IS_EN ? "Products & workflows" : "产品与应用",
    signal: IS_EN ? "Live demo" : "上手演示",
    angle: IS_EN
      ? "Show it live: how people did this before, how they do it now, and who benefits most."
      : "做一次直观演示，按“以前怎么做、现在怎么做、谁最受益”展开。",
    pattern: /.*/i,
  },
];
const DOUYIN_BUCKET_BY_ID = Object.fromEntries(DOUYIN_BUCKET_DEFS.map((bucket) => [bucket.id, bucket]));
const DOUYIN_UI = IS_EN
  ? {
      loading: "Picking today's topics...",
      meta: "{n} topics · set {round}/{rounds}",
      empty: "No suitable creator topics in the current data snapshot.",
      angleLabel: "How to tell it",
      source: "Source",
      open: "Open source ↗",
      potential: "Composite",
      refreshed: "Next batch",
      scoreNote: "Composite score ranks verified topics by traffic opportunity; it is not a recommendation probability.",
      riskLabel: "Risk",
      factors: { credibility: "Fact", traffic: "Traffic", impact: "Impact", visual: "Visual", recency: "Velocity", controversy: "Debate" },
      summary: "Evidence mix in this batch",
      summaryNote: "Rumor items are excluded. A topic must pass the fact gate before traffic opportunity leads the ranking.",
      hotTitle: "Douyin public hot list",
      hotMeta: "Public list, not the recommendation feed",
      hotDirect: "Hot-list hit",
      hotAdjacent: "AI-adjacent bridge",
      hotMiss: "No hot-list hit",
      hotUnavailable: "Hot-list data unavailable; showing editorial candidates only.",
      bridgeWords: "Available bridge words",
      hotSource: "Open Douyin hot list ↗",
      hotDisclaimer: "A public hot-list hit is not a recommendation guarantee. No hit does not mean a topic is worthless.",
      factGatePass: "Fact gate passed",
      factGateFail: "Needs more evidence",
      platformScore: "Fact / traffic",
    }
  : {
      loading: "正在挑选今日选题...",
      meta: "{n} 条 · 第 {round}/{rounds} 组",
      empty: "当前数据里暂时没有足够合适的视频选题。",
      angleLabel: "怎么讲",
      source: "来源",
      open: "打开原文 ↗",
      potential: "综合参考",
      refreshed: "换一批",
      scoreNote: "综合分只在事实达标后优先按传播机会排序，不是平台推荐概率。",
      riskLabel: "风险",
      factors: { credibility: "事实", traffic: "热度", impact: "影响", visual: "画面", recency: "速度", controversy: "争议" },
      summary: "本组核验结构",
      summaryNote: "传闻不进入推荐；先过事实门，再按抖音热榜和传播机会排序。",
      hotTitle: "抖音公开热榜",
      hotMeta: "公开榜单不等于推荐流",
      hotDirect: "热榜命中",
      hotAdjacent: "AI 可借势",
      hotMiss: "未命中热榜",
      hotUnavailable: "热榜数据暂不可用，当前仅展示编辑候选。",
      bridgeWords: "可借势大众词",
      hotSource: "打开抖音热榜 ↗",
      hotDisclaimer: "命中公开热榜不代表一定获得推荐；未命中也只说明当前不在全民榜单。",
      factGatePass: "已过事实门",
      factGateFail: "需补证据",
      platformScore: "事实 / 热度",
    };

function douyinStoryUrl(story) {
  const value = story?.primary_url || story?.url || storyRepresentativeItem(story)?.url || "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function douyinSourceName(story) {
  return story?.primary_item?.source
    || story?.source
    || (Array.isArray(story?.source_names) ? story.source_names[0] : "")
    || t("common.source");
}

function douyinBucketForTitle(title, story) {
  const raw = `${title} ${douyinStoryUrl(story)}`.toLowerCase();
  const siteId = String(story?.primary_item?.site_id || story?.site_id || "");
  if (siteId === "producthunt" || raw.includes("producthunt.com")) return "product";
  if (siteId === "github_trending" || /github\.com|huggingface\.co\/(?:spaces|models|datasets)/i.test(raw)) return "opensource";

  const opinionLike = /分析|认为|观点|评论|解读|预测|评估|意味着|为什么会|为什么说|\banalysis\b|\bopinion\b|\bcommentary\b|\bwhat\s+.+\s+means\b/i.test(title);
  if (opinionLike) {
    if (/营收|融资|ipo|收购|裁员|诉讼|投资|估值|上市|交易|市场|竞争|成本|价格|收费|免费|business|funding|valuation|market|revenue/i.test(title)) return "business";
    return "society";
  }

  let best = { id: "product", score: 0 };
  DOUYIN_BUCKET_DEFS.forEach((bucket) => {
    if (bucket.id === "product") return;
    const matches = title.match(bucket.pattern);
    let score = matches ? matches.length : 0;
    if (bucket.id === "model" && /发布|上线|推出|版本|能力|模型|model|release|launch/i.test(title)) score += 2;
    if (bucket.id === "society" && /普通人|工作|教育|学生|医疗|健康|家庭|版权|隐私|安全|监管|就业/i.test(title)) score += 2;
    if (bucket.id === "business" && /融资|估值|价格|免费|营收|收购|裁员|ipo/i.test(title)) score += 2;
    if (bucket.id === "opensource" && /开源|open[- ]?source|github|权重|仓库|repo|sdk|cli/i.test(title)) score += 2;
    if (score > best.score) best = { id: bucket.id, score };
  });
  return best.score ? best.id : "product";
}

function douyinPickEligible(story) {
  const title = storyPrimaryTitleText(story).trim();
  const raw = `${title} ${douyinStoryUrl(story)}`;
  if (title.length < 8 || title === t("common.untitled")) return false;
  if (/changelog|release notes|patch notes|更新日志|版本说明/i.test(raw)) return false;
  if (/customer stor(?:y|ies)|\/customer-stories\/|客户案例|企业案例|case study|借助AI重新思考|rethink(?:s)? the business/i.test(raw)) return false;
  if (/webinar|podcast|newsletter|招聘|hiring|job opening|活动报名|赞助/i.test(title)) return false;
  if (/^(?:[A-Za-z0-9 ._-]+\s+)?v?\d+(?:\.\d+){2,}$/.test(title)) return false;
  const fact = storyFactBoundary(story);
  if (fact.status === "rumor") return false;
  return true;
}

function douyinTalkability(title) {
  const value = String(title || "").toLowerCase();
  let score = 0;
  if (/发布|上线|推出|亮相|available|launch|release/.test(value)) score += 12;
  if (/普通人|生活|工作|办公|教育|学生|老师|医疗|健康|家庭|手机|电脑|开车|车机/.test(value)) score += 18;
  if (/安全|隐私|监管|风险|作弊|法律|版权|确权|争议/.test(value)) score += 13;
  if (/开源|免费|价格|成本|降价|省钱|亿美元|营收/.test(value)) score += 11;
  if (/首次|第一|最强|翻倍|创纪录|碾压|对比|取代|替代/.test(value)) score += 9;
  if (/\d|%/.test(value)) score += 5;
  if (title.length >= 10 && title.length <= 48) score += 8;
  return Math.min(40, score);
}

function clampScore(value) {
  return Math.max(1, Math.min(99, Math.round(Number(value) || 0)));
}

const DOUYIN_HOT_BRIDGE_RULES = [
  {
    id: "consumer_device",
    hot: /苹果|手机|华为|小米|电脑|平板|耳机|眼镜|相机|设备/i,
    event: /苹果|手机|华为|小米|电脑|平板|耳机|眼镜|相机|设备|终端|ios|android|消费电子/i,
  },
  {
    id: "education",
    hot: /教育|学生|学校|老师|高考|大学|课堂|作业/i,
    event: /教育|学生|学校|老师|高考|大学|课堂|作业|学习/i,
  },
  {
    id: "health",
    hot: /医疗|医生|医院|健康|疾病|癌症|药|护理/i,
    event: /医疗|医生|医院|健康|疾病|癌症|药|诊断|护理/i,
  },
  {
    id: "fraud",
    hot: /诈骗|骗局|换脸|造假|谣言|隐私/i,
    event: /诈骗|骗局|换脸|deepfake|造假|谣言|隐私|安全/i,
  },
  {
    id: "copyright",
    hot: /版权|侵权|抄袭|画作|音乐|电影|短剧/i,
    event: /版权|侵权|抄袭|生成|画作|音乐|电影|短剧|内容创作/i,
  },
  {
    id: "jobs",
    hot: /就业|工作|裁员|职场|失业|工资/i,
    event: /就业|工作|裁员|职场|失业|工资|职业|岗位/i,
  },
  {
    id: "auto",
    hot: /汽车|驾驶|车祸|新能源|车机/i,
    event: /汽车|驾驶|车祸|新能源|车机|自动驾驶/i,
  },
  {
    id: "robot",
    hot: /机器人|具身|工厂|制造/i,
    event: /机器人|robotics|具身|工厂|制造/i,
  },
  {
    id: "games",
    hot: /游戏|电竞|KPL|LPL|BLG|GEN|冠军/i,
    event: /游戏|电竞|NPC|角色|游戏开发|电竞分析/i,
  },
  {
    id: "entertainment",
    hot: /演唱会|电影|短剧|明星|综艺/i,
    event: /视频生成|音频生成|音乐生成|短剧|电影|数字人|虚拟人/i,
  },
  {
    id: "sports",
    hot: /国足|足球|奥运|世界杯|比赛/i,
    event: /体育|足球|奥运|世界杯|运动训练|赛事分析/i,
  },
];

function containsHotTerm(text, term) {
  const value = String(term || "").trim();
  if (!value) return false;
  if (/^[A-Za-z0-9]{2,}$/.test(value)) {
    return new RegExp(`(^|[^A-Za-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(text);
  }
  return text.includes(value);
}

function douyinHotMatch(story, title) {
  const hotItems = Array.isArray(state.douyinHot?.items) ? state.douyinHot.items : [];
  if (!hotItems.length) {
    return {
      available: false,
      directMatch: false,
      adjacentMatch: false,
      bestItem: null,
      matchedWords: [],
      score: 0,
      searchGrowth: null,
      supplyCount: null,
      saturation: "unknown",
    };
  }
  const storySummary = String(story?.primary_item?.summary || story?.summary || "");
  const eventText = `${title} ${storySummary}`;
  const direct = [];
  const adjacent = [];
  hotItems.forEach((item) => {
    const word = String(item.word || "");
    if (!word) return;
    const bridge = String(item.bridge_term || "");
    const entityHit = (bridge && containsHotTerm(eventText, bridge))
      || (item.is_ai_related && /\bai\b|人工智能|大模型|chatgpt|openai|claude|gemini|deepseek|机器人|智能体/i.test(eventText));
    if (entityHit) {
      direct.push({ item, ruleId: bridge || "ai_entity" });
      return;
    }
    const rule = DOUYIN_HOT_BRIDGE_RULES.find((candidate) => candidate.hot.test(word));
    if (rule && rule.event.test(eventText)) adjacent.push({ item, ruleId: rule.id });
  });
  const bestDirect = direct.sort((a, b) => a.item.position - b.item.position)[0] || null;
  const bestAdjacent = adjacent.sort((a, b) => a.item.position - b.item.position)[0] || null;
  const best = bestDirect || bestAdjacent;
  let score = 0;
  if (bestDirect) {
    const position = Number(bestDirect.item.position || 50);
    score = Math.max(12, 38 - (position - 1) * 0.8);
    if (bestDirect.item.trend === "rising" || bestDirect.item.trend === "new") score += 4;
    if (bestDirect.item.trend === "falling") score -= 2;
  } else if (bestAdjacent) {
    const position = Number(bestAdjacent.item.position || 50);
    score = Math.max(5, 20 - (position - 1) * 0.35);
  }
  return {
    available: true,
    directMatch: Boolean(bestDirect),
    adjacentMatch: Boolean(bestAdjacent),
    bestItem: best ? best.item : null,
    bestRuleId: best ? best.ruleId : "",
    matchedWords: Array.from(new Set([...direct, ...adjacent].map((entry) => entry.item.word))).slice(0, 3),
    score: Math.max(0, Math.min(42, Math.round(score))),
    searchGrowth: null,
    supplyCount: best?.item?.video_count ?? null,
    saturation: "unknown",
  };
}

function douyinScoreBreakdown(story, title, fact) {
  const latest = storyTimeMs(story, "latest_at") || storyTimeMs(story, "earliest_at");
  const ageHours = latest ? Math.max(0, (Date.now() - latest) / 3600000) : 48;
  const factScore = clampScore(fact.score);
  let impact = 24;
  if (/普通人|生活|工作|办公|教育|学生|老师|医疗|健康|家庭|手机|电脑|开车|车机|消费者|用户|就业/i.test(title)) impact += 46;
  if (/免费|价格|收费|降价|省钱|成本|亿美元|营收|市值|工资/i.test(title)) impact += 24;
  if (/发布|上线|推出|可用|launch|release|available/i.test(title)) impact += 10;
  if (/OpenAI|Google|DeepMind|Apple|Microsoft|Meta|NVIDIA|英伟达|阿里|腾讯|字节|百度|华为|小米/i.test(title)) impact += 16;
  let visual = 30;
  if (/机器人|robotics|视频|图像|图片|语音|音乐|手机|电脑|汽车|车机|眼镜|耳机|设备|app|应用|界面|代码|github|demo|演示/i.test(title)) visual += 42;
  if (/价格|对比|前后|翻倍|第一|最强|排名|榜单/i.test(title)) visual += 12;
  if (/模型|agent|智能体|多模态|推理/i.test(title)) visual += 10;
  const recency = Math.max(0, 100 - ageHours * 2);
  let controversy = 20;
  if (/争议|取代|替代|失业|裁员|作弊|版权|隐私|安全|监管|法律|开庭|诉讼|用户不买账|翻车/i.test(title)) controversy += 48;
  if (/开源|闭源|免费|付费|涨价|降价|价格战/i.test(title)) controversy += 20;
  if (/官方|辟谣|传闻|回应|纠偏/i.test(title)) controversy += 12;
  impact = Math.min(100, impact);
  visual = Math.min(100, visual);
  controversy = Math.min(100, controversy);
  const hotMatch = douyinHotMatch(story, title);

  let risk = 0;
  const risks = [];
  if (fact.status === "analysis") { risk += 8; risks.push(IS_EN ? "Opinion, not fact" : "观点非事实"); }
  if (fact.status === "preprint") { risk += 10; risks.push(IS_EN ? "Preprint" : "预印本"); }
  if (!fact.primarySourceUrl) { risk += 8; risks.push(IS_EN ? "No primary source" : "缺一手源"); }
  if (fact.independent < 2) { risk += 6; risks.push(IS_EN ? "Single source" : "单一来源"); }
  if (["producthunt", "github_trending"].includes(String(story?.primary_item?.site_id || story?.site_id || ""))) {
    risk += 16;
    risks.push(IS_EN ? "Community listing" : "社区榜单");
  }
  if (/api|sdk|cli|benchmark|token|参数|部署|开发者|database|数据库/i.test(title)) {
    risk += 12;
    risks.push(IS_EN ? "Too technical" : "过度技术化");
  }
  if (/Google Wallet|Google Cloud credits|Gemini for personal finance/i.test(title)) {
    risk += 9;
    risks.push(IS_EN ? "China availability needs checking" : "国内可用性待核");
  }
  if (!String(story?.primary_item?.summary || story?.summary || "").trim()) risk += 4;
  if (fact.status === "confirmed") risk = Math.max(0, risk - 4);

  const developerPenalty = /developer|developers|SDK|API|coding|编程|开发|CLI|仓库|benchmark|积分|credits/i.test(title) ? 8 : 0;
  const trafficScore = Math.max(0, Math.min(99, Math.round(
    hotMatch.score
    + impact * 0.20
    + visual * 0.15
    + controversy * 0.10
    + recency * 0.10
    - developerPenalty
    - (hotMatch.available && !hotMatch.directMatch && !hotMatch.adjacentMatch ? 4 : 0)
  )));
  const factGate = factScore >= 70 && fact.status !== "rumor";
  const finalScore = clampScore(
    factGate
      ? factScore * 0.55 + trafficScore * 0.45
      : factScore * 0.75 + trafficScore * 0.25
  );
  return {
    score: finalScore,
    factScore,
    trafficScore,
    factGate,
    hotMatch,
    factors: {
      credibility: factScore,
      traffic: trafficScore,
      impact: Math.round(impact),
      visual: Math.round(visual),
      recency: Math.round(recency),
      controversy: Math.round(controversy),
    },
    platformSignals: {
      douyin_hot_match: hotMatch.directMatch,
      douyin_hot_adjacent: hotMatch.adjacentMatch,
      douyin_hot_rank: hotMatch.bestItem?.position ?? null,
      douyin_hot_velocity: hotMatch.bestItem?.trend ?? null,
      douyin_hot_rank_change: hotMatch.bestItem?.rank_change ?? null,
      douyin_hot_value: hotMatch.bestItem?.hot_value ?? null,
      douyin_hot_age_minutes: hotMatch.bestItem?.age_minutes ?? null,
      douyin_search_growth: hotMatch.searchGrowth,
      douyin_supply_count: hotMatch.supplyCount,
      douyin_saturation: hotMatch.saturation,
      china_available: "unknown",
      consumer_relevance: Math.round(impact),
      visual_demo: Math.round(visual),
      fact_confidence: factScore,
      click_conflict: Math.round(controversy),
    },
    risks,
    risk,
  };
}

function douyinPickTags(story, bucketId, title, breakdown) {
  const tags = [];
  const bucket = DOUYIN_BUCKET_BY_ID[bucketId];
  const fact = storyFactBoundary(story);
  if (breakdown?.hotMatch?.directMatch) tags.push(DOUYIN_UI.hotDirect);
  else if (breakdown?.hotMatch?.adjacentMatch) tags.push(DOUYIN_UI.hotAdjacent);
  if (fact.primarySourceUrl) tags.push(IS_EN ? "Primary linked" : "一手可定位");
  if (fact.independent >= 3) tags.push(IS_EN ? "Multi-source" : "多源关注");
  if (fact.status === "confirmed") tags.push(IS_EN ? "Confirmed" : "已确认");
  if (breakdown?.factors?.impact >= 65) tags.push(IS_EN ? "Broad impact" : "大众影响");
  if (breakdown?.factors?.visual >= 65) tags.push(IS_EN ? "Visualizable" : "画面可做");
  if (/开源|权重|open[- ]?source|github/i.test(title)) tags.push(IS_EN ? "Try it" : "可跟练");
  tags.push(bucket?.signal || (IS_EN ? "Explainable" : "可解释"));
  return Array.from(new Set(tags)).slice(0, 3);
}

function douyinRankCompare(a, b) {
  return Number(b.factGate) - Number(a.factGate)
    || b.trafficScore - a.trafficScore
    || b.score - a.score
    || b.latestMs - a.latestMs;
}

function douyinPickCandidates() {
  const groups = new Map(DOUYIN_BUCKET_DEFS.map((bucket) => [bucket.id, []]));
  mergedStories().forEach((story) => {
    if (!douyinPickEligible(story)) return;
    const title = storyPrimaryTitleText(story).trim();
    const url = douyinStoryUrl(story);
    if (!url) return;
    const bucketId = douyinBucketForTitle(title, story);
    const fact = storyFactBoundary(story);
    const breakdown = douyinScoreBreakdown(story, title, fact);
    const candidate = {
      story,
      title,
      url,
      bucketId,
      sourceName: douyinSourceName(story),
      score: breakdown.score,
      factScore: breakdown.factScore,
      trafficScore: breakdown.trafficScore,
      factGate: breakdown.factGate,
      hotMatch: breakdown.hotMatch,
      platformSignals: breakdown.platformSignals,
      breakdown,
      fact,
      tags: douyinPickTags(story, bucketId, title, breakdown),
      latestMs: storyTimeMs(story, "latest_at") || storyTimeMs(story, "earliest_at"),
    };
    groups.get(bucketId)?.push(candidate);
  });
  groups.forEach((rows) => rows.sort(douyinRankCompare));
  return groups;
}

function douyinPicks() {
  const groups = douyinPickCandidates();
  const round = Math.max(0, Number(state.douyinPickRound) || 0) % DOUYIN_PICK_ROUNDS;
  const picked = [];
  const pickedIds = new Set();
  const add = (candidate) => {
    if (!candidate || pickedIds.has(candidate.story.story_id) || picked.length >= DOUYIN_PICK_LIMIT) return;
    picked.push(candidate);
    pickedIds.add(candidate.story.story_id);
  };

  // 每个方向先取一条；切换“换一批”时轮换到各方向下一候选，避免总是同五条。
  const preferred = DOUYIN_BUCKET_DEFS.map((bucket) => {
    const rows = groups.get(bucket.id) || [];
    if (!rows.length) return null;
    return rows[Math.min(round, rows.length - 1)];
  }).filter(Boolean).sort(douyinRankCompare);
  preferred.forEach(add);

  if (picked.length < DOUYIN_PICK_LIMIT) {
    const leftovers = Array.from(groups.values())
      .flat()
      .filter((candidate) => !pickedIds.has(candidate.story.story_id))
      .sort(douyinRankCompare);
    leftovers.forEach(add);
  }

  return picked.sort(douyinRankCompare).slice(0, DOUYIN_PICK_LIMIT);
}

function renderDouyinHotBoard() {
  if (!douyinHotBoardEl) return;
  douyinHotBoardEl.replaceChildren();
  const hot = state.douyinHot;
  if (!hot) {
    const missing = document.createElement("p");
    missing.className = "douyin-hot-unavailable";
    missing.textContent = DOUYIN_UI.hotUnavailable;
    douyinHotBoardEl.appendChild(missing);
    return;
  }
  const head = document.createElement("div");
  head.className = "douyin-hot-head";
  const heading = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = DOUYIN_UI.hotTitle;
  const meta = document.createElement("span");
  meta.textContent = `${hot.active_time || "--"} · ${DOUYIN_UI.hotMeta}`;
  heading.append(title, meta);
  const sourceLink = document.createElement("a");
  sourceLink.href = hot.source_page || "https://www.douyin.com/hot";
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = DOUYIN_UI.hotSource;
  head.append(heading, sourceLink);

  const stats = document.createElement("div");
  stats.className = "douyin-hot-stats";
  const statValues = [
    `${hot.count || 0} 条在榜`,
    `AI 直接相关 ${hot.ai_related_count || 0}`,
    `可借势大众词 ${hot.bridge_item_count || 0}`,
  ];
  statValues.forEach((value, index) => {
    const chip = document.createElement("span");
    chip.className = index === 1 && Number(hot.ai_related_count || 0) === 0 ? "hot-zero" : "";
    chip.textContent = value;
    stats.appendChild(chip);
  });

  const bridge = document.createElement("div");
  bridge.className = "douyin-hot-bridge";
  const bridgeLabel = document.createElement("span");
  bridgeLabel.textContent = `${DOUYIN_UI.bridgeWords}：`;
  bridge.appendChild(bridgeLabel);
  const bridgeItems = Array.isArray(hot.bridge_items) ? hot.bridge_items.slice(0, 6) : [];
  if (bridgeItems.length) {
    bridgeItems.forEach((item) => {
      const chip = document.createElement("span");
      chip.textContent = `${item.word} #${item.position}`;
      chip.title = item.bridge_term ? `AI 借势词：${item.bridge_term}` : String(item.word || "");
      bridge.appendChild(chip);
    });
  } else {
    const none = document.createElement("span");
    none.textContent = "本次热榜没有可用的 AI 借势词";
    bridge.appendChild(none);
  }

  const note = document.createElement("p");
  note.textContent = hot.fetch_ok === false
    ? `${hot.disclaimer || ""} 本次抓取失败：${hot.last_fetch_error || "未知错误"}`
    : DOUYIN_UI.hotDisclaimer;
  douyinHotBoardEl.append(head, stats, bridge, note);
}

function renderDouyinVerificationSummary(picks) {
  if (!douyinVerificationSummaryEl) return;
  douyinVerificationSummaryEl.replaceChildren();
  if (!picks.length) return;
  const counts = { confirmed: 0, reported: 0, analysis: 0, preprint: 0, rumor: 0 };
  picks.forEach((pick) => { counts[pick.fact.status] = (counts[pick.fact.status] || 0) + 1; });
  const heading = document.createElement("strong");
  heading.textContent = DOUYIN_UI.summary;
  const chips = document.createElement("div");
  chips.className = "douyin-verification-chips";
  Object.entries(counts).forEach(([status, count]) => {
    if (!count) return;
    const chip = document.createElement("span");
    chip.className = `claim-${status}`;
    chip.textContent = `${CLAIM_STATUS_UI[status]?.label || status} ${count}`;
    chips.appendChild(chip);
  });
  const gateCount = picks.filter((pick) => pick.factGate).length;
  const hotCount = picks.filter((pick) => pick.hotMatch.directMatch).length;
  const adjacentCount = picks.filter((pick) => pick.hotMatch.adjacentMatch && !pick.hotMatch.directMatch).length;
  const gateChip = document.createElement("span");
  gateChip.className = gateCount ? "summary-gate-pass" : "summary-gate-fail";
  gateChip.textContent = `${DOUYIN_UI.factGatePass} ${gateCount}`;
  const hotChip = document.createElement("span");
  hotChip.className = hotCount ? "summary-hot-hit" : "summary-hot-miss";
  hotChip.textContent = `${DOUYIN_UI.hotDirect} ${hotCount}`;
  const adjacentChip = document.createElement("span");
  adjacentChip.className = "summary-hot-adjacent";
  adjacentChip.textContent = `${DOUYIN_UI.hotAdjacent} ${adjacentCount}`;
  chips.append(gateChip, hotChip, adjacentChip);
  const note = document.createElement("small");
  note.textContent = DOUYIN_UI.summaryNote;
  douyinVerificationSummaryEl.append(heading, chips, note);
}

function renderDouyinPicks() {
  if (!douyinPicksWrapEl || !douyinPicksListEl) return;
  const visible = state.mode === "selected"
    && state.activeSection === "all"
    && !state.query.trim()
    && !state.siteFilter
    && !state.authorFilter
    && !state.officialOnly;
  douyinPicksWrapEl.hidden = !visible;
  if (!visible) {
    if (douyinVerificationSummaryEl) douyinVerificationSummaryEl.replaceChildren();
    if (douyinHotBoardEl) douyinHotBoardEl.replaceChildren();
    return;
  }

  renderDouyinHotBoard();
  const picks = douyinPicks();
  renderDouyinVerificationSummary(picks);
  if (douyinPicksMetaEl) {
    douyinPicksMetaEl.textContent = picks.length
      ? DOUYIN_UI.meta
          .replace("{n}", String(picks.length))
          .replace("{round}", String((Number(state.douyinPickRound) || 0) % DOUYIN_PICK_ROUNDS + 1))
          .replace("{rounds}", String(DOUYIN_PICK_ROUNDS))
      : DOUYIN_UI.loading;
  }
  if (douyinPicksRefreshBtnEl) douyinPicksRefreshBtnEl.disabled = picks.length < 2;
  douyinPicksListEl.replaceChildren();

  if (!picks.length) {
    const empty = document.createElement("p");
    empty.className = "douyin-picks-empty";
    empty.textContent = DOUYIN_UI.empty;
    douyinPicksListEl.appendChild(empty);
    return;
  }

  picks.forEach((pick, index) => {
    const card = document.createElement("article");
    card.className = "douyin-pick-card";
    card.dataset.bucket = pick.bucketId;

    const rank = document.createElement("span");
    rank.className = "douyin-pick-rank";
    rank.textContent = String(index + 1).padStart(2, "0");

    const body = document.createElement("div");
    body.className = "douyin-pick-body";

    const top = document.createElement("div");
    top.className = "douyin-pick-top";
    const bucket = document.createElement("span");
    bucket.className = "douyin-pick-bucket";
    bucket.textContent = DOUYIN_BUCKET_BY_ID[pick.bucketId]?.label || pick.bucketId;
    const factBadge = document.createElement("span");
    factBadge.className = `douyin-fact-badge claim-${pick.fact.status}`;
    factBadge.textContent = pick.fact.label;
    const hotBadge = document.createElement("span");
    hotBadge.className = `douyin-hot-badge ${pick.hotMatch.directMatch ? "hot-hit" : pick.hotMatch.adjacentMatch ? "hot-adjacent" : "hot-miss"}`;
    hotBadge.textContent = pick.hotMatch.directMatch
      ? `${DOUYIN_UI.hotDirect} #${pick.hotMatch.bestItem?.position || "-"}`
      : pick.hotMatch.adjacentMatch
        ? DOUYIN_UI.hotAdjacent
        : DOUYIN_UI.hotMiss;
    hotBadge.title = pick.hotMatch.matchedWords.length
      ? `关联热榜词：${pick.hotMatch.matchedWords.join(" / ")}`
      : DOUYIN_UI.hotDisclaimer;
    const potential = document.createElement("span");
    potential.className = "douyin-pick-potential";
    potential.textContent = `${DOUYIN_UI.potential} ${pick.score}`;
    potential.title = DOUYIN_UI.scoreNote;
    top.append(bucket, factBadge, hotBadge, potential);

    const title = document.createElement("a");
    title.className = "douyin-pick-title";
    title.href = pick.url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = pick.title;

    const angle = document.createElement("p");
    angle.className = "douyin-pick-angle";
    const angleLabel = document.createElement("strong");
    angleLabel.textContent = `${DOUYIN_UI.angleLabel}：`;
    angle.append(angleLabel, document.createTextNode(DOUYIN_BUCKET_BY_ID[pick.bucketId]?.angle || ""));

    const tags = document.createElement("div");
    tags.className = "douyin-pick-tags";
    pick.tags.forEach((tagText) => {
      const tag = document.createElement("span");
      tag.textContent = tagText;
      tags.appendChild(tag);
    });

    const platformScore = document.createElement("div");
    platformScore.className = "douyin-platform-score";
    const factScore = document.createElement("span");
    factScore.textContent = `事实 ${pick.factScore}`;
    const trafficScore = document.createElement("span");
    trafficScore.className = pick.hotMatch.directMatch ? "traffic-hot" : "";
    trafficScore.textContent = `热度 ${pick.trafficScore}`;
    const gate = document.createElement("span");
    gate.className = `douyin-gate ${pick.factGate ? "gate-pass" : "gate-fail"}`;
    gate.textContent = pick.factGate ? DOUYIN_UI.factGatePass : DOUYIN_UI.factGateFail;
    platformScore.append(factScore, trafficScore, gate);
    if (pick.hotMatch.matchedWords.length) {
      const matched = document.createElement("span");
      matched.className = "douyin-hot-matched";
      matched.textContent = `热榜词 ${pick.hotMatch.matchedWords.join(" / ")}`;
      platformScore.appendChild(matched);
    }

    const factors = document.createElement("div");
    factors.className = "douyin-score-breakdown";
    Object.entries(DOUYIN_UI.factors).forEach(([key, label]) => {
      const value = pick.breakdown.factors[key];
      const factor = document.createElement("span");
      factor.title = DOUYIN_UI.scoreNote;
      factor.textContent = `${label} ${value}`;
      factors.appendChild(factor);
    });
    const riskNote = document.createElement("p");
    riskNote.className = "douyin-risk-note";
    riskNote.textContent = pick.breakdown.risks.length
      ? `${DOUYIN_UI.riskLabel}：${pick.breakdown.risks.join(" · ")}`
      : DOUYIN_UI.scoreNote;

    const footer = document.createElement("div");
    footer.className = "douyin-pick-footer";
    const source = document.createElement("span");
    source.className = "douyin-pick-source";
    source.textContent = `${DOUYIN_UI.source} · ${pick.sourceName} · ${fmtUpdatedRelative(pick.latestMs)}`;
    const open = document.createElement("a");
    open.href = pick.fact.primarySourceUrl || pick.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = pick.fact.primarySourceUrl ? VERIFICATION_UI.openPrimary : DOUYIN_UI.open;
    footer.append(source, open);

    body.append(top, title, angle, tags, platformScore, factors, riskNote, footer);
    card.append(rank, body);
    douyinPicksListEl.appendChild(card);
  });
}

function curatedBoardsVisible() {
  return state.mode === "selected"
    && state.activeSection === "all"
    && !state.query.trim()
    && !state.siteFilter
    && !state.authorFilter
    && !state.officialOnly;
}

function safeCuratedUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderGithubRankings() {
  if (!githubRankingsWrapEl || !githubRankingListEl) return;
  const visible = curatedBoardsVisible();
  if (!state.githubRankings) {
    githubRankingsWrapEl.hidden = true;
    return;
  }
  githubRankingsWrapEl.hidden = !visible;
  if (papersAuthoritativeBtnEl) {
  papersAuthoritativeBtnEl.addEventListener("click", () => {
    state.paperMode = "authoritative";
    state.paperCategory = "all";
    state.papersVisibleCount = 12;
    renderPapers();
  });
}

if (papersHotBtnEl) {
  papersHotBtnEl.addEventListener("click", () => {
    state.paperMode = "hot";
    state.papersVisibleCount = 10;
    renderPapers();
  });
}

if (githubWeeklyBtnEl) {
    githubWeeklyBtnEl.classList.toggle("active", state.githubRankingPeriod === "weekly");
    githubWeeklyBtnEl.setAttribute("aria-pressed", state.githubRankingPeriod === "weekly" ? "true" : "false");
  }
  if (githubMonthlyBtnEl) {
    githubMonthlyBtnEl.classList.toggle("active", state.githubRankingPeriod === "monthly");
    githubMonthlyBtnEl.setAttribute("aria-pressed", state.githubRankingPeriod === "monthly" ? "true" : "false");
  }
  if (!visible) return;

  const payload = state.githubRankings;
  const period = payload.periods?.[state.githubRankingPeriod] || payload.periods?.weekly;
  const items = Array.isArray(period?.items) ? period.items : [];
  const periodLabel = state.githubRankingPeriod === "monthly" ? "月热榜" : "周热榜";
  if (githubRankingMetaEl) {
    githubRankingMetaEl.textContent = items.length
      ? `${periodLabel} · TOP ${items.length} · GitHub 官方数据 · 更新 ${fmtTime(payload.generated_at)}`
      : "GitHub 热榜数据暂时不可用";
  }
  githubRankingListEl.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "curated-board-empty";
    empty.textContent = "当前周期暂无 GitHub Trending 数据。";
    githubRankingListEl.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const url = safeCuratedUrl(item.url);
    if (!url) return;
    const row = document.createElement("article");
    row.className = "github-rank-row";

    const rank = document.createElement("span");
    rank.className = "github-rank-number";
    rank.textContent = String(index + 1).padStart(2, "0");

    const body = document.createElement("div");
    body.className = "github-rank-body";

    const top = document.createElement("div");
    top.className = "github-rank-top";
    const repoLink = document.createElement("a");
    repoLink.className = "github-repo-link";
    repoLink.href = url;
    repoLink.target = "_blank";
    repoLink.rel = "noopener noreferrer";
    repoLink.textContent = item.full_name || item.repo || "GitHub repository";
    const star = document.createElement("span");
    star.className = "github-period-stars";
    star.textContent = `+${fmtNumber(Number(item.period_stars) || 0)} ${state.githubRankingPeriod === "monthly" ? "本月" : "本周"} Star`;
    top.append(repoLink, star);

    const description = document.createElement("p");
    description.className = "github-repo-description";
    description.textContent = item.description || "暂无仓库简介";

    const meta = document.createElement("div");
    meta.className = "github-repo-meta";
    if (item.language) {
      const language = document.createElement("span");
      language.textContent = item.language;
      meta.appendChild(language);
    }
    const totalStars = document.createElement("span");
    totalStars.textContent = `总 Star ${item.total_stars == null ? "--" : fmtNumber(Number(item.total_stars))}`;
    meta.appendChild(totalStars);
    const source = document.createElement("span");
    source.textContent = "GitHub 官方 Trending";
    meta.appendChild(source);

    body.append(top, description, meta);
    row.append(rank, body);
    githubRankingListEl.appendChild(row);
  });
}

const AUTHORITY_CATEGORY_LABELS = {
  viewpoint: "观点 / 研究",
  interview: "访谈",
  conference: "会议",
};

function renderAuthorityVoices() {
  if (!authorityVoicesWrapEl || !authorityVoicesListEl) return;
  const visible = curatedBoardsVisible();
  if (!state.authorityVoices) {
    authorityVoicesWrapEl.hidden = true;
    return;
  }
  authorityVoicesWrapEl.hidden = !visible;
  if (!visible) return;

  const payload = state.authorityVoices;
  const allItems = (Array.isArray(payload.items) ? payload.items : []).filter((item) => item && safeCuratedUrl(item.url));
  const filtered = state.authorityFilter === "all"
    ? allItems
    : allItems.filter((item) => item.category === state.authorityFilter);
  if (authorityVoicesMetaEl) {
    authorityVoicesMetaEl.textContent = `${Number(payload.window_days) || 90} 天 · ${allItems.length} 条 · ${Number(payload.ok_source_count) || 0}/${Number(payload.source_count) || 0} 来源可用 · ${fmtTime(payload.generated_at)}`;
  }
  document.querySelectorAll("[data-authority-filter]").forEach((button) => {
    const active = button.dataset.authorityFilter === state.authorityFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  authorityVoicesListEl.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "curated-board-empty";
    empty.textContent = "当前分类暂无符合来源与时间要求的内容。";
    authorityVoicesListEl.appendChild(empty);
    return;
  }

  const limit = Math.max(4, Number(state.authorityVisibleCount) || 8);
  filtered.slice(0, limit).forEach((item) => {
    const url = safeCuratedUrl(item.url);
    const card = document.createElement("article");
    card.className = "authority-voice-card";
    card.dataset.category = item.category || "viewpoint";

    const top = document.createElement("div");
    top.className = "authority-voice-top";
    const category = document.createElement("span");
    category.className = `authority-category category-${item.category || "viewpoint"}`;
    category.textContent = AUTHORITY_CATEGORY_LABELS[item.category] || "观点 / 研究";
    const trust = document.createElement("span");
    trust.className = "authority-trust";
    trust.textContent = item.trust_label || "来源原文";
    if (item.verification) trust.title = item.verification;
    top.append(category, trust);
    if (item.is_opinion) {
      const opinion = document.createElement("span");
      opinion.className = "authority-opinion";
      opinion.textContent = "观点，非事实结论";
      top.appendChild(opinion);
    }

    const title = document.createElement("a");
    title.className = "authority-voice-title";
    title.href = url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = item.title || "未命名内容";

    const summary = document.createElement("p");
    summary.className = "authority-voice-summary";
    summary.textContent = item.summary || "";
    summary.hidden = !item.summary;

    const footer = document.createElement("div");
    footer.className = "authority-voice-footer";
    const source = document.createElement("span");
    source.textContent = `${item.source_name || "来源"} · ${fmtTime(item.published_at)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "查看原文 ↗";
    footer.append(source, link);

    card.append(top, title, summary, footer);
    authorityVoicesListEl.appendChild(card);
  });

  if (filtered.length > limit) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "authority-more-btn";
    more.textContent = `展开更多 ${filtered.length - limit} 条`;
    more.addEventListener("click", () => {
      state.authorityVisibleCount = limit + 8;
      renderAuthorityVoices();
    });
    authorityVoicesListEl.appendChild(more);
  }
}
function renderPaperCategoryFilters(categories) {
  if (!paperCategoryFiltersEl) return;
  paperCategoryFiltersEl.replaceChildren();
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `paper-category-btn ${state.paperCategory === "all" ? "active" : ""}`;
  allButton.textContent = "全部";
  allButton.setAttribute("aria-pressed", state.paperCategory === "all" ? "true" : "false");
  allButton.addEventListener("click", () => {
    state.paperCategory = "all";
    state.papersVisibleCount = 12;
    renderPapers();
  });
  paperCategoryFiltersEl.appendChild(allButton);
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `paper-category-btn ${state.paperCategory === category ? "active" : ""}`;
    button.textContent = category;
    button.setAttribute("aria-pressed", state.paperCategory === category ? "true" : "false");
    button.addEventListener("click", () => {
      state.paperCategory = category;
      state.papersVisibleCount = 12;
      renderPapers();
    });
    paperCategoryFiltersEl.appendChild(button);
  });
}

function renderPapers() {
  if (!papersWrapEl || !papersListEl) return;
  const visible = curatedBoardsVisible();
  if (!state.papers) {
    papersWrapEl.hidden = true;
    return;
  }
  papersWrapEl.hidden = !visible;
  if (!visible) return;

  const payload = state.papers;
  const authoritativeMode = state.paperMode !== "hot";
  if (papersAuthoritativeBtnEl) {
    papersAuthoritativeBtnEl.classList.toggle("active", authoritativeMode);
    papersAuthoritativeBtnEl.setAttribute("aria-pressed", authoritativeMode ? "true" : "false");
  }
  if (papersHotBtnEl) {
    papersHotBtnEl.classList.toggle("active", !authoritativeMode);
    papersHotBtnEl.setAttribute("aria-pressed", !authoritativeMode ? "true" : "false");
  }

  const authoritativeItems = Array.isArray(payload.authoritative?.items) ? payload.authoritative.items : [];
  const categories = Array.from(new Set(authoritativeItems.map((item) => item.category).filter(Boolean)));
  const filteredAuthoritative = state.paperCategory === "all"
    ? authoritativeItems
    : authoritativeItems.filter((item) => item.category === state.paperCategory);
  const hotItems = Array.isArray(payload.hot?.items) ? payload.hot.items : [];
  if (paperCategoryFiltersEl) paperCategoryFiltersEl.hidden = !authoritativeMode;
  if (authoritativeMode) renderPaperCategoryFilters(categories);

  if (papersMetaEl) {
    papersMetaEl.textContent = authoritativeMode
      ? `权威里程碑 ${authoritativeItems.length} 篇 · 不限年代 · 更新 ${fmtTime(payload.generated_at)}`
      : `最新热议 ${hotItems.length} 篇 · 近 ${Number(payload.hot?.window_days) || 21} 天 · Hugging Face Daily Papers · 更新 ${fmtTime(payload.generated_at)}`;
  }

  papersListEl.replaceChildren();
  if (authoritativeMode) {
    if (!filteredAuthoritative.length) {
      const empty = document.createElement("p");
      empty.className = "curated-board-empty";
      empty.textContent = "当前分类暂无论文。";
      papersListEl.appendChild(empty);
      return;
    }
    const limit = Math.max(6, Number(state.papersVisibleCount) || 12);
    filteredAuthoritative.slice(0, limit).forEach((paper, index) => {
      const url = safeCuratedUrl(paper.url);
      if (!url) return;
      const card = document.createElement("article");
      card.className = "paper-card paper-authoritative";
      const top = document.createElement("div");
      top.className = "paper-card-top";
      const category = document.createElement("span");
      category.className = "paper-category-badge";
      category.textContent = paper.category || "权威论文";
      const year = document.createElement("span");
      year.className = "paper-year";
      year.textContent = String(paper.year || "");
      const venue = document.createElement("span");
      venue.className = "paper-venue";
      venue.textContent = paper.venue || "原始论文";
      top.append(category, year, venue);
      const title = document.createElement("a");
      title.className = "paper-title";
      title.href = url;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
      title.textContent = paper.title || "未命名论文";
      const why = document.createElement("p");
      why.className = "paper-why";
      why.textContent = paper.why || "";
      const footer = document.createElement("div");
      footer.className = "paper-footer";
      const rank = document.createElement("span");
      rank.textContent = `#${index + 1}`;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "查看原始论文 ↗";
      footer.append(rank, link);
      card.append(top, title, why, footer);
      papersListEl.appendChild(card);
    });
    if (filteredAuthoritative.length > limit) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "paper-more-btn";
      more.textContent = `展开更多 ${filteredAuthoritative.length - limit} 篇`;
      more.addEventListener("click", () => {
        state.papersVisibleCount = limit + 12;
        renderPapers();
      });
      papersListEl.appendChild(more);
    }
    return;
  }

  if (!hotItems.length) {
    const empty = document.createElement("p");
    empty.className = "curated-board-empty";
    empty.textContent = "当前暂无最新热议论文数据。";
    papersListEl.appendChild(empty);
    return;
  }
  hotItems.forEach((paper, index) => {
    const url = safeCuratedUrl(paper.url);
    if (!url) return;
    const discussionUrl = safeCuratedUrl(paper.discussion_url);
    const card = document.createElement("article");
    card.className = "paper-card paper-hot";
    const top = document.createElement("div");
    top.className = "paper-card-top";
    const rank = document.createElement("span");
    rank.className = "paper-hot-rank";
    rank.textContent = `HOT ${String(index + 1).padStart(2, "0")}`;
    const upvotes = document.createElement("span");
    upvotes.className = "paper-hot-stat";
    upvotes.textContent = `▲ ${Number(paper.upvotes) || 0}`;
    const comments = document.createElement("span");
    comments.className = "paper-hot-stat";
    comments.textContent = `💬 ${Number(paper.comments) || 0}`;
    const date = document.createElement("span");
    date.className = "paper-venue";
    date.textContent = fmtTime(paper.published_at);
    top.append(rank, upvotes, comments, date);
    const title = document.createElement("a");
    title.className = "paper-title";
    title.href = url;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = paper.title || "未命名论文";
    const authors = document.createElement("p");
    authors.className = "paper-authors";
    const authorList = Array.isArray(paper.authors) ? paper.authors : [];
    authors.textContent = authorList.length
      ? `作者：${authorList.slice(0, 5).join("、")}${authorList.length > 5 ? " 等" : ""}`
      : "作者信息以 arXiv 原文为准";
    const summary = document.createElement("p");
    summary.className = "paper-summary";
    summary.textContent = paper.summary || "";
    summary.hidden = !paper.summary;
    const keywords = document.createElement("div");
    keywords.className = "paper-keywords";
    (Array.isArray(paper.keywords) ? paper.keywords.slice(0, 6) : []).forEach((keyword) => {
      const tag = document.createElement("span");
      tag.textContent = keyword;
      keywords.appendChild(tag);
    });
    const footer = document.createElement("div");
    footer.className = "paper-footer";
    const source = document.createElement("span");
    source.textContent = `arXiv ${paper.id || ""}`;
    const arxivLink = document.createElement("a");
    arxivLink.href = url;
    arxivLink.target = "_blank";
    arxivLink.rel = "noopener noreferrer";
    arxivLink.textContent = "arXiv 原文 ↗";
    footer.append(source, arxivLink);
    if (discussionUrl) {
      const discussionLink = document.createElement("a");
      discussionLink.href = discussionUrl;
      discussionLink.target = "_blank";
      discussionLink.rel = "noopener noreferrer";
      discussionLink.textContent = "讨论页 ↗";
      footer.appendChild(discussionLink);
    }
    card.append(top, title, authors, summary, keywords, footer);
    papersListEl.appendChild(card);
  });
}
// ---- 主列表数据池：精选模式=mergedStories() 全量（纯时间倒序），全量模式=原始条目池 ----

function mainListStoriesBase() {
  return mergedStories().filter((story) =>
    (!state.officialOnly || storyIsFirstParty(story)) &&
    storyMatchesSiteFilter(story) && storyMatchesQuery(story));
}

function mainListRawItemsBase() {
  const q = state.query.trim().toLowerCase();
  return effectiveAllItems().filter((item) => {
    if (state.officialOnly && !isFirstPartyItem(item)) return false;
    if (state.siteFilter && item.site_id !== state.siteFilter) return false;
    if (state.authorFilter && itemXAuthor(item) !== state.authorFilter) return false;
    if (!q) return true;
    return itemHaystack(item).includes(q);
  });
}

function mainListStories() {
  return mainListStoriesBase().filter((story) => storyMatchesSection(story));
}

function mainListRawItems() {
  return mainListRawItemsBase().filter((item) => itemMatchesSection(item));
}

// 故事 → 统一行模型（供 renderItemNode 消费）：代表条目 + 全部信源信号 + 故事引用
function storyToRow(story, index = 0) {
  const enrichStoryItem = (entry) => ({
    ...entry,
    site_name: entry.site_name || entry.source_name || story.source_name || "",
  });
  const item = enrichStoryItem(storyRepresentativeItem(story) || story);
  const sourceItems = [
    item,
    ...(Array.isArray(story.sources) ? story.sources.map(enrichStoryItem) : []),
  ].filter(Boolean);
  const sourceSignals = Array.from(new Set(sourceItems.map(sourceSignal)));
  return {
    item,
    index,
    story,
    rows: sourceItems.map((sourceItem) => ({ item: sourceItem })),
    sourceSignals,
    sourceCount: storySourceCount(story),
    mergedCount: Math.max(1, Number(story.duplicate_count) || sourceItems.length),
    score: storyScore(story),
  };
}

// 原始条目 → 统一行模型：无故事引用，渲染时优雅降级（不展示精选徽章/分数/为什么重要）
function itemToRow(item, index = 0) {
  return {
    item,
    index,
    story: null,
    rows: [{ item }],
    sourceSignals: [sourceSignal(item)],
    sourceCount: 1,
    mergedCount: 1,
    score: 0,
  };
}

function mainListEntries() {
  if (state.mode === "all") {
    return mainListRawItems().map((item, index) => {
      const ms = timelineMs(item);
      return { row: itemToRow(item, index), timeMs: ms };
    }).sort((a, b) => b.timeMs - a.timeMs);
  }
  return mainListStories().map((story, index) => {
    const ms = storyTimeMs(story, "latest_at") || storyTimeMs(story, "earliest_at");
    return { row: storyToRow(story, index), timeMs: ms };
  }).sort((a, b) => b.timeMs - a.timeMs);
}

function dateGroupKey(ms) {
  if (!ms) return "unknown";
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dateGroupLabel(ms) {
  if (!ms) return t("common.unknownTime");
  const d = new Date(ms);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(LOCALE, sameYear
    ? { month: "long", day: "numeric" }
    : { year: "numeric", month: "long", day: "numeric" }).format(d);
}

function dateGroupWeekday(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(new Date(ms));
}

function itemSourceRefs(item, row = null) {
  const refs = [];
  const seen = new Set();
  const add = (label, tone) => {
    const clean = String(label || "").trim();
    if (!clean) return;
    const key = `${tone}:${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ label: clean, tone });
  };

  if (row && Array.isArray(row.sourceSignals) && row.sourceSignals.length) {
    row.sourceSignals.forEach((signal) => add(signal, sourceSignalTone(signal)));
  } else if (row && Array.isArray(row.rows) && row.rows.length) {
    row.rows.forEach((entry) => {
      const sourceItem = entry.item || {};
      const kind = sourceKind(sourceItem.site_id);
      add(sourceItem.source || sourceItem.site_name || kind.label, kind.tone);
    });
  } else {
    const kind = sourceKind(item.site_id);
    add(item.source || item.site_name || kind.label, kind.tone);
  }

  return refs.length ? refs : [{ label: t("common.source"), tone: "default" }];
}

function rowSourceCount(row) {
  const item = row.item || {};
  const refs = itemSourceRefs(item, row);
  const storyCount = row.story ? storySourceCount(row.story) : 0;
  return Math.max(1, refs.length, Number(row.sourceCount || 0), Number(row.mergedCount || 0), storyCount);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signalSummaryText(row) {
  const item = row.item || {};
  const story = row.story || {};
  const editorialSummary = itemSummaryText(item) || itemSummaryText(story.primary_item || {});
  if (editorialSummary) return editorialSummary;
  const reason = reasonText(item);
  if (reason && reason !== t("reason.default")) return reason.replace(new RegExp(`^${escapeRegExp(t("reason.signalsPrefix"))}`), t("reason.corePrefix"));
  return "";
}

// 只返回真实的、条目级别的推荐理由（item.recommend_reason_zh 或 story.primary_item.recommend_reason_zh）。
// 这类数据是预算受限的窄池，多数条目没有——没有真实理由时必须返回空字符串，
// 不再用分区/来源信号拼出通用模板句子（那类句子读起来像针对该条目的判断，实际是套话，参见调用方 renderItemNode 的隐藏逻辑）。
function whyImportantText(row) {
  const item = row.item || {};
  const story = row.story || {};
  // 英文版只认 en.reason，没有就返回空串（不显示 why-box），不回退中文
  const recommendReason = String(
    IS_EN
      ? (item.en?.reason || story.primary_item?.en?.reason || "")
      : (item.recommend_reason_zh || story.primary_item?.recommend_reason_zh || "")
  ).trim();
  return recommendReason;
}

function feedSummaryText(item) {
  const editorialSummary = itemSummaryText(item);
  if (editorialSummary) return editorialSummary;
  const signals = Array.isArray(item.ai_signals) ? item.ai_signals.filter(Boolean).slice(0, 2) : [];
  if (signals.length) return t("reason.clues", { signals: signals.join(" / ") });
  const reason = reasonText(item);
  if (reason && reason !== t("reason.default")) return reason.replace(new RegExp(`^${escapeRegExp(t("reason.signalsPrefix"))}`), t("reason.cluePrefix"));
  return "";
}

// 共享卡片组件：唯一渲染入口，主列表（精选/全量）共用同一基础变体。
// row.story 存在时展示精选徽章/分数/为什么重要/persona 面板；row.story 为空（全量原始条目）时优雅降级，跳过这些区块。
// 热点排行区改用 buildHotRow（单行行式渲染），不再走这个卡片模板。
function renderItemNode(row) {
  const node = itemTpl.content.firstElementChild.cloneNode(true);
  const item = row.item || {};

  const metaRow = node.querySelector(".meta-row");

  const curatedEl = node.querySelector(".curated-badge");
  const curatedRefs = [item, ...(row.story && Array.isArray(row.story.sources) ? row.story.sources : [])];
  const curated = (row.story && isStoryCurated(row.story)) || curatedRefs.some(isCuratedSourceRef);
  curatedEl.hidden = !curated;

  const siteEl = node.querySelector(".site");
  siteEl.textContent = item.source || item.site_name || "";

  const sourceEl = node.querySelector(".source");
  const tierInfo = sourceTierInfo(curatedRefs.find((ref) => isFirstPartyItem(ref)) || curatedRefs[0] || item);
  const tierEl = document.createElement("span");
  tierEl.className = `tier-badge tier-${String(tierInfo.tier || "other").replace(/[^a-z0-9_-]/g, "")}`;
  tierEl.textContent = tierInfo.label;
  sourceEl.insertAdjacentElement("beforebegin", tierEl);
  const sourceLabel = sourceSignal(item);
  setSourceBadge(sourceEl, sourceSignalLabel(sourceLabel), sourceSignalTone(sourceLabel), item.source ? t("item.sourceTitle", { source: item.source }) : "");
  if (rowSourceCount(row) > 1) {
    sourceEl.title = `${sourceEl.title || ""} · ${t("item.multiTotal", { n: rowSourceCount(row) })}`.replace(/^ · /, "");
  }

  // aihot 子来源 chip（X/公众号/HN/RSS）紧跟通道 chip（.source）之后，色调复用既有 .category.kind-* 规则，不新增样式。
  let metaAnchorEl = sourceEl;
  const aihotSub = aihotSubSource(item);
  if (aihotSub) {
    const subChip = document.createElement("span");
    subChip.className = `category kind-${AIHOT_SUB_TONES[aihotSub]}`;
    subChip.textContent = AIHOT_SUB_LABELS[aihotSub];
    metaAnchorEl.insertAdjacentElement("afterend", subChip);
    metaAnchorEl = subChip;
  }

  // 多源 chip：source_count>=2 时出现，紧跟通道/子来源 chip 之后，同时充当"同一事件"展开/收起触发器
  // （取代旧的独立 event-expand-toggle）。子列表挂在 news-card-body 末尾，首次点击才建 DOM，之后本地 toggle。
  if (row.story && storySourceCount(row.story) >= 2) {
    const bodyEl = node.querySelector(".news-card-body") || node;
    const eventCount = storySourceCount(row.story);
    const collapsedLabel = t("item.multiCollapsed", { n: eventCount });
    const expandedLabel = t("item.multiExpanded", { n: eventCount });
    const multiChip = document.createElement("button");
    multiChip.type = "button";
    multiChip.className = "multi-chip";
    multiChip.textContent = collapsedLabel;
    multiChip.setAttribute("aria-expanded", "false");
    let eventList = null;
    multiChip.addEventListener("click", () => {
      const expanded = multiChip.getAttribute("aria-expanded") === "true";
      if (expanded) {
        if (eventList) eventList.hidden = true;
        multiChip.setAttribute("aria-expanded", "false");
        multiChip.textContent = collapsedLabel;
        return;
      }
      if (!eventList) {
        eventList = buildEventSourceList(row);
        if (eventList) bodyEl.appendChild(eventList);
      }
      if (!eventList) return;
      eventList.hidden = false;
      multiChip.setAttribute("aria-expanded", "true");
      multiChip.textContent = expandedLabel;
    });
    metaAnchorEl.insertAdjacentElement("afterend", multiChip);
  }

  const scoreEl = node.querySelector(".score-badge");
  const displayScore = row.score;
  if (displayScore > 0) {
    scoreEl.hidden = false;
    scoreEl.textContent = t("item.score", { n: displayScore });
    scoreEl.className = `score-badge tone-${scoreTone(displayScore)}`;
  } else {
    scoreEl.hidden = true;
  }

  // 栏目 chip（行业/模型/产品...）是 meta-row 的最后一个 chip，appendChild 保证排在 score-badge 之后、
  // 在下面的"查看原文"链接（margin-left: auto 靠右）之前。
  const sectionId = itemSection(item);
  const sectionChip = itemTagChip(sectionBadgeLabel(sectionId), SECTION_TAG_TONES[sectionId] || "default");
  metaRow.appendChild(sectionChip);

  const titleEl = node.querySelector(".title");
  const displayTitle = row.story ? storyPrimaryTitleText(row.story) : itemTitleText(item);
  const originalTitle = row.story ? storyPrimaryEnText(row.story) : itemOriginalTitleText(item);
  titleEl.textContent = "";
  if (originalTitle) {
    const primary = document.createElement("span");
    primary.className = "title-primary";
    primary.textContent = displayTitle;
    const sub = document.createElement("span");
    sub.className = "title-sub";
    sub.textContent = originalTitle;
    titleEl.appendChild(primary);
    titleEl.appendChild(sub);
  } else {
    titleEl.textContent = displayTitle;
  }
  titleEl.href = item.url || row.story?.primary_url || row.story?.url || "#";

  const summaryEl = node.querySelector(".news-summary");
  if (summaryEl) {
    const summaryText = row.story ? signalSummaryText(row) : feedSummaryText(item);
    const normalizeForCompare = (value) => String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "");
    const normalizedSummary = normalizeForCompare(summaryText);
    const normalizedOriginal = normalizeForCompare(originalTitle);
    const duplicatesOriginal = Boolean(
      normalizedOriginal
      && normalizedSummary
      && normalizedSummary.length >= 12
      && (
        normalizedSummary === normalizedOriginal
        || normalizedSummary.includes(normalizedOriginal)
        || normalizedOriginal.includes(normalizedSummary)
      ),
    );
    summaryEl.textContent = summaryText;
    summaryEl.hidden = !summaryText || duplicatesOriginal;
  }

  renderFactBoundary(node, row.story);

  const whyBox = node.querySelector(".why-box");
  const whyText = row.story ? whyImportantText(row) : "";
  if (whyText) {
    whyBox.hidden = false;
    node.querySelector(".why-text").textContent = whyText;
  } else {
    whyBox.hidden = true;
  }

  const personaSlot = node.querySelector(".persona-slot");
  if (row.story && PERSONA_UI_ENABLED) {
    const personaEntry = findTop3PersonaEntry(row.story.story_id);
    const personaPanel = buildPersonaPanel(personaEntry);
    if (personaPanel) {
      // TOP3 三口味面板已含默认口味整列，再显示单条锐评行就是原句重复
      personaSlot.appendChild(personaPanel);
    } else {
      const personaLine = buildStoryPersonaLine(row.story);
      if (personaLine) personaSlot.appendChild(personaLine);
    }
  }

  const originalLink = node.querySelector(".news-card-footer .original-link") || document.createElement("a");
  originalLink.className = "original-link original-action";
  originalLink.href = item.url || row.story?.primary_url || row.story?.url || "#";
  originalLink.target = "_blank";
  originalLink.rel = "noopener noreferrer";
  originalLink.textContent = t("item.original");
  if (!originalLink.parentElement) metaRow.appendChild(originalLink);

  return node;
}

// 热点排行区：一行一条（rank + 标题链接 + 信源数 · 相对时间），不复用卡片模板——
// 避免和下方精选列表的完整卡片重复展示摘要/标签/为什么重要。
function buildHotRow(row, rank) {
  const item = row.item || {};
  const el = document.createElement("article");
  el.className = "hot-row";

  const topEl = document.createElement("div");
  topEl.className = "hot-row-top";

  const rankEl = document.createElement("span");
  rankEl.className = "hot-row-rank";
  rankEl.textContent = `#${rank}`;

  const curatedEl = document.createElement("span");
  curatedEl.className = "hot-row-curated";
  curatedEl.textContent = "精选";

  const metaEl = document.createElement("span");
  metaEl.className = "hot-row-meta";
  const sourceCount = rowSourceCount(row);
  const relTime = fmtUpdatedRelative(
    timelineMs(item) || storyTimeMs(row.story, "latest_at"),
    item.site_id === "producthunt" && item.recency_basis === "updated_at",
  );

  // 同一事件展开：热点卡的“N 个信源”仍可展开原始来源。
  const expandable = row.story && storySourceCount(row.story) >= 2;
  if (expandable) {
    const sourceToggle = document.createElement("button");
    sourceToggle.type = "button";
    sourceToggle.className = "hot-row-source-toggle";
    sourceToggle.textContent = t("hot.sources", { n: sourceCount });
    sourceToggle.setAttribute("aria-expanded", "false");
    let sourceList = null;
    sourceToggle.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (sourceList) {
        sourceList.remove();
        sourceList = null;
        sourceToggle.setAttribute("aria-expanded", "false");
        return;
      }
      sourceList = buildEventSourceList(row);
      if (!sourceList) return;
      sourceList.classList.add("hot-row-source-list");
      sourceToggle.setAttribute("aria-expanded", "true");
      el.insertAdjacentElement("afterend", sourceList);
    });
    const sep = document.createElement("span");
    sep.textContent = "·";
    const timeEl = document.createElement("span");
    timeEl.textContent = relTime;
    metaEl.append(sourceToggle, sep, timeEl);
  } else {
    metaEl.textContent = `${t("hot.sources", { n: sourceCount })} · ${relTime}`;
  }
  topEl.append(rankEl, curatedEl, metaEl);

  const titleEl = document.createElement("a");
  titleEl.className = "hot-row-title";
  titleEl.target = "_blank";
  titleEl.rel = "noopener noreferrer";
  const displayTitle = row.story ? storyPrimaryTitleText(row.story) : itemTitleText(item);
  titleEl.textContent = displayTitle;
  titleEl.title = displayTitle;
  titleEl.href = safeCuratedUrl(item.url || row.story?.primary_url || row.story?.url || "") || "#";

  const summaryEl = document.createElement("p");
  summaryEl.className = "hot-row-summary";
  const summaryText = row.story ? signalSummaryText(row) : feedSummaryText(item);
  summaryEl.textContent = summaryText;
  summaryEl.hidden = !summaryText;

  const footerEl = document.createElement("div");
  footerEl.className = "hot-row-footer";
  const sourceEl = document.createElement("span");
  sourceEl.className = "hot-row-source";
  sourceEl.textContent = item.source || item.site_name || "来源";
  const originalEl = document.createElement("a");
  originalEl.href = titleEl.href;
  originalEl.target = "_blank";
  originalEl.rel = "noopener noreferrer";
  originalEl.textContent = t("item.original");
  footerEl.append(sourceEl, originalEl);

  el.append(topEl, titleEl, summaryEl, footerEl);
  return el;
}

function renderLoadingNotice(label, count) {
  const loading = document.createElement("div");
  loading.className = "list-loading";
  loading.textContent = t("list.loading", { label, n: count });
  newsListEl.appendChild(loading);
}

function addLoadMoreButton(parent, label, onClick) {
  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "list-more-btn";
  moreBtn.textContent = label;
  moreBtn.addEventListener("click", onClick);
  parent.appendChild(moreBtn);
  return moreBtn;
}

// Mobile-safe async rendering: avoid blocking the main thread on large lists.
// requestAnimationFrame 在后台标签页不触发，hidden 时降级 setTimeout，避免列表卡在加载态。
function scheduleRender(cb) {
  if (document.hidden) {
    setTimeout(cb, 0);
  } else {
    requestAnimationFrame(cb);
  }
}
let _renderListToken = 0;
const MAIN_LIST_PAGE_SIZE = 60;
state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;

// 主列表：纯时间倒序 + 按日期分组渲染，精选/全量两种模式共用同一套模板。
function renderMainList() {
  const entries = mainListEntries();
  resultCountEl.textContent = t("count.items", { n: entries.length });
  renderClearFiltersButton();
  if (modeHintEl) {
    modeHintEl.textContent = t("mode.hint", { mode: modeLabelText(), n: entries.length });
    modeHintEl.setAttribute("aria-label", t("mode.hintAria", { mode: modeLabelText(), n: entries.length }));
  }

  newsListEl.innerHTML = "";
  _renderListToken += 1;
  const token = _renderListToken;

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const title = document.createElement("h3");
    title.textContent = t("list.emptyTitle");
    const message = document.createElement("p");
    message.textContent = t("list.emptyMessage");
    empty.append(title, message);
    if (activeAdjustmentCount()) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "empty-reset-btn";
      reset.textContent = t("list.emptyReset");
      reset.addEventListener("click", clearAllFilters);
      empty.appendChild(reset);
    }
    newsListEl.appendChild(empty);
    return;
  }

  renderLoadingNotice(listTitleText(), entries.length);
  scheduleRender(() => {
    if (token !== _renderListToken) return;
    newsListEl.innerHTML = "";
    const visibleCount = Math.max(MAIN_LIST_PAGE_SIZE, state.mainListVisibleCount || MAIN_LIST_PAGE_SIZE);
    const visible = entries.slice(0, visibleCount);
    const dateGroupCounts = new Map();
    visible.forEach(({ timeMs }) => {
      const key = dateGroupKey(timeMs);
      dateGroupCounts.set(key, (dateGroupCounts.get(key) || 0) + 1);
    });
    let lastKey = null;
    const frag = document.createDocumentFragment();
    visible.forEach(({ row, timeMs }) => {
      const key = dateGroupKey(timeMs);
      if (key !== lastKey) {
        const header = document.createElement("div");
        header.className = "date-group-header";
        const dateLabel = document.createElement("span");
        dateLabel.textContent = dateGroupLabel(timeMs);
        header.appendChild(dateLabel);
        const weekday = dateGroupWeekday(timeMs);
        const count = dateGroupCounts.get(key) || 0;
        const meta = document.createElement("span");
        meta.className = "date-group-meta";
        meta.textContent = weekday ? `· ${weekday} · ${t("count.items", { n: count })}` : `· ${t("count.items", { n: count })}`;
        header.appendChild(meta);
        frag.appendChild(header);
        lastKey = key;
      }
      const timelineItem = document.createElement("div");
      timelineItem.className = "timeline-item";
      const rail = document.createElement("div");
      rail.className = "timeline-rail";
      const timeLabel = document.createElement("span");
      timeLabel.className = "timeline-time";
      timeLabel.textContent = fmtHHMM(timeMs);
      const dot = document.createElement("span");
      dot.className = "timeline-dot";
      rail.append(timeLabel, dot);
      timelineItem.appendChild(rail);
      const card = renderItemNode(row);
      const footerTime = card.querySelector(".news-card-time");
      if (footerTime) {
        footerTime.textContent = fmtHHMM(timeMs);
      } else {
        const cardTimeLabel = document.createElement("span");
        cardTimeLabel.className = "timeline-mobile-time";
        cardTimeLabel.textContent = fmtHHMM(timeMs);
        card.querySelector(".meta-row")?.prepend(cardTimeLabel);
      }
      timelineItem.appendChild(card);
      frag.appendChild(timelineItem);
    });
    newsListEl.appendChild(frag);
    if (entries.length > visible.length) {
      addLoadMoreButton(
        newsListEl,
        t("list.more", { n: entries.length - visible.length }),
        () => {
          state.mainListVisibleCount = visibleCount + MAIN_LIST_PAGE_SIZE;
          renderMainList();
        },
      );
    }
    document.dispatchEvent(new CustomEvent("aiRadar:listRendered"));
  });
}

function top3BoardEntries() {
  if (state.mode !== "selected") return [];
  const t3 = state.top3Personas?.items;
  if (!Array.isArray(t3) || !t3.length) return [];
  const byId = new Map(mergedStories().map((s) => [s.story_id, s]));
  return t3
    .slice()
    .sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0))
    .map((entry) => byId.get(entry?.story_id))
    .filter(Boolean)
    .map((story, index) => storyToRow(story, index));
}

// 今日 TOP3 板块：三口味并排锐评的固定展示入口。TOP3 卡片在主列表里按时间排序，
// 常沉在几屏之外（用户翻不到，面板等于隐身），所以命中 top3-personas.json 的故事在这里置顶再展示一次。
function renderTop3Board() {
  if (!top3BoardListEl) return;
  const rows = PERSONA_UI_ENABLED ? top3BoardEntries() : [];
  const show = rows.length > 0;
  if (top3BoardWrapEl) top3BoardWrapEl.hidden = !show;
  if (!show) return;
  if (top3BoardMetaEl) top3BoardMetaEl.textContent = Object.values(PERSONA_NAMES).join(" · ");
  top3BoardListEl.innerHTML = "";
  rows.forEach((row) => top3BoardListEl.appendChild(renderItemNode(row)));
}

// 热点排行区：不设固定条数，展示条数取决于当前有多少条满足多信源热度阈值（HOT_BOARD_LIMIT 只是技术兜底）。
function renderHotBoard() {
  renderTop3Board();
  renderDouyinPicks();
  renderGithubRankings();
  renderAuthorityVoices();
  renderPapers();
  if (!hotBoardListEl) return;
  const show = state.mode === "selected";
  if (hotBoardWrapEl) hotBoardWrapEl.hidden = !show;
  if (!show) return;
  hotBoardListEl.innerHTML = "";

  const rows = hotBoardEntries();
  if (hotBoardMetaEl) {
    hotBoardMetaEl.textContent = rows.length
      ? t("hot.meta", { n: rows.length })
      : t("hot.metaDefault");
  }

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "bole-empty";
    empty.textContent = t("hot.empty");
    hotBoardListEl.appendChild(empty);
    return;
  }

  rows.forEach((row, index) => {
    hotBoardListEl.appendChild(buildHotRow(row, index + 1));
  });
}

function rerenderCurrentView() {
  state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
  renderSectionTabs();
  renderModeSwitch();
  renderSiteFilters();
  renderHotBoard();
  if (state.waytoagiData) renderWaytoagi(state.waytoagiData);
  renderMainList();
}

function waytoagiViews(waytoagi) {
  const updates7d = Array.isArray(waytoagi?.updates_7d) ? waytoagi.updates_7d : [];
  const latestDate = waytoagi?.latest_date || (updates7d.length ? updates7d[0].date : null);
  const updatesToday = Array.isArray(waytoagi?.updates_today) && waytoagi.updates_today.length
    ? waytoagi.updates_today
    : (latestDate ? updates7d.filter((u) => u.date === latestDate) : []);
  return { updates7d, updatesToday, latestDate };
}

function renderWaytoagi(waytoagi) {
  // 内容 tab 已收敛为单层：WaytoAGI 面板跟随「社区」tab 显示（合并了原来源形态 cn 分组）
  // 英文版不展示 WaytoAGI（中文原生社区内容，不翻译），与自媒体区块同口径
  if (IS_EN) {
    if (waytoagiWrapEl) waytoagiWrapEl.hidden = true;
    return;
  }
  if (waytoagiWrapEl) {
    waytoagiWrapEl.hidden = state.activeSection !== "community";
  }
  if (state.activeSection !== "community") return;
  const { updates7d, updatesToday, latestDate } = waytoagiViews(waytoagi);
  if (waytoagiTodayBtnEl) waytoagiTodayBtnEl.classList.toggle("active", state.waytoagiMode === "today");
  if (waytoagi7dBtnEl) waytoagi7dBtnEl.classList.toggle("active", state.waytoagiMode === "7d");
  if (waytoagiTodayBtnEl) waytoagiTodayBtnEl.setAttribute("aria-pressed", state.waytoagiMode === "today" ? "true" : "false");
  if (waytoagi7dBtnEl) waytoagi7dBtnEl.setAttribute("aria-pressed", state.waytoagiMode === "7d" ? "true" : "false");
  waytoagiUpdatedAtEl.textContent = t("waytoagi.updatedAt", { time: fmtTime(waytoagi.generated_at) });

  waytoagiMetaEl.innerHTML = "";
  const rootLink = document.createElement("a");
  rootLink.href = waytoagi.root_url || "#";
  rootLink.target = "_blank";
  rootLink.rel = "noopener noreferrer";
  rootLink.textContent = t("waytoagi.root");
  const historyLink = document.createElement("a");
  historyLink.href = waytoagi.history_url || "#";
  historyLink.target = "_blank";
  historyLink.rel = "noopener noreferrer";
  historyLink.textContent = t("waytoagi.history");
  const todayCount = document.createElement("span");
  todayCount.textContent = t("waytoagi.today", { date: latestDate || "--", n: waytoagi.count_today || updatesToday.length });
  const weekCount = document.createElement("span");
  weekCount.textContent = t("waytoagi.week", { n: waytoagi.count_7d || updates7d.length });
  [rootLink, "·", historyLink, "·", todayCount, "·", weekCount].forEach((part) => {
    if (typeof part === "string") {
      const sep = document.createElement("span");
      sep.textContent = part;
      waytoagiMetaEl.appendChild(sep);
    } else {
      waytoagiMetaEl.appendChild(part);
    }
  });

  waytoagiListEl.innerHTML = "";
  if (waytoagi.has_error) {
    const div = document.createElement("div");
    div.className = "waytoagi-error";
    div.textContent = waytoagi.error || t("waytoagi.error");
    waytoagiListEl.appendChild(div);
    return;
  }

  const updates = state.waytoagiMode === "today" ? updatesToday : updates7d;
  if (!updates.length) {
    const div = document.createElement("div");
    div.className = "waytoagi-empty";
    div.textContent = state.waytoagiMode === "today"
      ? t("waytoagi.emptyToday")
      : (waytoagi.warning || t("waytoagi.empty7d"));
    waytoagiListEl.appendChild(div);
    return;
  }

  updates.forEach((u) => {
    const row = document.createElement("a");
    row.className = "waytoagi-item";
    row.href = u.url || "#";
    row.target = "_blank";
    row.rel = "noopener noreferrer";
    const dateEl = document.createElement("span");
    dateEl.className = "d";
    dateEl.textContent = fmtDate(u.date);
    const titleEl = document.createElement("span");
    titleEl.className = "t";
    titleEl.textContent = u.title;
    row.append(dateEl, titleEl);
    waytoagiListEl.appendChild(row);
  });
}

// 按 @handle 去重后的 X 作者列表：{ handle, display }，display 优先取 aihot 的
// "Name (@handle)" 富格式，没有的话退回 socialdata_x 的裸 handle。
function socialdataAuthors() {
  const byHandle = new Map();
  state.itemsAi.forEach((item) => {
    const handle = itemXAuthor(item);
    if (!handle) return;
    const display = itemXAuthorDisplay(item);
    if (!display) return;
    const isRich = item.site_id === "aihot";
    const existing = byHandle.get(handle);
    if (!existing || (isRich && !existing.rich)) {
      byHandle.set(handle, { handle, display, rich: isRich });
    }
  });
  return Array.from(byHandle.values())
    .map(({ handle, display }) => ({ handle, display }))
    .sort((a, b) => a.display.localeCompare(b.display, "en"));
}

function selectSocialdataAuthor(author) {
  state.authorFilter = author;
  // 作者身份现在横跨 socialdata_x 与 aihot-x 两个 site_id（见 itemXAuthor），
  // 不能再锁死 siteFilter="socialdata_x"，否则会把该作者的 aihot 转发条目过滤掉。
  // authorFilter 本身已经是跨站点的精确匹配，siteFilter 留空即可。
  state.siteFilter = "";
  // 博主筛选是条目级过滤：切到全量模式浏览该博主的原始条目池，并清空栏目选择
  state.activeSection = "all";
  state.mode = "all";
  state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
  state.xAuthorsExpanded = false;
  renderSectionTabs();
  renderModeSwitch();
  renderSiteFilters();
  renderHotBoard();
  renderMainList();
  renderSourceHealth();
  document.querySelector(".list-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSocialdataAuthorList(authors, itemCount) {
  const panel = document.createElement("section");
  panel.className = "health-author-list";
  const heading = document.createElement("div");
  heading.className = "health-author-list-title";
  heading.textContent = t("authors.title");
  const meta = document.createElement("div");
  meta.className = "health-author-list-meta";
  meta.textContent = t("authors.meta", { authors: authors.length, items: itemCount });
  const list = document.createElement("div");
  list.className = "health-author-list-items";
  authors.forEach(({ handle, display }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = display;
    item.title = t("authors.view", { name: display });
    item.addEventListener("click", () => selectSocialdataAuthor(handle));
    list.appendChild(item);
  });
  panel.append(heading, meta, list);
  return panel;
}

function renderSourceHealthSummaryNode(status, errorMessage = "") {
  const node = document.createElement("div");
  node.className = "source-health-summary";
  if (!status) {
    node.classList.add(errorMessage ? "bad" : "warn");
    node.innerHTML = `<strong>${errorMessage ? t("health.errorTitle") : t("health.missingTitle")}</strong><span>${errorMessage || t("health.waiting")}</span>`;
    return node;
  }
  const sites = Array.isArray(status.sites) ? status.sites : [];
  const okSites = Number(status.successful_sites || 0);
  const failed = failedSourceCount(status);
  // 与 renderSourceStatusTable 同口径：pooled = 全网抓取入池（去话题过滤前），
  // fetched = 原始抓取总量，aiRelevant = 24h AI 强相关合并池。
  const pooled = Number(status.items_before_topic_filter || state.totalAllMode || state.itemsAll.length || 0);
  const fetched = Number(status.fetched_raw_items || state.totalRaw || pooled || 0);
  const aiRelevant = safeItems(state.itemsAi).length;
  node.classList.toggle("warn", failed > 0);
  const segments = [];
  if (fetched) segments.push(t("health.collected", { n: fetched }));
  if (pooled) segments.push(t("health.pooled", { n: pooled }));
  if (aiRelevant) segments.push(t("health.relevant", { n: aiRelevant }));
  segments.push(failed > 0
    ? `<span class="source-health-fail-bad">${t("health.failed", { n: failed })}</span>`
    : t("health.failed", { n: failed }));
  node.innerHTML = `<strong>${t("status.ok", { ok: okSites, total: sites.length })}</strong><span>${segments.join(" · ")}</span>`;
  return node;
}

// Fallback tier ranks mirroring SOURCE_TIER_BY_SITE in scripts/update_news.py.
// Items carry source_tier_rank and that data-derived value wins; this table
// only covers sites with zero loaded items (rank otherwise unknowable).
const SITE_TIER_RANK_FALLBACK = {
  official_ai: 0,
  aibreakfast: 1,
  aihubtoday: 1,
  aibase: 1,
  aihot: 1,
  bestblogs: 1,
  curated_media: 2,
  waytoagi: 2,
  followbuilders: 2,
  opmlrss: 3,
  tikhub_douyin: 4,
  tikhub_xiaohongshu: 4,
  xapi: 4,
  socialdata_x: 4,
  techurls: 5,
  buzzing: 5,
  iris: 5,
  zeli: 5,
  hackernews: 5,
  newsnow: 5,
};

function siteTierRankMap() {
  // source_tier_rank ships on every pipeline item (items_ai / items_all);
  // aggregate one rank per site from whatever is loaded so the source table
  // can sort official tiers first without a duplicated constant table.
  const m = new Map();
  const pools = [safeItems(state.itemsAi), safeItems(state.itemsAll), safeItems(state.itemsAllRaw)];
  pools.forEach((items) => {
    items.forEach((item) => {
      if (!item || !item.site_id || m.has(item.site_id)) return;
      const rank = Number(item.source_tier_rank);
      if (Number.isFinite(rank)) m.set(item.site_id, rank);
    });
  });
  return m;
}

function renderSourceStatusTable(status) {
  if (!sourceStatusTableEl) return;
  sourceStatusTableEl.innerHTML = "";
  if (!status || !Array.isArray(status.sites) || !status.sites.length) return;

  const tierRanks = siteTierRankMap();
  const rows = status.sites
    .filter((site) => !(IS_EN && (site.site_id === "tikhub_douyin" || site.site_id === "tikhub_xiaohongshu")))
    .map((site) => {
      const ai = aiSiteStat(site.site_id);
      const aiCount = Number(ai?.count || 0);
      const rawCount = Number(ai?.raw_count ?? site.item_count ?? 0);
      const scanned = Number(site.item_count || rawCount || 0);
      const ratioBase = rawCount || scanned;
      const ratio = ratioBase ? Math.round((aiCount / ratioBase) * 100) : 0;
      const tierRank = tierRanks.has(site.site_id)
        ? tierRanks.get(site.site_id)
        : (SITE_TIER_RANK_FALLBACK[site.site_id] ?? 9);
      return { ...site, aiCount, rawCount: ratioBase, ratio, tierRank };
    })
    .sort((a, b) =>
      a.tierRank - b.tierRank
      || b.ratio - a.ratio
      || b.aiCount - a.aiCount
      || String(a.site_name).localeCompare(String(b.site_name), LOCALE));

  const table = document.createElement("div");
  table.className = "source-table";
  const header = document.createElement("div");
  header.className = "source-table-row source-table-head";
  header.innerHTML = `<span>${t("common.source")}</span><span>${t("table.aiRaw")}</span><span>${t("table.aiRatio")}</span><span>${t("table.status")}</span>`;
  table.appendChild(header);
  rows.forEach((site) => {
    const row = document.createElement("div");
    row.className = "source-table-row";
    const statusText = site.ok ? t("table.ok") : t("table.bad");
    row.innerHTML = `
      <span>${site.site_name || site.site_id}</span>
      <span>${fmtNumber(site.aiCount)} / ${fmtNumber(site.rawCount)}</span>
      <span>${fmtNumber(site.ratio)}%</span>
      <span class="${site.ok ? "ok" : "bad"}">${statusText}</span>
    `;
    table.appendChild(row);
  });
  const foot = document.createElement("div");
  foot.className = "source-table-row source-table-foot";
  foot.textContent = t("table.total", { n: rows.length });
  table.appendChild(foot);
  sourceStatusTableEl.appendChild(table);
}

// 可选接入未启用/未配置的提示行 + 替换/跳过 RSS 计数（非零才显示）。
// X 数据源已入池的数量在 source-table 的 SocialData X 行可见，这里不重复。
function renderOfficialCoverage(status) {
  const coverage = status?.official_coverage;
  const providers = Array.isArray(coverage?.providers) ? coverage.providers : [];
  if (!providers.length) return null;
  const details = document.createElement("details");
  details.className = "official-coverage-panel";
  const summary = document.createElement("summary");
  const active = Number(coverage.active_count || 0);
  const configured = Number(coverage.configured_count || 0);
  const gaps = Number(coverage.gap_count || 0);
  summary.textContent = IS_EN
    ? `Official source coverage · ${active}/${configured} active · ${gaps} gaps`
    : `官方源覆盖矩阵 · ${active}/${configured} 当前有内容 · ${gaps} 个缺口`;
  details.appendChild(summary);

  const intro = document.createElement("p");
  intro.textContent = IS_EN
    ? "Active means an official item is present in the latest snapshot. Connected sources with no recent items are deliberately not presented as active coverage."
    : "“当前有内容”只表示最新快照中出现了该官方条目；“已连接但近期无内容”和“未配置”会分开显示，不把配置当成已有事实。";
  details.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "official-coverage-grid";
  providers.forEach((provider) => {
    const row = document.createElement("div");
    row.className = `official-coverage-item coverage-${provider.status}`;
    const head = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = provider.provider || provider.id;
    const badge = document.createElement("span");
    badge.textContent = provider.status === "active"
      ? (IS_EN ? `Active ${provider.current_official_items}` : `有内容 ${provider.current_official_items}`)
      : provider.status === "connected_no_recent"
        ? (IS_EN ? "No recent item" : "近期无条目")
        : (IS_EN ? "Not configured" : "未配置");
    head.append(name, badge);
    const meta = document.createElement("small");
    meta.textContent = provider.discovery || "";
    row.append(head, meta);
    if (provider.official_url) {
      const link = document.createElement("a");
      link.href = provider.official_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = IS_EN ? "Official page ↗" : "官网入口 ↗";
      row.appendChild(link);
    }
    grid.appendChild(row);
  });
  details.appendChild(grid);
  return details;
}

function sourceHealthHintNode(status) {
  const rss = status.rss_opml || {};
  const agentmail = status.agentmail || {};
  const replacedFeeds = Array.isArray(rss.replaced_feeds) ? rss.replaced_feeds : [];
  const skippedFeeds = Array.isArray(rss.skipped_feeds) ? rss.skipped_feeds : [];

  const optionalBits = [];
  if (!rss.enabled) optionalBits.push(t("hint.rssOff"));
  if (!agentmail.enabled) optionalBits.push(t("hint.agentmailOff"));

  const parts = [];
  if (optionalBits.length) parts.push(t("hint.optional", { items: optionalBits.join(" · ") }));
  if (replacedFeeds.length || skippedFeeds.length) {
    parts.push(t("hint.replaced", { a: replacedFeeds.length, b: skippedFeeds.length }));
  }
  if (!parts.length) return null;

  const node = document.createElement("div");
  node.className = "source-health-hint";
  node.textContent = parts.join(" · ");
  return node;
}

function renderSourceHealth(errorMessage = "") {
  if (!sourceHealthEl) return;
  sourceHealthEl.innerHTML = "";
  if (sourceHealthDetailsEl) sourceHealthDetailsEl.innerHTML = "";
  if (sourceStatusTableEl) sourceStatusTableEl.innerHTML = "";

  const status = state.sourceStatus;
  if (!status) {
    sourceHealthEl.appendChild(renderSourceHealthSummaryNode(null, errorMessage));
    renderSourceStatusPill(errorMessage);
    renderClearFiltersButton();
    return;
  }

  sourceHealthEl.appendChild(renderSourceHealthSummaryNode(status, errorMessage));
  const detailTarget = sourceHealthDetailsEl || sourceHealthEl;

  const hint = sourceHealthHintNode(status);
  if (hint) detailTarget.appendChild(hint);

  const coveragePanel = renderOfficialCoverage(status);
  if (coveragePanel) detailTarget.appendChild(coveragePanel);

  // X 博主展开列表：功能保留，从已删除的 mini-card 挪到提示行下方的小链接。
  const xAuthors = socialdataAuthors();
  if (xAuthors.length) {
    // 与 socialdataAuthors() 同口径的客户端计数：socialdata_x 原生条目 + aihot 转发的 X 条目
    const socialdataDisplayCount = state.itemsAi.filter((item) => itemXAuthor(item)).length;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "source-health-authors-toggle";
    toggle.setAttribute("aria-expanded", String(Boolean(state.xAuthorsExpanded)));
    toggle.textContent = state.xAuthorsExpanded
      ? t("authors.collapse")
      : t("authors.expand", { n: xAuthors.length });
    toggle.addEventListener("click", () => {
      state.xAuthorsExpanded = !state.xAuthorsExpanded;
      renderSourceHealth();
    });
    detailTarget.appendChild(toggle);

    if (state.xAuthorsExpanded) {
      detailTarget.appendChild(renderSocialdataAuthorList(xAuthors, socialdataDisplayCount));
    }
  }

  renderSourceStatusTable(status);
  renderSourceStatusPill(errorMessage);
  renderClearFiltersButton();
}

async function loadNewsData() {
  const res = await fetch(`${dataUrl("data/latest-24h.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "latest-24h.json", status: res.status }));
  return res.json();
}

async function loadAllModeData() {
  if (state.allDataLoaded) return;
  if (!state.allDataPromise) {
    state.allDataPromise = fetch(`${dataUrl(state.allDataUrl)}?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error(t("error.load", { file: "latest-24h-all.json", status: res.status }));
        return res.json();
      })
      .then((payload) => {
        state.itemsAllRaw = payload.items_all_raw || payload.items_all || state.itemsAi;
        state.itemsAll = payload.items_all || state.itemsAi;
        state.totalRaw = payload.total_items_raw || state.itemsAllRaw.length;
        state.totalAllMode = payload.total_items_all_mode || state.itemsAll.length;
        state.allDataLoaded = true;
      })
      .catch((err) => {
        state.allDataPromise = null;
        throw err;
      });
  }
  return state.allDataPromise;
}

async function loadWaytoagiData() {
  const res = await fetch(`${dataUrl("data/waytoagi-7d.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "waytoagi-7d.json", status: res.status }));
  return res.json();
}

async function loadSourceStatusData() {
  const res = await fetch(`${dataUrl("data/source-status.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "source-status.json", status: res.status }));
  return res.json();
}

async function loadDailyBriefData() {
  const res = await fetch(`${dataUrl("data/daily-brief.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "daily-brief.json", status: res.status }));
  return res.json();
}

async function loadTop3PersonasData() {
  const res = await fetch(`${dataUrl("data/top3-personas.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "top3-personas.json", status: res.status }));
  return res.json();
}

async function loadStoriesData() {
  const res = await fetch(`${dataUrl(state.storiesDataUrl)}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "stories-merged.json", status: res.status }));
  return res.json();
}

async function loadDouyinHotData() {
  const res = await fetch(`${dataUrl("data/douyin-hot.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "douyin-hot.json", status: res.status }));
  return res.json();
}

async function loadGithubRankingsData() {
  const res = await fetch(`${dataUrl("data/github-rankings.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "github-rankings.json", status: res.status }));
  return res.json();
}

async function loadAuthorityVoicesData() {
  const res = await fetch(`${dataUrl("data/authority-voices.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "authority-voices.json", status: res.status }));
  return res.json();
}

async function loadPapersData() {
  const res = await fetch(`${dataUrl("data/papers.json")}?t=${Date.now()}`);
  if (!res.ok) throw new Error(t("error.load", { file: "papers.json", status: res.status }));
  return res.json();
}

async function init() {
  const [newsResult, waytoagiResult, statusResult, briefResult, storiesResult, personasResult, githubResult, authorityResult, papersResult, douyinHotResult] = await Promise.allSettled([
    loadNewsData(),
    IS_EN ? Promise.resolve(null) : loadWaytoagiData(),
    loadSourceStatusData(),
    loadDailyBriefData(),
    loadStoriesData(),
    loadTop3PersonasData(),
    loadGithubRankingsData(),
    loadAuthorityVoicesData(),
    loadPapersData(),
    loadDouyinHotData(),
  ]);

  if (briefResult.status === "fulfilled") {
    state.dailyBrief = briefResult.value;
  } else {
    state.dailyBrief = null;
  }
  _briefIdentityKeyCache = null;

  // top3-personas.json 是可选增强数据：文件缺失、请求失败或 items 为空都静默降级。
  if (
    personasResult.status === "fulfilled" &&
    Array.isArray(personasResult.value?.items) &&
    personasResult.value.items.length > 0
  ) {
    state.top3Personas = personasResult.value;
  } else {
    state.top3Personas = null;
  }

  if (storiesResult.status === "fulfilled") {
    state.storiesMerged = storiesResult.value;
  } else {
    state.storiesMerged = null;
  }

  state.githubRankings = githubResult.status === "fulfilled" ? githubResult.value : null;
  state.authorityVoices = authorityResult.status === "fulfilled" ? authorityResult.value : null;
  state.papers = papersResult.status === "fulfilled" ? papersResult.value : null;
  state.douyinHot = douyinHotResult.status === "fulfilled" ? douyinHotResult.value : null;

  if (newsResult.status === "fulfilled") {
    const payload = newsResult.value;
    const loadedStoriesDataUrl = state.storiesDataUrl;
    state.itemsAi = payload.items_ai || payload.items || [];
    state.itemsAllRaw = payload.items_all_raw || payload.items_all || [];
    state.itemsAll = payload.items_all || [];
    state.creatorItemsAi = payload.creator_items_ai || [];
    state.creatorItemsAll = payload.creator_items_all || state.creatorItemsAi;
    state.creatorWindowDays = Number(payload.creator_window_days || 7);
    state.statsAi = payload.site_stats || [];
    state.totalAi = payload.total_items || state.itemsAi.length;
    state.totalRaw = payload.total_items_raw || state.itemsAllRaw.length;
    state.totalAllMode = payload.total_items_all_mode || state.itemsAll.length;
    state.allDataUrl = payload.all_mode_data_url || state.allDataUrl;
    state.storiesDataUrl = payload.stories_data_url || state.storiesDataUrl;
    if (state.storiesDataUrl !== loadedStoriesDataUrl) {
      try {
        state.storiesMerged = await loadStoriesData();
      } catch {
        state.storiesMerged = null;
      }
    }
    state.allDataLoaded = Boolean(payload.items_all || payload.items_all_raw);
    state.generatedAt = payload.generated_at;

    renderSectionTabs();
    renderModeSwitch();
    renderSiteFilters();
    renderHotBoard();
    renderMainList();
    updatedAtEl.textContent = fmtTime(state.generatedAt);
  } else {
    updatedAtEl.textContent = t("news.loadFailed");
    newsListEl.innerHTML = `<div class="empty">${newsResult.reason.message}</div>`;
  }

  renderGithubRankings();
  renderAuthorityVoices();

  if (statusResult.status === "fulfilled") {
    state.sourceStatus = statusResult.value;
    renderSourceHealth();
  } else {
    renderSourceHealth(statusResult.reason.message);
  }

  if (IS_EN) {
    if (waytoagiWrapEl) waytoagiWrapEl.hidden = true;
  } else if (waytoagiResult.status === "fulfilled") {
    state.waytoagiData = waytoagiResult.value;
    renderWaytoagi(state.waytoagiData);
  } else {
    if (waytoagiWrapEl) waytoagiWrapEl.hidden = state.activeSection !== "community";
    waytoagiUpdatedAtEl.textContent = t("common.loadFailed");
    waytoagiListEl.innerHTML = `<div class="waytoagi-error">${waytoagiResult.reason.message}</div>`;
  }

  document.dispatchEvent(new CustomEvent("aiRadar:ready"));
}

// 搜索：精选模式按故事标题/来源过滤（storyMatchesQuery），全量模式按条目过滤（itemHaystack）
if (officialOnlyBtnEl) {
  officialOnlyBtnEl.addEventListener("click", () => {
    state.officialOnly = !state.officialOnly;
    state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
    rerenderCurrentView();
  });
}

searchInputEl.addEventListener("input", (e) => {
  state.query = e.target.value;
  state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
  renderSectionTabs();
  renderModeSwitch();
  renderHotBoard();
  renderMainList();
});

if (clearFiltersBtnEl) {
  clearFiltersBtnEl.addEventListener("click", clearAllFilters);
}

siteSelectEl.addEventListener("change", (e) => {
  state.siteFilter = e.target.value;
  if (state.siteFilter !== "socialdata_x") state.authorFilter = "";
  state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
  renderSiteFilters();
  renderHotBoard();
  renderMainList();
});

// 全局 精选/全量 开关：替代旧的三视图切换（精选/热点榜/时间线）
if (modeSelectedBtnEl) {
  modeSelectedBtnEl.addEventListener("click", () => {
    if (state.mode === "selected") return;
    state.mode = "selected";
    state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
    rerenderCurrentView();
  });
}

if (modeAllBtnEl) {
  modeAllBtnEl.addEventListener("click", async () => {
    if (state.mode === "all") return;
    state.mode = "all";
    state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
    renderModeSwitch();
    newsListEl.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "empty";
    loading.textContent = t("list.loadingAll");
    newsListEl.appendChild(loading);
    try {
      await loadAllModeData();
      rerenderCurrentView();
    } catch (err) {
      newsListEl.innerHTML = "";
      const failed = document.createElement("div");
      failed.className = "empty";
      failed.textContent = err.message;
      newsListEl.appendChild(failed);
    }
  });
}

if (allDedupeToggleEl) {
  allDedupeToggleEl.addEventListener("change", (e) => {
    state.allDedup = Boolean(e.target.checked);
    state.mainListVisibleCount = MAIN_LIST_PAGE_SIZE;
    rerenderCurrentView();
  });
}

if (waytoagiTodayBtnEl) {
  waytoagiTodayBtnEl.addEventListener("click", () => {
    state.waytoagiMode = "today";
    if (state.waytoagiData) renderWaytoagi(state.waytoagiData);
  });
}

if (waytoagi7dBtnEl) {
  waytoagi7dBtnEl.addEventListener("click", () => {
    state.waytoagiMode = "7d";
    if (state.waytoagiData) renderWaytoagi(state.waytoagiData);
  });
}

if (dataSourceResetBtnEl) {
  dataSourceResetBtnEl.addEventListener("click", () => {
    try { localStorage.removeItem("dataBaseUrl"); } catch {}
    window.location.href = window.location.pathname;
  });
}

if (papersAuthoritativeBtnEl) {
  papersAuthoritativeBtnEl.addEventListener("click", () => {
    state.paperMode = "authoritative";
    state.paperCategory = "all";
    state.papersVisibleCount = 12;
    renderPapers();
  });
}

if (papersHotBtnEl) {
  papersHotBtnEl.addEventListener("click", () => {
    state.paperMode = "hot";
    state.papersVisibleCount = 10;
    renderPapers();
  });
}

if (githubWeeklyBtnEl) {
  githubWeeklyBtnEl.addEventListener("click", () => {
    state.githubRankingPeriod = "weekly";
    renderGithubRankings();
  });
}

if (githubMonthlyBtnEl) {
  githubMonthlyBtnEl.addEventListener("click", () => {
    state.githubRankingPeriod = "monthly";
    renderGithubRankings();
  });
}

document.querySelectorAll("[data-authority-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.authorityFilter = button.dataset.authorityFilter || "all";
    state.authorityVisibleCount = 8;
    renderAuthorityVoices();
  });
});
if (douyinPicksRefreshBtnEl) {
  douyinPicksRefreshBtnEl.addEventListener("click", () => {
    state.douyinPickRound = ((Number(state.douyinPickRound) || 0) + 1) % DOUYIN_PICK_ROUNDS;
    renderDouyinPicks();
  });
}

renderDataSourceIndicator();
initTodayProjects();
init();

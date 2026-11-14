// AI 视频选题工作台 V2：决策、选题池、样本、周报与复盘。
// 依赖 app.js 中的 state、storyFactBoundary、douyinAllCandidates 等全局定义。

const douyinV2Dom = {
  wrap: document.getElementById("douyinPicksWrap"),
  tabs: document.getElementById("douyinWorkbenchTabs"),
  decision: document.getElementById("douyinDecisionPanel"),
  pool: document.getElementById("douyinPoolPanel"),
  samples: document.getElementById("douyinSamplesPanel"),
  weekly: document.getElementById("douyinWeeklyPanel"),
  review: document.getElementById("douyinReviewPanel"),
  meta: document.getElementById("douyinPicksMeta"),
  refresh: document.getElementById("douyinPicksRefreshBtn"),
  dataStrip: document.getElementById("douyinDataStrip"),
  top3: document.getElementById("douyinTop3List"),
  conclusion: document.getElementById("douyinConclusion"),
  hotBoard: document.getElementById("douyinHotBoard"),
  verification: document.getElementById("douyinVerificationSummary"),
  poolMeta: document.getElementById("douyinPoolMeta"),
  poolList: document.getElementById("douyinPoolList"),
  samplesList: document.getElementById("douyinSamplesList"),
  weeklySummary: document.getElementById("douyinWeeklySummary"),
  weeklyList: document.getElementById("douyinWeeklyList"),
  reviewForm: document.getElementById("douyinReviewFormWrap"),
  reviewList: document.getElementById("douyinReviewList"),
  drawer: document.getElementById("douyinDetailDrawer"),
  backdrop: document.getElementById("douyinDrawerBackdrop"),
  toast: document.getElementById("douyinToast"),
};

function v2El(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function v2Button(label, className, handler) {
  const button = v2El("button", className, label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

async function v2Copy(text) {
  const value = String(text || "");
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function v2Toast(message) {
  if (!douyinV2Dom.toast) return;
  douyinV2Dom.toast.textContent = message;
  douyinV2Dom.toast.hidden = false;
  clearTimeout(v2Toast.timer);
  v2Toast.timer = setTimeout(() => { douyinV2Dom.toast.hidden = true; }, 2200);
}

function v2Download(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function v2ScorePill(label, value, tone = "") {
  const pill = v2El("span", `douyin-score-pill ${tone}`.trim());
  pill.append(v2El("strong", "", String(value)), v2El("small", "", label));
  return pill;
}

function v2StatusChip(statusId) {
  const status = DOUYIN_STATUS_BY_ID[statusId] || DOUYIN_STATUS_BY_ID.new;
  return v2El("span", `douyin-status-chip status-${status.id}`, status.label);
}

function v2RenderDataStrip(candidates) {
  if (!douyinV2Dom.dataStrip) return;
  douyinV2Dom.dataStrip.replaceChildren();
  const gateCount = candidates.filter((pick) => pick.factGate).length;
  const primaryCount = candidates.filter((pick) => pick.fact.primarySourceUrl).length;
  const sampleCount = douyinSampleItems().length;
  const recentReviews = (state.douyinV2.reviews || []).filter((review) => {
    const ts = new Date(review.publishedAt || review.createdAt || 0).getTime();
    return ts && Date.now() - ts <= 7 * 86400000;
  });
  const plays = recentReviews.reduce((sum, review) => sum + sampleMetric(review.actualMetrics, "plays"), 0);
  const followers = recentReviews.reduce((sum, review) => sum + sampleMetric(review.actualMetrics, "followers"), 0);
  const stats = [
    ["数据更新", fmtTime(state.generatedAt)],
    ["AI 信息", `${fmtNumber(state.totalAi || state.itemsAi.length)} 条`],
    ["一手可定位", `${primaryCount} 条`],
    ["事实门通过", `${gateCount} 条`],
    ["高流量样本", `${sampleCount} 条`],
    ["热榜 AI 直接相关", `${Number(state.douyinHot?.ai_related_count || 0)} 条`],
    ["近 7 天账号", `${recentReviews.length} 条 · ${fmtNumber(plays)} 播放 · ${fmtNumber(followers)} 涨粉`],
  ];
  stats.forEach(([label, value]) => {
    const item = v2El("div", "douyin-data-stat");
    item.append(v2El("span", "", label), v2El("strong", "", value));
    douyinV2Dom.dataStrip.appendChild(item);
  });
  const warnings = [];
  if (!sampleCount) warnings.push("高流量视频样本未接入，不生成虚构相似度");
  if (Number(state.douyinHot?.ai_related_count || 0) === 0) warnings.push("当前热榜没有 AI 直接相关词");
  if (gateCount < 3) warnings.push("事实门通过候选少于 3 条");
  if (warnings.length) douyinV2Dom.dataStrip.appendChild(v2El("p", "douyin-data-warning", `数据缺口：${warnings.join("；")}`));
}

function v2RenderTop3(candidates) {
  if (!douyinV2Dom.top3) return [];
  douyinV2Dom.top3.replaceChildren();
  const top3 = douyinTopThree(candidates);
  if (!top3.length) {
    douyinV2Dom.top3.appendChild(v2El("p", "douyin-picks-empty", "当前没有足够候选生成今日 TOP3。"));
    return top3;
  }
  top3.forEach((pick, index) => douyinV2Dom.top3.appendChild(v2DecisionCard(pick, index + 1)));
  return top3;
}

function v2DecisionCard(pick, rank) {
  const card = v2El("article", "douyin-decision-card");
  card.dataset.bucket = pick.bucketId;
  const head = v2El("div", "douyin-decision-head");
  const titleWrap = v2El("div", "douyin-decision-title-wrap");
  titleWrap.append(v2El("span", "douyin-format-tag", pick.formatLabel), v2El("h3", "", pick.title));
  head.append(v2El("span", "douyin-decision-rank", `TOP ${rank}`), titleWrap, v2StatusChip(pick.status));

  const scores = v2El("div", "douyin-score-row");
  scores.append(
    v2ScorePill("事实分", pick.factScore, pick.factGate ? "score-good" : "score-warn"),
    v2ScorePill("推流分", pick.trafficScore, pick.hotMatch.directMatch ? "score-hot" : ""),
    v2ScorePill("吸粉分", pick.followScore, pick.followScore >= 65 ? "score-follow" : ""),
    v2ScorePill("推荐时长", pick.duration),
  );

  const advice = v2El("div", "douyin-advice-grid");
  const titleBox = v2El("section", "douyin-advice-box");
  titleBox.appendChild(v2El("h4", "", "推荐标题"));
  pick.recommendedTitles.forEach((title, index) => {
    const row = v2El("div", "douyin-copy-row");
    row.appendChild(v2El("span", "", title));
    row.appendChild(v2Button("复制", "douyin-mini-btn", async () => {
      await v2Copy(title);
      v2Toast(`已复制标题 ${index + 1}`);
    }));
    titleBox.appendChild(row);
  });
  const hookBox = v2El("section", "douyin-advice-box");
  hookBox.append(v2El("h4", "", "前 3 秒钩子"), v2El("p", "", pick.hook));
  hookBox.appendChild(v2Button("复制钩子", "douyin-mini-btn", async () => {
    await v2Copy(pick.hook);
    v2Toast("已复制钩子");
  }));
  advice.append(titleBox, hookBox);

  const reasons = v2El("div", "douyin-reason-grid");
  const push = v2El("section", "douyin-reason-box");
  push.append(v2El("h4", "", "为什么可能推流"), v2El("p", "", pick.pushReason));
  const follow = v2El("section", "douyin-reason-box");
  follow.append(v2El("h4", "", "为什么可能吸粉"), v2El("p", "", pick.followReason));
  reasons.append(push, follow);

  const visual = v2El("div", "douyin-visual-line");
  visual.append(v2El("strong", "", "推荐画面："), v2El("span", "", pick.visual));

  const risk = v2El("div", "douyin-risk-box");
  risk.appendChild(v2El("strong", "", "最大风险"));
  (pick.riskSummary.length ? pick.riskSummary.slice(0, 5) : ["暂未发现额外风险，仍需人工核验原文"]).forEach((item) => risk.appendChild(v2El("span", "", item)));

  const samples = v2El("section", "douyin-decision-samples");
  samples.appendChild(v2El("h4", "", "最接近的高流量样本"));
  if (pick.sampleMatches.length) {
    pick.sampleMatches.slice(0, 2).forEach(({ sample, similarity }) => {
      const row = v2El(sample.url ? "a" : "div", "douyin-sample-mini");
      if (sample.url) { row.href = sample.url; row.target = "_blank"; row.rel = "noopener noreferrer"; }
      row.append(v2El("span", "", sample.title), v2El("strong", "", `相似 ${similarity}%`));
      samples.appendChild(row);
    });
  } else {
    samples.appendChild(v2El("p", "douyin-empty-note", "样本库尚未接入，当前不显示虚构的相似视频；导入真实样本后会自动匹配。"));
  }

  const actions = v2El("div", "douyin-decision-actions");
  actions.append(
    v2Button("生成文字审核包", "douyin-primary-btn", () => v2GenerateAudit(pick)),
    v2Button(state.douyinV2.weekly.includes(pick.story.story_id) ? "移出周报" : "加入周报", "douyin-secondary-btn", () => v2ToggleWeekly(pick.story.story_id)),
    v2Button("查看详情", "douyin-secondary-btn", () => v2OpenDrawer(pick)),
    v2Button("暂不做", "douyin-ghost-btn", () => v2Dismiss(pick.story.story_id)),
  );
  card.append(head, scores, advice, reasons, visual, risk, samples, actions);
  return card;
}

function v2DurationBucket(pick) {
  if (pick.format === "weekly") return "long";
  if (pick.format === "flash") return "short";
  return "medium";
}

function v2FilteredCandidates(candidates) {
  const f = state.douyinFilters;
  const rows = candidates.filter((pick) => {
    if (f.query && !`${pick.title} ${pick.sourceName} ${pick.entity}`.toLowerCase().includes(f.query.toLowerCase())) return false;
    if (f.gate === "pass" && !pick.factGate) return false;
    if (f.gate === "fail" && pick.factGate) return false;
    if (f.format !== "all" && pick.format !== f.format) return false;
    if (f.type !== "all" && pick.bucketId !== f.type) return false;
    if (f.source !== "all" && douyinSourceCategory(pick) !== f.source) return false;
    if (f.entity !== "all" && !pick.entity.includes(f.entity)) return false;
    if (pick.factScore < Number(f.factMin || 0)) return false;
    if (pick.trafficScore < Number(f.pushMin || 0)) return false;
    if (pick.followScore < Number(f.followMin || 0)) return false;
    if (f.visual && pick.breakdown.factors.visual < 65) return false;
    if (f.avoidChinaUnknown && pick.riskSummary.includes("国内可用性需单独核验")) return false;
    if (f.series && !(pick.followReason.includes("系列") || /系列|趋势|行业|生态|公司|模型|agent|智能体/i.test(pick.title))) return false;
    if (f.sensitive && !/钱|价格|免费|收费|工作|就业|裁员|教育|学生|医疗|健康|隐私|手机|机器人|诈骗|版权/i.test(pick.title)) return false;
    if (f.duration !== "all" && v2DurationBucket(pick) !== f.duration) return false;
    return true;
  });
  const sorters = {
    push: (a, b) => b.trafficScore - a.trafficScore,
    follow: (a, b) => b.followScore - a.followScore,
    fact: (a, b) => b.factScore - a.factScore,
    fresh: (a, b) => b.latestMs - a.latestMs,
    samples: (a, b) => b.sampleSimilarity - a.sampleSimilarity,
    priority: (a, b) => Number(b.factGate) - Number(a.factGate) || b.decisionScore - a.decisionScore,
  };
  return rows.sort(sorters[f.sort] || sorters.priority);
}

function v2RenderPool(candidates) {
  if (!douyinV2Dom.poolList) return;
  const typeSelect = document.getElementById("douyinFilterType");
  if (typeSelect && typeSelect.options.length <= 1) {
    DOUYIN_BUCKET_DEFS.forEach((bucket) => {
      const option = document.createElement("option");
      option.value = bucket.id;
      option.textContent = bucket.label;
      typeSelect.appendChild(option);
    });
  }
  const rows = v2FilteredCandidates(candidates);
  if (douyinV2Dom.poolMeta) douyinV2Dom.poolMeta.textContent = `${rows.length} 条候选 · 可筛选事实门、推荐形式、来源、实体和三项评分`;
  douyinV2Dom.poolList.replaceChildren();
  if (!rows.length) {
    douyinV2Dom.poolList.appendChild(v2El("p", "douyin-picks-empty", "没有符合当前筛选条件的候选。"));
    return;
  }
  rows.slice(0, 60).forEach((pick) => {
    const card = v2El("article", "douyin-pool-card");
    const head = v2El("div", "douyin-pool-card-head");
    head.append(v2El("span", "douyin-format-tag", pick.formatLabel), v2El("h3", "", pick.title), v2StatusChip(pick.status));
    const meta = v2El("p", "douyin-pool-meta-line", `${pick.sourceName} · ${fmtUpdatedRelative(pick.latestMs)} · ${pick.entity}`);
    const scores = v2El("div", "douyin-score-row compact");
    scores.append(
      v2ScorePill("事实", pick.factScore, pick.factGate ? "score-good" : "score-warn"),
      v2ScorePill("推流", pick.trafficScore),
      v2ScorePill("吸粉", pick.followScore),
      v2ScorePill("时长", pick.duration),
    );
    const title = v2El("p", "douyin-pool-recommended", `推荐标题：${pick.recommendedTitles[0]}`);
    const hook = v2El("p", "douyin-pool-hook", `钩子：${pick.hook}`);
    const tags = v2El("div", "douyin-tag-row");
    (pick.riskSummary.length ? pick.riskSummary.slice(0, 3) : ["未见额外风险"]).forEach((item) => tags.appendChild(v2El("span", "risk-tag", item)));
    if (pick.hotMatch.directMatch) tags.appendChild(v2El("span", "hot-tag", `热榜 #${pick.hotMatch.bestItem?.position}`));
    if (pick.sampleSimilarity) tags.appendChild(v2El("span", "sample-tag", `样本相似 ${pick.sampleSimilarity}%`));
    const actions = v2El("div", "douyin-pool-actions");
    actions.append(
      v2Button("详情", "douyin-secondary-btn", () => v2OpenDrawer(pick)),
      v2Button(state.douyinV2.weekly.includes(pick.story.story_id) ? "移出周报" : "加入周报", "douyin-mini-btn", () => v2ToggleWeekly(pick.story.story_id)),
      v2Button("生成审核包", "douyin-primary-btn", () => v2GenerateAudit(pick)),
    );
    card.append(head, meta, scores, title, hook, tags, actions);
    douyinV2Dom.poolList.appendChild(card);
  });
}

function v2RenderSamples() {
  if (!douyinV2Dom.samplesList) return;
  const samples = douyinSampleItems();
  douyinV2Dom.samplesList.replaceChildren();
  douyinV2Dom.samplesList.appendChild(v2El("p", "douyin-data-warning", state.douyinSamples?.disclaimer || "高流量样本尚未接入；只接受真实导入或本人发布数据。"));
  if (!samples.length) {
    const empty = v2El("div", "douyin-empty-state");
    empty.append(
      v2El("h3", "", "当前没有真实高流量样本"),
      v2El("p", "", "没有抖音视频搜索或你的发布数据时，页面不会生成虚构的播放量、点赞数或相似视频。"),
      v2El("p", "", "可导入包含 title、author、metrics、format、keywords 的 JSON；发布复盘中的本人视频也会自动进入样本库。"),
    );
    douyinV2Dom.samplesList.appendChild(empty);
    return;
  }
  const grid = v2El("div", "douyin-sample-grid");
  samples.forEach((sample) => {
    const card = v2El(sample.url ? "a" : "article", "douyin-sample-card");
    if (sample.url) { card.href = sample.url; card.target = "_blank"; card.rel = "noopener noreferrer"; }
    card.append(v2El("span", "douyin-format-tag", DOUYIN_FORMAT_LABELS[sample.format] || sample.format || "样本"));
    card.appendChild(v2El("h3", "", sample.title));
    card.appendChild(v2El("p", "", `${sample.author || "未知作者"} · ${sample.published_at || "时间未知"}`));
    const metrics = v2El("div", "douyin-sample-metrics");
    [["播放", "plays"], ["点赞", "likes"], ["评论", "comments"], ["收藏", "saves"], ["分享", "shares"]].forEach(([label, key]) => {
      metrics.appendChild(v2El("span", "", `${label} ${fmtNumber(sampleMetric(sample, key))}`));
    });
    card.appendChild(metrics);
    if (sample.keywords?.length) card.appendChild(v2El("p", "douyin-sample-keywords", sample.keywords.join(" · ")));
    grid.appendChild(card);
  });
  douyinV2Dom.samplesList.appendChild(grid);
}

function v2WeeklyCandidates() {
  const stories = state.weeklyCandidates?.stories?.length ? state.weeklyCandidates.stories : mergedStories();
  const seen = new Set();
  return stories.map(buildDouyinCandidate).filter(Boolean).map(decorateDouyinCandidate).filter((pick) => {
    if (seen.has(pick.story.story_id)) return false;
    seen.add(pick.story.story_id);
    return true;
  }).sort((a, b) => Number(b.factGate) - Number(a.factGate) || b.decisionScore - a.decisionScore);
}

function v2AutoWeekly() {
  const rows = v2WeeklyCandidates();
  const picked = [];
  const ids = new Set();
  const buckets = new Set();
  rows.forEach((pick) => {
    if (picked.length >= 7 || buckets.has(pick.bucketId) || !pick.factGate) return;
    buckets.add(pick.bucketId); picked.push(pick.story.story_id); ids.add(pick.story.story_id);
  });
  rows.forEach((pick) => { if (picked.length < 7 && !ids.has(pick.story.story_id)) { picked.push(pick.story.story_id); ids.add(pick.story.story_id); } });
  state.douyinV2.weekly = picked;
  saveDouyinV2Store();
  v2Render();
}

function v2ToggleWeekly(storyId) {
  const set = new Set(state.douyinV2.weekly);
  if (set.has(storyId)) set.delete(storyId); else set.add(storyId);
  state.douyinV2.weekly = Array.from(set);
  if (set.has(storyId) && douyinStatus(storyId) === "new") state.douyinV2.statuses[storyId] = "selected";
  saveDouyinV2Store();
  v2Toast(set.has(storyId) ? "已加入周报" : "已移出周报");
  v2Render();
}

function v2WeeklyMarkdown(rows) {
  const selected = rows.filter((pick) => state.douyinV2.weekly.includes(pick.story.story_id));
  const lines = ["# AI 周报文字审核包（草稿）", "", `生成时间：${new Date().toLocaleString("zh-CN")}`, "", `选题数量：${selected.length}`, "", "## 开场 3 秒钩子", "", "这一周 AI 圈发生的事很多，但真正会影响普通人的，只有这几条。", ""];
  selected.forEach((pick, index) => {
    lines.push(`## ${index + 1}. ${pick.title}`, "", `- 推荐形式：${pick.formatLabel}`, `- 事实分：${pick.factScore} / 推流分：${pick.trafficScore} / 吸粉分：${pick.followScore}`, `- 原文：${pick.fact.primarySourceUrl || pick.url}`, `- 事实边界：${pick.fact.note}`, "", `**分段钩子：** ${pick.hook}`, "", `**画面建议：** ${pick.visual}`, "", `**风险：** ${pick.riskSummary.join("；") || "仍需人工核验"}`, "");
  });
  lines.push("## 结尾问题", "", "这一周哪一条最可能改变普通人的工作或生活？", "", "> 未经人工核验和文案锁定，不进入配音、动画或成片。", "");
  return lines.join("\n");
}

function v2RenderWeekly() {
  if (!douyinV2Dom.weeklyList) return;
  const rows = v2WeeklyCandidates();
  const selected = rows.filter((pick) => state.douyinV2.weekly.includes(pick.story.story_id));
  if (douyinV2Dom.weeklySummary) {
    douyinV2Dom.weeklySummary.replaceChildren();
    const entities = {};
    selected.forEach((pick) => { entities[pick.entity] = (entities[pick.entity] || 0) + 1; });
    const mainline = Object.entries(entities).sort((a, b) => b[1] - a[1])[0]?.[0] || "待选择";
    [["已选", `${selected.length} 条 · 建议 5–9 条`], ["预计时长", `${Math.max(3, Math.ceil(selected.length * 0.7))} 分钟左右`], ["通过事实门", `${selected.filter((pick) => pick.factGate).length} 条`], ["本周主线", mainline], ["数据窗口", state.weeklyCandidates?.window_hours ? `${state.weeklyCandidates.window_hours} 小时` : "当前可用窗口"]].forEach(([label, value]) => {
      const item = v2El("div", "douyin-weekly-stat");
      item.append(v2El("span", "", label), v2El("strong", "", value));
      douyinV2Dom.weeklySummary.appendChild(item);
    });
  }
  douyinV2Dom.weeklyList.replaceChildren();
  if (!rows.length) {
    douyinV2Dom.weeklyList.appendChild(v2El("p", "douyin-picks-empty", "周报候选数据暂不可用。"));
    return;
  }
  rows.slice(0, 80).forEach((pick) => {
    const selectedNow = state.douyinV2.weekly.includes(pick.story.story_id);
    const row = v2El("article", `douyin-weekly-row ${selectedNow ? "selected" : ""}`.trim());
    const main = v2El("div", "douyin-weekly-main");
    main.append(v2El("h3", "", pick.title), v2El("p", "", `${pick.sourceName} · ${fmtUpdatedRelative(pick.latestMs)} · ${pick.formatLabel}`));
    const scores = v2El("div", "douyin-score-row compact");
    scores.append(v2ScorePill("事实", pick.factScore, pick.factGate ? "score-good" : "score-warn"), v2ScorePill("推流", pick.trafficScore), v2ScorePill("吸粉", pick.followScore));
    row.append(main, scores, v2Button(selectedNow ? "移出" : "加入", selectedNow ? "douyin-ghost-btn" : "douyin-primary-btn", () => v2ToggleWeekly(pick.story.story_id)));
    douyinV2Dom.weeklyList.appendChild(row);
  });
}

function v2MetricInput(label, key, value = 0) {
  const field = v2El("label", "douyin-review-field");
  field.appendChild(v2El("span", "", label));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = key === "completionRate" ? "0.1" : "1";
  input.value = String(value || 0);
  input.dataset.metric = key;
  field.appendChild(input);
  return field;
}

function v2RenderReview(candidates) {
  if (!douyinV2Dom.reviewForm || !douyinV2Dom.reviewList) return;
  const rows = candidates.length ? candidates : douyinAllCandidates();
  if (!state.douyinReviewStoryId || !rows.some((pick) => pick.story.story_id === state.douyinReviewStoryId)) state.douyinReviewStoryId = rows[0]?.story.story_id || "";
  const selected = rows.find((pick) => pick.story.story_id === state.douyinReviewStoryId);
  douyinV2Dom.reviewForm.replaceChildren();
  if (!selected) {
    douyinV2Dom.reviewForm.appendChild(v2El("p", "douyin-picks-empty", "暂无可回填的候选。"));
  } else {
    const form = v2El("form", "douyin-review-form");
    const selectLabel = v2El("label", "douyin-review-field wide");
    selectLabel.appendChild(v2El("span", "", "关联候选"));
    const select = document.createElement("select");
    select.id = "douyinReviewCandidateSelect";
    rows.slice(0, 80).forEach((pick) => {
      const option = document.createElement("option");
      option.value = pick.story.story_id;
      option.textContent = pick.title;
      option.selected = pick.story.story_id === selected.story.story_id;
      select.appendChild(option);
    });
    selectLabel.appendChild(select);
    const titleLabel = v2El("label", "douyin-review-field wide");
    titleLabel.appendChild(v2El("span", "", "实际标题"));
    const actualTitle = document.createElement("input");
    actualTitle.id = "douyinReviewActualTitle";
    actualTitle.type = "text";
    actualTitle.value = selected.recommendedTitles[0];
    titleLabel.appendChild(actualTitle);
    const dateLabel = v2El("label", "douyin-review-field");
    dateLabel.appendChild(v2El("span", "", "发布日期"));
    const publishedAt = document.createElement("input");
    publishedAt.id = "douyinReviewPublishedAt";
    publishedAt.type = "date";
    publishedAt.value = new Date().toISOString().slice(0, 10);
    dateLabel.appendChild(publishedAt);
    const durationLabel = v2El("label", "douyin-review-field");
    durationLabel.appendChild(v2El("span", "", "实际时长（秒）"));
    const duration = document.createElement("input");
    duration.id = "douyinReviewDuration";
    duration.type = "number";
    duration.min = "0";
    duration.value = "60";
    durationLabel.appendChild(duration);
    const preview = v2El("div", "douyin-review-prediction");
    preview.append(v2El("strong", "", "预测："), v2El("span", "", `事实 ${selected.factScore} · 推流 ${selected.trafficScore} · 吸粉 ${selected.followScore} · ${selected.formatLabel}`));
    const metrics = v2El("div", "douyin-review-metrics");
    [["播放", "plays"], ["2 秒跳出率", "drop2"], ["5 秒完播率", "completion5"], ["平均观看（秒）", "avgWatch"], ["完播率", "completionRate"], ["点赞", "likes"], ["评论", "comments"], ["收藏", "saves"], ["分享", "shares"], ["涨粉", "followers"], ["有效评论", "validComments"]].forEach(([label, key]) => metrics.appendChild(v2MetricInput(label, key)));
    const actions = v2El("div", "douyin-review-actions");
    const save = v2Button("保存复盘", "douyin-primary-btn", () => {});
    save.type = "submit";
    actions.appendChild(save);
    form.append(selectLabel, titleLabel, dateLabel, durationLabel, preview, metrics, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const actualMetrics = {};
      form.querySelectorAll("input[data-metric]").forEach((input) => { actualMetrics[input.dataset.metric] = Number(input.value || 0); });
      state.douyinV2.reviews.unshift({
        id: `review_${Date.now()}`,
        storyId: selected.story.story_id,
        recommendedTitle: selected.recommendedTitles[0],
        actualTitle: actualTitle.value.trim(),
        format: selected.format,
        predictedFact: selected.factScore,
        predictedPush: selected.trafficScore,
        predictedFollow: selected.followScore,
        publishedAt: publishedAt.value,
        durationSeconds: Number(duration.value || 0),
        actualMetrics,
        createdAt: new Date().toISOString(),
      });
      state.douyinV2.statuses[selected.story.story_id] = "reviewed";
      saveDouyinV2Store();
      v2Toast("复盘已保存到当前浏览器");
      v2Render();
    });
    select.addEventListener("change", () => { state.douyinReviewStoryId = select.value; v2RenderReview(rows); });
    douyinV2Dom.reviewForm.appendChild(form);
  }
  douyinV2Dom.reviewList.replaceChildren();
  if (!state.douyinV2.reviews.length) {
    douyinV2Dom.reviewList.appendChild(v2El("p", "douyin-empty-note", "还没有发布复盘。保存后会出现在这里，并自动进入你的样本库。"));
    return;
  }
  state.douyinV2.reviews.forEach((review) => {
    const card = v2El("article", "douyin-review-card");
    card.append(v2El("h3", "", review.actualTitle || review.recommendedTitle), v2El("p", "", `${review.publishedAt || review.createdAt} · 预测推流 ${review.predictedPush} / 吸粉 ${review.predictedFollow}`));
    const metrics = v2El("div", "douyin-review-card-metrics");
    [["播放", "plays"], ["5 秒完播", "completion5"], ["完播率", "completionRate"], ["点赞", "likes"], ["收藏", "saves"], ["分享", "shares"], ["涨粉", "followers"]].forEach(([label, key]) => metrics.appendChild(v2El("span", "", `${label} ${fmtNumber(review.actualMetrics?.[key] || 0)}`)));
    card.appendChild(metrics);
    douyinV2Dom.reviewList.appendChild(card);
  });
}

function v2AuditMarkdown(pick) {
  const claims = Array.isArray(pick.story.key_claims) && pick.story.key_claims.length
    ? pick.story.key_claims.map((claim) => `- ${claim.claim}（${claim.status}）`).join("\n")
    : `- ${pick.title}`;
  const limits = (pick.fact.limits?.length ? pick.fact.limits : pick.riskSummary).map((item) => `- ${item}`).join("\n");
  return `# 抖音文字审核包（草稿）

## 选题
${pick.title}

## 推荐形式
${pick.formatLabel} · ${pick.duration}

## 标题候选
${pick.recommendedTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")}

## 前 3 秒钩子
${pick.hook}

## 三项评分
- 事实分：${pick.factScore}
- 推流分：${pick.trafficScore}
- 吸粉分：${pick.followScore}
- 置信度：${pick.factGate ? "中" : "低"}

## 事实边界
- 状态：${pick.fact.label}
- 说明：${pick.fact.note}
- 一手原文：${pick.fact.primarySourceUrl || "未定位"}

## 可核验声明
${claims}

## 必须核验的限制
${limits}

## 推荐画面
${pick.visual}

## 推荐结构
1. 3 秒钩子：${pick.hook}
2. 官方 / 一手原文截图
3. 讲清最重要的一个变化
4. 说明普通人影响和限制
5. 结尾问题：你希望这项能力先进入哪个生活场景？

## 风险
${pick.riskSummary.map((item) => `- ${item}`).join("\n") || "- 仍需人工核验"}

> 此包仅为文字审核草稿。未经人工核验和明确“文案锁定”，不得进入配音、动画或成片。
`;
}

function v2OpenContent(content, mode) {
  if (!douyinV2Dom.drawer || !douyinV2Dom.backdrop) return;
  douyinV2Dom.drawer.replaceChildren(v2Button("关闭", "douyin-drawer-close", v2CloseDrawer), content);
  douyinV2Dom.drawer.dataset.mode = mode;
  douyinV2Dom.drawer.classList.add("open");
  douyinV2Dom.drawer.setAttribute("aria-hidden", "false");
  douyinV2Dom.backdrop.hidden = false;
}

function v2CloseDrawer() {
  if (!douyinV2Dom.drawer || !douyinV2Dom.backdrop) return;
  douyinV2Dom.drawer.classList.remove("open");
  douyinV2Dom.drawer.setAttribute("aria-hidden", "true");
  douyinV2Dom.backdrop.hidden = true;
  state.douyinDrawerStoryId = "";
}

function v2GenerateAudit(pick) {
  const text = v2AuditMarkdown(pick);
  state.douyinV2.statuses[pick.story.story_id] = "pending_review";
  saveDouyinV2Store();
  const wrap = v2El("div", "douyin-audit-package");
  wrap.append(v2El("h2", "", "文字审核包（草稿）"), v2El("p", "", "可直接复制或下载 Markdown；在人工核验和文案锁定前，不进入配音、动画或成片。"));
  const pre = document.createElement("pre");
  pre.textContent = text;
  wrap.appendChild(pre);
  const actions = v2El("div", "douyin-drawer-actions");
  actions.append(
    v2Button("复制审核包", "douyin-primary-btn", async () => { await v2Copy(text); v2Toast("审核包已复制"); }),
    v2Button("下载 Markdown", "douyin-secondary-btn", () => v2Download(`audit-${pick.story.story_id}.md`, text, "text/markdown;charset=utf-8")),
  );
  wrap.appendChild(actions);
  v2OpenContent(wrap, "audit");
  v2Render();
}

function v2OpenDrawer(pick) {
  state.douyinDrawerStoryId = pick.story.story_id;
  const wrap = v2El("div", "douyin-detail-content");
  const head = v2El("div", "douyin-drawer-head");
  head.append(v2El("span", "douyin-format-tag", pick.formatLabel), v2El("h2", "", pick.title), v2StatusChip(pick.status));
  const scores = v2El("div", "douyin-score-row");
  scores.append(v2ScorePill("事实", pick.factScore, pick.factGate ? "score-good" : "score-warn"), v2ScorePill("推流", pick.trafficScore), v2ScorePill("吸粉", pick.followScore), v2ScorePill("时长", pick.duration));
  const section = (title, value) => { const box = v2El("section", "douyin-detail-section"); box.append(v2El("h3", "", title), v2El("p", "", value || "暂无")); return box; };
  wrap.append(head, scores, section("事实边界", `${pick.fact.label} · ${pick.fact.note}`), section("推荐标题", pick.recommendedTitles.join("\n")), section("推荐钩子", pick.hook), section("推荐画面", pick.visual), section("推流依据", pick.pushReason), section("吸粉依据", pick.followReason), section("最大风险", pick.riskSummary.join("；")));
  if (pick.fact.primarySourceUrl) {
    const source = v2El("a", "douyin-drawer-source", "打开一手原文 ↗");
    source.href = pick.fact.primarySourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    wrap.appendChild(source);
  }
  const chain = v2El("section", "douyin-detail-section");
  chain.appendChild(v2El("h3", "", "来源链"));
  (pick.story.source_chain || []).slice(0, 8).forEach((item) => {
    const row = v2El("div", "douyin-chain-row");
    row.append(v2El("span", "", item.role || "source"), v2El("strong", "", item.source || ""), v2El("span", "", item.title || ""));
    chain.appendChild(row);
  });
  wrap.appendChild(chain);
  const claims = v2El("section", "douyin-detail-section");
  claims.appendChild(v2El("h3", "", "Key claims"));
  (pick.story.key_claims || [{ claim: pick.title }]).forEach((claim) => claims.appendChild(v2El("p", "", `• ${claim.claim}`)));
  wrap.appendChild(claims);
  const limits = v2El("section", "douyin-detail-section");
  limits.appendChild(v2El("h3", "", "Limits"));
  (pick.fact.limits || []).forEach((limit) => limits.appendChild(v2El("p", "", `• ${limit}`)));
  wrap.appendChild(limits);
  const statusRow = v2El("label", "douyin-detail-status");
  statusRow.appendChild(v2El("span", "", "工作流状态"));
  const statusSelect = document.createElement("select");
  DOUYIN_STATUS_FLOW.forEach((status) => {
    const option = document.createElement("option");
    option.value = status.id;
    option.textContent = status.label;
    option.selected = status.id === pick.status;
    statusSelect.appendChild(option);
  });
  statusSelect.addEventListener("change", () => setDouyinStatus(pick.story.story_id, statusSelect.value));
  statusRow.appendChild(statusSelect);
  wrap.appendChild(statusRow);
  const actions = v2El("div", "douyin-drawer-actions");
  actions.append(
    v2Button("生成文字审核包", "douyin-primary-btn", () => v2GenerateAudit(pick)),
    v2Button("标记已核验", "douyin-secondary-btn", () => setDouyinStatus(pick.story.story_id, "pending_review")),
    v2Button("标记已发布", "douyin-secondary-btn", () => setDouyinStatus(pick.story.story_id, "published")),
  );
  wrap.appendChild(actions);
  v2OpenContent(wrap, "detail");
}

function v2Dismiss(storyId) {
  if (!state.douyinV2.dismissed.includes(storyId)) state.douyinV2.dismissed.push(storyId);
  state.douyinV2.weekly = state.douyinV2.weekly.filter((id) => id !== storyId);
  saveDouyinV2Store();
  v2CloseDrawer();
  v2Render();
  v2Toast("已标记暂不做");
}

function v2RenderConclusion(top3, candidates) {
  if (!douyinV2Dom.conclusion) return;
  douyinV2Dom.conclusion.replaceChildren();
  const strongest = top3[0] || candidates[0];
  const gateCount = top3.filter((pick) => pick.factGate).length;
  const weeklyCount = top3.filter((pick) => pick.format === "weekly").length;
  const weakest = candidates.find((pick) => !pick.factGate);
  const samples = douyinSampleItems();
  const rows = [
    ["今天适合做什么", gateCount >= 2 ? "优先做单条快讯，保留一条深度或工具实测作为储备。" : "先补证，再做快讯；不建议直接做观点判断。"],
    ["今天最强的一手事件", strongest ? strongest.title : "暂无"],
    ["今天不建议做什么", weakest ? `不建议直接做：${weakest.title}（事实分 ${weakest.factScore}）` : "暂无明显高风险候选"],
    ["今天最值得观察的样本", samples.length ? samples[0].title : "样本库未接入，先观察真实同题视频，不用虚构数据代替。"],
  ];
  if (weeklyCount >= 2) rows[0][1] = "今天适合做周报/合集，再挑一个单条做引流。";
  douyinV2Dom.conclusion.appendChild(v2El("h3", "", "今日结论"));
  rows.forEach(([label, value]) => {
    const row = v2El("div", "douyin-conclusion-row");
    row.append(v2El("strong", "", label), v2El("span", "", value));
    douyinV2Dom.conclusion.appendChild(row);
  });
}

function v2Render() {
  if (!douyinV2Dom.wrap) return;
  const visible = state.mode === "selected"
    && state.activeSection === "all"
    && !state.query.trim()
    && !state.siteFilter
    && !state.authorFilter
    && !state.officialOnly;
  douyinV2Dom.wrap.hidden = !visible;
  if (!visible) return;
  const tab = DOUYIN_TAB_LABELS[state.douyinV2Tab] ? state.douyinV2Tab : "decision";
  state.douyinV2Tab = tab;
  douyinV2Dom.tabs?.querySelectorAll("[data-douyin-tab]").forEach((button) => {
    const active = button.dataset.douyinTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  [douyinV2Dom.decision, douyinV2Dom.pool, douyinV2Dom.samples, douyinV2Dom.weekly, douyinV2Dom.review].forEach((panel) => { if (panel) panel.hidden = true; });
  const activePanel = { decision: douyinV2Dom.decision, pool: douyinV2Dom.pool, samples: douyinV2Dom.samples, weekly: douyinV2Dom.weekly, review: douyinV2Dom.review }[tab];
  if (activePanel) activePanel.hidden = false;
  const candidates = douyinAllCandidates();
  const top3 = douyinTopThree(candidates);
  if (douyinV2Dom.meta) douyinV2Dom.meta.textContent = `${candidates.length} 条可选 · ${top3.filter((pick) => pick.factGate).length}/3 通过事实门 · ${DOUYIN_TAB_LABELS[tab]}`;
  if (douyinV2Dom.refresh) douyinV2Dom.refresh.disabled = candidates.length < 2;
  renderDouyinHotBoard();
  renderDouyinVerificationSummary(top3);
  if (tab === "decision") {
    v2RenderDataStrip(candidates);
    const rows = v2RenderTop3(candidates);
    v2RenderConclusion(rows, candidates);
  } else if (tab === "pool") {
    v2RenderPool(candidates);
  } else if (tab === "samples") {
    v2RenderSamples();
  } else if (tab === "weekly") {
    v2RenderWeekly();
  } else if (tab === "review") {
    v2RenderReview(candidates);
  }
}

function v2ImportSamples(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const rows = Array.isArray(parsed) ? parsed : parsed.items;
      if (!Array.isArray(rows)) throw new Error("JSON 顶层应为数组或包含 items 数组");
      const normalized = rows.filter((item) => item && item.title).map((item, index) => ({
        ...item,
        id: item.id || `imported_${Date.now()}_${index}`,
        metrics: {
          plays: Number(item.metrics?.plays ?? item.plays ?? 0),
          likes: Number(item.metrics?.likes ?? item.likes ?? 0),
          comments: Number(item.metrics?.comments ?? item.comments ?? 0),
          saves: Number(item.metrics?.saves ?? item.saves ?? 0),
          shares: Number(item.metrics?.shares ?? item.shares ?? 0),
        },
        keywords: Array.isArray(item.keywords) ? item.keywords : String(item.keywords || "").split(/[，,\s]+/).filter(Boolean),
      }));
      state.douyinV2.importedSamples = normalized;
      saveDouyinV2Store();
      v2Toast(`已导入 ${normalized.length} 条真实样本`);
      v2Render();
    } catch (error) {
      v2Toast(`样本导入失败：${error.message}`);
    }
  };
  reader.readAsText(file);
}

function v2ReviewMarkdown() {
  const lines = ["# 发布复盘记录", "", `导出时间：${new Date().toLocaleString("zh-CN")}`, ""];
  state.douyinV2.reviews.forEach((review, index) => {
    lines.push(`## ${index + 1}. ${review.actualTitle || review.recommendedTitle}`, "", `- 发布日期：${review.publishedAt || "未知"}`, `- 预测：事实 ${review.predictedFact} / 推流 ${review.predictedPush} / 吸粉 ${review.predictedFollow}`, `- 实际：播放 ${review.actualMetrics?.plays || 0} / 5 秒完播 ${review.actualMetrics?.completion5 || 0} / 完播率 ${review.actualMetrics?.completionRate || 0} / 涨粉 ${review.actualMetrics?.followers || 0}`, "");
  });
  return lines.join("\n");
}

function syncV2Filters() {
  const read = (id, fallback = "") => document.getElementById(id)?.value ?? fallback;
  state.douyinFilters = {
    query: read("douyinFilterQuery").trim(),
    gate: read("douyinFilterGate", "all"),
    format: read("douyinFilterFormat", "all"),
    type: read("douyinFilterType", "all"),
    source: read("douyinFilterSource", "all"),
    entity: read("douyinFilterEntity", "all"),
    factMin: Number(read("douyinFilterFact", 0) || 0),
    pushMin: Number(read("douyinFilterPush", 0) || 0),
    followMin: Number(read("douyinFilterFollow", 0) || 0),
    visual: Boolean(document.getElementById("douyinFilterVisual")?.checked),
    avoidChinaUnknown: Boolean(document.getElementById("douyinFilterChina")?.checked),
    series: Boolean(document.getElementById("douyinFilterSeries")?.checked),
    sensitive: Boolean(document.getElementById("douyinFilterSensitive")?.checked),
    duration: read("douyinFilterDuration", "all"),
    sort: read("douyinFilterSort", "priority"),
  };
  v2RenderPool(douyinAllCandidates());
}

function bindV2Events() {
  douyinV2Dom.tabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-douyin-tab]");
    if (!button) return;
    state.douyinV2Tab = button.dataset.douyinTab;
    v2Render();
  });
  document.getElementById("douyinFilterForm")?.addEventListener("input", syncV2Filters);
  document.getElementById("douyinFilterForm")?.addEventListener("change", syncV2Filters);
  document.getElementById("douyinFilterReset")?.addEventListener("click", () => {
    const form = document.getElementById("douyinFilterForm");
    form?.reset();
    syncV2Filters();
  });
  document.getElementById("douyinSampleImportBtn")?.addEventListener("click", () => document.getElementById("douyinSampleFile")?.click());
  document.getElementById("douyinSampleFile")?.addEventListener("change", (event) => {
    v2ImportSamples(event.target.files?.[0]);
    event.target.value = "";
  });
  document.getElementById("douyinSampleTemplateBtn")?.addEventListener("click", () => {
    const template = {
      generated_at: new Date().toISOString(),
      source: "manually-imported",
      disclaimer: "仅填写真实视频数据；未知指标填 0，不要虚构。",
      items: [{
        title: "示例标题",
        author: "作者",
        url: "",
        published_at: "2026-11-14",
        duration_seconds: 60,
        format: "flash",
        keywords: ["AI", "手机"],
        metrics: { plays: 0, likes: 0, comments: 0, saves: 0, shares: 0 },
      }],
    };
    v2Download("douyin-samples-template.json", JSON.stringify(template, null, 2), "application/json;charset=utf-8");
  });
  document.getElementById("douyinWeeklyAutoBtn")?.addEventListener("click", v2AutoWeekly);
  document.getElementById("douyinWeeklyExportBtn")?.addEventListener("click", async () => {
    const text = v2WeeklyMarkdown(v2WeeklyCandidates());
    await v2Copy(text);
    v2Toast("周报结构已复制");
  });
  document.getElementById("douyinReviewExportJson")?.addEventListener("click", () => v2Download("douyin-reviews.json", JSON.stringify(state.douyinV2.reviews, null, 2), "application/json;charset=utf-8"));
  document.getElementById("douyinReviewExportMd")?.addEventListener("click", () => v2Download("douyin-reviews.md", v2ReviewMarkdown(), "text/markdown;charset=utf-8"));
  douyinV2Dom.backdrop?.addEventListener("click", v2CloseDrawer);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") v2CloseDrawer(); });
  document.addEventListener("aiRadar:ready", v2Render);
}

// 覆盖主脚本的旧渲染入口，让所有现有刷新流程走 V2 工作台。
renderDouyinPicks = v2Render;
window.renderDouyinV2 = v2Render;
bindV2Events();
v2Render();

# TechPulse｜手机科技与 AI 情报看板

一个参考资讯网站展示逻辑改造的手机看板，基于 MIT 开源项目 [LearnPrompt/ai-news-radar](https://github.com/LearnPrompt/ai-news-radar) 的采集与页面框架。

目标很明确：**在一个手机页面里看全 GitHub、开源、科技、AI 和论文，并优先展示一手信息。**

## 看板逻辑

- **今日要闻**：多来源热点按重要度和热度排序
- **AI 视频选题工作台**：每日决策 TOP3、完整选题池、高流量样本、周报工坊和发布复盘五个标签页
- **三项评分**：事实分、推流分、吸粉分分别展示，并给出推荐形式、3 个标题、3 秒钩子、时长、画面、推流/吸粉依据和风险
- **一键审核包**：按候选生成 Markdown 文字审核包，包含事实边界、关键声明、限制、推荐结构和风险，未锁定文案前不进入配音与成片
- **抖音公开热榜**：每小时抓取公开榜单的排名、热度值、相关视频数、排名变化和在榜时长；明确标注“公开榜单不等于推荐流”
- **周报工坊**：从近 7 天 AI 事件中自动推荐 5–9 条，输出周报结构、分段钩子、画面建议和文字审核包
- **发布复盘**：本地保存预测与实际播放、完播、互动、涨粉数据，并导出 JSON/Markdown
- **高流量样本**：支持导入真实样本 JSON；未接入视频搜索时不生成虚构播放量或相似视频
- **AI + 热点匹配**：将热榜中的手机、教育、医疗、诈骗、版权、就业、汽车、机器人、游戏、短剧等大众词与 AI 事件做实体/借势匹配
- **GitHub 周/月热榜**：官方 Trending 周榜与月榜 TOP10
- **AI 权威观点与会议**：近 90 天官方实验室、研究机构、会议官方与深度访谈
- **AI 权威论文**：人工精选 40 篇不限年代里程碑论文 + Hugging Face Daily Papers 近 21 天热议 TOP10
- **首页总览与词云**：词云优先展示具体模型、产品、组织和技术路线，每 5 分钟检查最新数据
- **分类栏目**：全部 / GitHub / 开源 / 科技 / AI / 论文
- **精选与全部**：精选看聚合事件，全部看原始条目
- **只看一手**：只保留官方来源与研究/预印本
- **来源等级**：一手官方、研究/预印本、社区发现、媒体核验、定制 RSS
- **搜索与来源筛选**：搜索标题、摘要、来源，查看单一来源
- **来源健康状态**：失败来源单独显示，不阻断整页
- **原文直达**：每张卡片保留原始链接
- **事实边界**：区分已确认 / 媒体报道 / 分析观点 / 传闻待核 / 预印本，并显示一手原文、独立来源、转载数量与核验限制
- **来源链**：标出一手原文、独立报道、聚合入口与转载/同链关系
- **事实门**：事实分低于 70 的候选会标注“需补证据”，不会仅因标题有热度就压过已核验事件
- **官方源覆盖矩阵**：分别显示“当前有内容 / 已连接但近期无条目 / 未配置”，不把配置当成覆盖
- **手机安装**：Chrome 添加到主屏幕
- **手机一键同步**：首页右上角“立即同步”，首次配置 Fine-grained Token 后直接触发最新采集
- **手机阅读版式**：压缩字号与状态条；近日要闻/精选采用论文式卡片；AI 视频选题上下排列

## 内容范围

### GitHub
GitHub Blog、GitHub Changelog、GitHub Trending、仓库 Release 与 GitHub API。

### 开源
Show HN、Hacker News、Product Hunt、HelloGitHub 与 GitHub 新锐仓库。

### 科技
Google Blog、Apple Newsroom、NVIDIA Newsroom，以及 TechCrunch、The Verge、Ars Technica、MIT Technology Review、Wired、Engadget、Solidot、IT之家、爱范儿、InfoQ、少数派、量子位。

### AI
OpenAI、Anthropic、Google DeepMind、Google AI、Hugging Face、GitHub、NVIDIA、DeepSeek、Qwen、ByteDance Seed、MiniMax，以及 Microsoft Research、MIT News AI 等白名单来源与 AI 媒体。Meta AI、Microsoft AI、Moonshot/Kimi、智谱和公司 IR/SEC 目前明确列为待补覆盖，不以媒体代替官方源。

### 论文
arXiv cs.AI / cs.LG / cs.CL、Berkeley AI Research 等。

## 部署

1. 新建 GitHub 仓库，把项目上传到 `main`。
2. 在 `Settings → Pages` 中把 Source 选择 `Deploy from a branch`，分支 `main`，目录 `/(root)`。
3. 在 Actions 中手动运行一次 `Update AI News Snapshot`。
4. 用荣耀手机 Chrome 打开 Pages 地址，选择“安装应用”或“添加到主屏幕”。

详细说明见首页的“安装到手机”链接和 `setup.html`。

## 更新时效

- GitHub Actions 主任务每小时检查一次来源（UTC `17 * * * *`）。
- Freshness Watchdog 每 15 分钟检查快照；超过 70 分钟未更新时自动派发主任务。
- 首页“立即同步”可在手机上手动触发采集；Token 仅保存在当前设备浏览器。
- 主任务提交前会验证快照时间和条目数，避免出现“运行成功但数据未变化”。
- 实际到达时间取决于 RSS 发布时间、上游缓存和 GitHub Actions 排队。
- 这不是秒级实时系统；如果要求官方发布后几分钟内必达，需要换用常驻服务器或 Cloudflare Worker Cron。
- 页面只显示已进入数据快照的内容；点击刷新会重新读取最新已发布数据。

## 准确性策略

- 默认不启用 DeepSeek 标题改写、翻译和 persona 锐评。
- 来源标题、摘要和链接保持原样。
- 来源等级明确展示在卡片上。
- 每条聚合事件输出 `claim_status`、`primary_source_url`、`source_chain`、`key_claims`、`limits`、`independent_source_count` 与 `repost_count`。
- 预印本标注为研究/预印本，需回原文核验。
- 多来源事件会聚合，但不会把媒体标题当成官方事实；同一链接的聚合与转载不会伪装成独立确认。
- AI 视频选题把 `fact_score` 与 `traffic_score` 拆开：事实分决定能否进入优先排序，热度分参考公开热榜、大众影响、画面性、认知冲突和时效。
- 公开热榜仅使用无需登录的公开接口；不调用 TikHub、不读取登录态、不把公开榜单等同于推荐流或搜索指数。
- 热榜实体匹配对英文短词使用边界匹配，避免 `GEN` 误命中 `generation` 一类单词片段。
- GitHub 热榜直接读取 GitHub 官方 Trending 页面，不以二手榜单代替。
- AI 权威观点与会议使用白名单来源；保留原文标题、摘要、发布时间和链接，明确区分访谈/观点与会议官方信息。
- 对快讯、客户案例、纯产品发布和未确认传闻默认过滤，不将观点包装成事实。
- 权威论文 40 篇为编辑策展的里程碑清单，不按时间限制；最新热议 10 篇来自 Hugging Face Daily Papers，按点赞、评论与时效综合排序。
- 词云依据公开信息流和论文主题计算，不宣称为搜索引擎真实搜索量。
- 不承诺 100% 无误；涉及关键数字、结论和争议事件时，应以一手原文或论文为准。

## 本地运行

需要 Python 3.11+ 和 Node.js；推荐把 venv 和依赖放在 D 盘。

```powershell
python -m venv D:\AI-Tools\TechPulse-Dashboard\.venv
D:\AI-Tools\TechPulse-Dashboard\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/update_news.py --output-dir data --window-hours 24 --archive-days 21 --rss-opml feeds/follow.opml --rss-max-feeds 40
python -m http.server 8080
```

打开 `http://127.0.0.1:8080`。

测试：

```powershell
python -m pytest -q
node scripts/build_i18n.mjs --check
```

## 目录

- `index.html`：总览首页、AI 热点词云与子页面索引
- `dashboard.html`：今日情报、AI 视频选题、GitHub 热榜、权威论文和权威观点子页面
- `setup.html`：手机安装与来源说明
- `assets/app.js`：看板筛选、栏目、卡片和交互
- `assets/styles.css`：响应式视觉样式
- `scripts/update_news.py`：采集、分类、聚合、来源等级；支持 RSS、官方网页与官方 sitemap
- `scripts/verification.py`：事实边界、来源链、独立来源/转载、核验限制与官方覆盖矩阵
- `scripts/update_douyin_hot.py`：抖音公开热榜采集、排名历史、热度变化与 AI 借势词标记
- `assets/douyin-v2.js`：选题工作台五标签、TOP3、筛选、抽屉、周报、复盘与审核包交互
- `data/weekly-candidates.json`：近 7 天周报候选
- `data/douyin-samples.json`：真实高流量样本入口（默认空，不伪造数据）
- `scripts/update_github_rankings.py`：GitHub 官方周/月 Trending 采集
- `scripts/update_authority_voices.py`：AI 权威观点、会议与访谈白名单采集
- `scripts/update_papers.py`：40 篇权威论文与 10 篇最新热议论文
- `scripts/check_snapshot_age.py`：检查快照是否过期和是否包含数据
- `assets/home.js`：首页词云、快照和手机一键同步交互
- `feeds/follow.example.opml`：公开的一手优先订阅源
- `.github/workflows/update-news.yml`：每小时采集与 Pages 数据更新
- `.github/workflows/freshness-watchdog.yml`：每 15 分钟检查快照并自动派发更新
- `data/`：看板读取的 JSON 快照

## 限制

- GitHub Trending 是发现榜单，不等于项目事实；GitHub Blog、Changelog、Release 和仓库 API 才是一手事实来源。
- GitHub Actions 会有排队延迟；原生 `schedule` 是尽力而为，看门狗用于降低漏跑影响。
- 一些媒体有付费墙或会变更 RSS 地址，失败会显示在来源状态中。
- Meta AI、Microsoft AI、Moonshot/Kimi、智谱与公司 IR/SEC 尚无稳定公开订阅入口，当前在覆盖矩阵中标为未配置。
- 抖音公开热榜不是个性化推荐流，也没有搜索增长、7 日供给密度和账号完播数据；`traffic_score` 仍是规则参考，不是播放量预测。
- 公开热榜接口可能变更或临时限流；抓取失败时保留上一份热榜并显示错误，不伪造新数据。
- `claim_status` 是基于来源层级和标题/摘要信号的辅助标注，不是自动事实核查；所有正式内容仍需人工逐句回原文。
- 本项目不做推送，不做账号系统，不保存阅读历史。

## 来源与许可

本项目基于 **AI News Radar** 改造，原项目采用 MIT License。原项目版权与许可证随仓库保留，具体改造说明见 `CREDITS.md` 和 `LICENSE`。

TechPulse 改造部分同样采用 MIT License。

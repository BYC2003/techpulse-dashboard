# TechPulse｜手机科技与 AI 情报看板

一个参考资讯网站展示逻辑改造的手机看板，基于 MIT 开源项目 [LearnPrompt/ai-news-radar](https://github.com/LearnPrompt/ai-news-radar) 的采集与页面框架。

目标很明确：**在一个手机页面里看全 GitHub、开源、科技、AI 和论文，并优先展示一手信息。**

## 看板逻辑

- **今日要闻**：多来源热点按重要度和热度排序
- **抖音科普选题**：从近 48 小时信息流挑选 5 条，并给出讲解角度
- **GitHub 周/月热榜**：官方 Trending 周榜与月榜 TOP10
- **AI 权威观点与会议**：近 90 天官方实验室、研究机构、会议官方与深度访谈
- **分类栏目**：全部 / GitHub / 开源 / 科技 / AI / 论文
- **精选与全部**：精选看聚合事件，全部看原始条目
- **只看一手**：只保留官方来源与研究/预印本
- **来源等级**：一手官方、研究/预印本、社区发现、媒体核验、定制 RSS
- **搜索与来源筛选**：搜索标题、摘要、来源，查看单一来源
- **来源健康状态**：失败来源单独显示，不阻断整页
- **原文直达**：每张卡片保留原始链接
- **手机安装**：Chrome 添加到主屏幕

## 内容范围

### GitHub
GitHub Blog、GitHub Changelog、GitHub Trending、仓库 Release 与 GitHub API。

### 开源
Show HN、Hacker News、Product Hunt、HelloGitHub 与 GitHub 新锐仓库。

### 科技
Google Blog、Apple Newsroom、NVIDIA Newsroom，以及 TechCrunch、The Verge、Ars Technica、MIT Technology Review、Wired、Engadget、Solidot、IT之家、爱范儿、InfoQ、少数派、量子位。

### AI
OpenAI、Google DeepMind、Google AI、Hugging Face、Microsoft Research、MIT News AI、Anthropic / Claude 相关官方源与 AI 媒体。

### 论文
arXiv cs.AI / cs.LG / cs.CL、Berkeley AI Research 等。

## 部署

1. 新建 GitHub 仓库，把项目上传到 `main`。
2. 在 `Settings → Pages` 中把 Source 选择 `Deploy from a branch`，分支 `main`，目录 `/(root)`。
3. 在 Actions 中手动运行一次 `Update AI News Snapshot`。
4. 用荣耀手机 Chrome 打开 Pages 地址，选择“安装应用”或“添加到主屏幕”。

详细说明见首页的“安装到手机”链接和 `setup.html`。

## 更新时效

- GitHub Actions 每小时检查一次来源（UTC `17 * * * *`）。
- 实际到达时间取决于 RSS 发布时间、上游缓存和 GitHub Actions 排队。
- 这不是秒级实时系统；如果要求官方发布后几分钟内必达，需要换用常驻服务器或 Cloudflare Worker Cron。
- 页面只显示已进入数据快照的内容；点击刷新会重新读取最新已发布数据。

## 准确性策略

- 默认不启用 DeepSeek 标题改写、翻译和 persona 锐评。
- 来源标题、摘要和链接保持原样。
- 来源等级明确展示在卡片上。
- 预印本标注为研究/预印本，需回原文核验。
- 多来源事件会聚合，但不会把媒体标题当成官方事实。
- GitHub 热榜直接读取 GitHub 官方 Trending 页面，不以二手榜单代替。
- AI 权威观点与会议使用白名单来源；保留原文标题、摘要、发布时间和链接，明确区分访谈/观点与会议官方信息。
- 对快讯、客户案例、纯产品发布和未确认传闻默认过滤，不将观点包装成事实。
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

- `index.html`：手机看板主页面
- `setup.html`：手机安装与来源说明
- `assets/app.js`：看板筛选、栏目、卡片和交互
- `assets/styles.css`：响应式视觉样式
- `scripts/update_news.py`：采集、分类、聚合、来源等级
- `scripts/update_github_rankings.py`：GitHub 官方周/月 Trending 采集
- `scripts/update_authority_voices.py`：AI 权威观点、会议与访谈白名单采集
- `feeds/follow.example.opml`：公开的一手优先订阅源
- `.github/workflows/update-news.yml`：每小时采集与 Pages 数据更新
- `data/`：看板读取的 JSON 快照

## 限制

- GitHub Trending 是发现榜单，不等于项目事实；GitHub Blog、Changelog、Release 和仓库 API 才是一手事实来源。
- GitHub Actions 会有排队延迟。
- 一些媒体有付费墙或会变更 RSS 地址，失败会显示在来源状态中。
- 本项目不做推送，不做账号系统，不保存阅读历史。

## 来源与许可

本项目基于 **AI News Radar** 改造，原项目采用 MIT License。原项目版权与许可证随仓库保留，具体改造说明见 `CREDITS.md` 和 `LICENSE`。

TechPulse 改造部分同样采用 MIT License。

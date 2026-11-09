# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository privacy

This repository is **public** (GitHub Pages hosting requires it). It must never contain the user's private notes repository — its URL, owner/repo name, contents, or credentials — in any committed file (docs, GLOSSARY, ADRs, spec, tickets, source, fixtures). The notes repo is entered by the user at runtime in the app settings and stored on-device only. Never hardcode or reference it in code, tests, or fixtures.

## Development

### Commands

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite 开发服务器（http://localhost:5173） |
| `npm run typecheck` | `tsc --noEmit`（严格模式开机检查） |
| `npm test` | vitest 全量 |
| `npm run test:watch` | vitest 监听单测 |
| `npm run build` | 类型检查 + 构建 |
| `npm run verify:pwa` | 构建 + 校验 PWA 产物（sw.js/manifest/首页预缓存） |
| `bash scripts/wizard-token.sh` | 交互向导：建 GitHub 细粒度只读令牌联调（写入 gitignore 的 `.env`） |

### 架构（模块→责任）

- `src/idb.ts` — **IndexedDB schema 唯一所有者**。DB `md-mirror`（v4）：`settings`/`mirror`(path)/`meta`(key)/`reading`(path)/`assets`(path)。加存储表 → 只改这一处 + `DB_VERSION` 递增。
- `src/github/client.ts` — GitHub REST 客户端：trees 拉树、contents raw 取原文/字节。**绝不发送 `X-GitHub-Api-Version` 头**（浏览器 CORS 预检会失败）；空令牌走匿名只读。
- `src/mirror/{tree,store,mirror}.ts` — 镜像策略（只 `.md`、>10MB 标 `too-large`、增量 diff）、持久化、**两阶段编排**（先全部网络拉取、全成功才写库 → 失败不破坏旧镜像，这是离线可用的根基）。
- `src/reader/{render,mermaid,links,reading,ReaderView}.tsx` — markdown-it 渲染（`createMd(opts)` 工厂：可选注入 KaTeX 公式引擎 `math` + 开启 Mermaid 围栏宿主块 `mermaid`；表格+highlight，**原始 HTML 透传**，ADR-0002/0003）；每篇笔记进**独立 Shadow DOM**（样式不外漏、innerHTML 的 script 天然不执行）；内链分类/路径解析、阅读位置+最近、资源装配；`mermaid.ts` 按需 `import('mermaid')` 把放 `data-mermaid` 宿主块渲染成自包含 SVG 注入 shadow（语法错误降级保留源码+标）。
- `src/sync/{sync,time,SyncBanner}.tsx` — 同步编排（`runSync` 把 mirrorRepo 抛错映射为 typed 结果）、时间文案、状态横幅（「离线 · 上次同步 x 分钟前」）。
- `src/notes/{group,NotesList}.tsx` — 全部笔记按顶层目录分组列表。
- `src/search/{index,SearchResults}.tsx` — 全局标题搜索（H1–H6 + 文件名/路径；命中标「文件」/「标题 H{n}」，可双标）。
- `src/assets/{extract,store,pipeline,wire}.ts` — 资源懒加载：API 拉字节→dataURL 入 `assets` 表→装配给 img/a；>10MB 占位；「全下」。
- `src/settings/{store,SettingsView}.tsx` — 设置（PAT / owner/repo / 同步开关默认开、公式 KaTeX / Mermaid 开关默认关；公开库令牌可不填）。

### 测试缝约定

- 逻辑优先写成**纯函数/组件**，测试缝与用户确认后写；断言用**已知字面量**（独立来源），不拍快照。
- 测试数据一律**哑值**（`me/fixtures`、`ghp_test_dummy`…）；fixture 只锚公开仓库形状。
- UI 接线（App 集成）用 stub fetch + 预置 IndexedDB 的集成测试覆盖关键验收（如同步开关守门、搜索过滤）。

### 关键规则

- **隐私红线**见上节；写任何会被 commit 的文档/代码前自查一遍。
- 改 DB schema 只在 `src/idb.ts`；改部署路径同时改 `vite.config.ts` 的 `base` 与 manifest `start_url`（当前 `/git-md-pwa/`）。
- 线上 = GitHub Pages 子路径；发布靠 push `main` → `.github/workflows/pages.yml`。

### 已知工具链坑：typescript 版本（备用方案存档）

- `typescript` 钉回 **`~5.9.3`**（纯 JS）。原因：`typescript@^7`（Go 原生）的二进制来自 **20 个可选平台包**（`@typescript/typescript-linux-x64` 等）；而 **Windows 上 `npm install` 重写 lock 时只留本机平台包**（`win32-x64`），GitHub Actions（ubuntu）`npm ci` 严格按 lock 安装 → 拿不到 linux x64 → `tsc` 启动崩。注意 lock 里平台条目曾被 07a/07b 在 Windows 装依赖时从 20 个洗成 1 个，一度让 CI 红（后已改 TS5.9 根治）。
- **备用（如日后要切回 TS7）**：① `npm i -D typescript@^7.0.2`；② 把 `git show 6cbd49a:package-lock.json` 里 20 个 `node_modules/@typescript/*` 平台包条目合并回 lock；③ **每次在 Windows 改依赖后**跑下面的检查，确认平台条目未再被洗掉（CI 靠它）：
  `node -e "const l=require('./package-lock.json');const k=Object.keys(l.packages).filter(x=>x.includes('@typescript/'));console.log(k.length,k)"`（期望 20）。

Research / triage / spec skills read the setup below:

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

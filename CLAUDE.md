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

### 已知工具链坑：原生平台二进制包（当前修复 + TS7 备用方案存档）

- **坑**：`rolldown`（Vite 8 的 bundler）、`rollup`、`typescript@7` 用**可选平台二进制包**（`@rolldown/binding-linux-x64-gnu`、`@rollup/rollup-linux-x64-gnu`…）。**Windows 上 `npm install` 重写 lock 只留本机平台条目**（rolldown 15 条→剩 1、rollup 同理）→ ubuntu `npm ci` 严格按 lock 装 → 缺 linux 二进制 → 构建崩（已在 `tsc` 与 `vite build` 各触发一次，经 WSL linux 复现确认）。
- **根因/已实测**：① 依赖 lock 缺条目时，**连 `npm install` 也不补装平台可选包**（npm/cli#4828），所以临时把 workflow 改成 `npm install` 无效；② 正解是 **lock 必须跨平台**——把 `6cbd49a:package-lock.json` 里的 `@rolldown/binding-*`、`@rollup/rollup-*` 平台条目并入当前 lock（版本与现有 win32 条目一致即可）。
- **当前修复（根治）**：workflow **回 `npm ci`** + 提交的 lock 已是跨平台；`scripts/verify-lock-platforms.mjs` 在 CI 的 `npm ci` 前跑，**任何原生平台族只要只剩单平台条目就直接红**——以后在 Windows 改依赖把 lock 洗掉时，合入即被拦，而不是 build 才爆炸。
- **`typescript` 另钉回 `~5.9.3`（纯 JS，无平台二进制）**，`tsc` 稳定。
- **备用（如日后要切回 TS7）**：① `npm i -D typescript@^7.0.2`；② 把 `git show 6cbd49a:package-lock.json` 里 20 个 `node_modules/@typescript/*` 平台包条目合并回 lock；③ 检查命令（期望 20 条）：`node -e "const l=require('./package-lock.json');const k=Object.keys(l.packages).filter(x=>x.includes('@typescript/'));console.log(k.length)"`。

Research / triage / spec skills read the setup below:

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

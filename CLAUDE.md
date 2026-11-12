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
| `npm run verify:pwa` | 构建 + 校验 PWA 产物（sw.js/manifest/首页预缓存/version.json；prompt 不变量：无自动 clientsClaim、有 SKIP_WAITING 通道） |
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
- `src/updates/{version,format,useUpdate,UpdateBanner}.ts` — PWA 更新编排：prompt 模式「发现新版本」横幅（Q8：同版本只提示一次，记住到 settings）＋在线每 10 分钟周期复查＋Settings「检查更新」（永远 verbose）。版本串 `v<semver>+<git短SHA>` 经 vite `define` 注入 `__APP_VERSION__`，同串构建期写 `dist/version.json`（不入预缓存、只走网络，更新检测读它）。

### 测试缝约定

- 逻辑优先写成**纯函数/组件**，测试缝与用户确认后写；断言用**已知字面量**（独立来源），不拍快照。
- 测试数据一律**哑值**（`me/fixtures`、`ghp_test_dummy`…）；fixture 只锚公开仓库形状。
- UI 接线（App 集成）用 stub fetch + 预置 IndexedDB 的集成测试覆盖关键验收（如同步开关守门、搜索过滤）。
- 集成测试 **render `<App/>` 前先 `vi.mock('virtual:pwa-register/preact')` 成空适配器**，否则 vitest 解析该虚拟模块直接崩（`file:///@vite-plugin-pwa/…`）；SW 引擎只在 `src/updates/useUpdate.test.tsx` 经此模块缝驱动。

### 关键规则

- **隐私红线**见上节；写任何会被 commit 的文档/代码前自查一遍。
- 改 DB schema 只在 `src/idb.ts`；改部署路径同时改 `vite.config.ts` 的 `base` 与 manifest `start_url`（当前 `/git-md-pwa/`）。
- 线上 = GitHub Pages 子路径；发布靠 push `main` → `.github/workflows/pages.yml`。
- 手机 PWA「打开还是旧版」排查：先 `git fetch https://github.com/<owner>/<repo> main` 比对远端（本地=远端 → 部署无误，问题在设备侧）；部署正常仍旧 → 多为 **iOS 对已装主屏 PWA 守旧 SW（不会自己好）**，验收=重装（删图标 → Safari 清除站点数据 → 重开 → 重加）。本版 workbox **无 `updateViaCache` 选项，勿加**——浏览器默认对 SW 主脚本做网络重校验。

### 已知工具链坑：原生平台二进制包（根因 + 守卫）

- **坑**：`rolldown`（Vite 8）、`rollup`、`lightningcss`、`typescript@7` 都用**可选平台二进制包**（`@rolldown/binding-linux-x64-gnu`、`@rollup/rollup-linux-x64-gnu`、`lightningcss-linux-x64-gnu`、`@typescript/typescript-linux-x64`…）。**Windows 上 `npm install` 重写 lock 只留本机平台条目** → ubuntu `npm ci` 严格按 lock 装 → 缺 linux 二进制 → 构建崩。实际触发三处：`tsc`（TS7）、`vite build`（rolldown）、CSS 压缩（lightningcss），全部经 WSL linux 复现确认是同一根因，**与 typescript 版本无关**。
- **根因/已实测**：① lock 缺条目时**连 `npm install` 也不补装平台可选包**（npm/cli#4828），临时改 workflow 用 `npm install` 无效；② 正解是 **lock 必须跨平台**——把历史上全量跨平台的 lock（如 `6cbd49a`）里的同族平台条目并回当前 lock（版本一致即可）。
- **当前修复（根治）**：提交的 lock 已是跨平台（rolldown/rollup/lightningcss/typescript 全平台条目）；**`typescript` 保持 `^7.0.2`**（问题从来不是 TS，勿再降 5.9）；workflow 回 **`npm ci`**，且 `scripts/verify-lock-platforms.mjs` 在 `npm ci` 前跑——**通用守卫按「包名含 OS 令牌」自动识别所有原生平台族，任一族只要只剩单平台（win32-only）就直接红**，不再手列名单。
- **恢复操作**（若未来有人在 Windows 改依赖又把 lock 洗了）：`node scripts/verify-lock-platforms.mjs` 会在 CI 报出被洗的族；从 `git show <跨平台ref>:package-lock.json` 把同族条目并回即可（历史全量 ref：`6cbd49a`）。
- **复现 ubuntu CI（WSL 原生 linux node）**：平台类构建错（native binding / lightningcss / …）不必等 push，本机本地复现。一次备好原生 node（linux 平台，勿用 WSL interop 的 win32 npm）：
  `cd $HOME && VER=v22.22.1 && curl -fsSL -o node.tar.xz https://nodejs.org/dist/$VER/node-$VER-linux-x64.tar.xz && tar -xJf node.tar.xz && mv node-$VER-linux-x64 node-linux`
  逐次复现/复验（D:\… 在 WSL 是 /mnt/d/…）：
  `export PATH=$HOME/node-linux/bin:$PATH; cd $HOME && rm -rf ci-repro && git clone <仓库Windows路径> ci-repro && cd ci-repro && npm ci && npm run build`
  判据：`npm run build` 失败=该提交复现；绿=已修。注意 **WSL 的 /tmp 会话间会被清**，toolchain/临时文件放 $HOME 才持久。

Research / triage / spec skills read the setup below:

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

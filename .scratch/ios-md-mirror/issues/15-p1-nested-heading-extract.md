Status: resolved
Type: task
Blocked by: 14-p1-result-ranking

# 15 · P1 嵌套标题抽取：markdown-it token 流（配置开关可回退）

`#### 💛 grill-me (skill)` 这类标题若被 CommonMark 容器（引用 `>` / 列表 `-`）包裹，渲染仍是 H4（能进单篇 TOC 目录），但全局搜索 `extractHeadings` 用逐行正则只认行首 `#`，漏掉嵌套标题 → 搜 `grill` 标题标为空，仅正文命中。

## 定位（2026-11-16）

- 全局搜索吃 **markdown 原文**（`src/search/extractHeadings`：`line.trim()` 后 `/^(#{1,6})\s+/` 逐行匹配）。
- 单篇 TOC（`src/reader/toc.ts` `assignHeadingIds`）吃 **渲染后 shadow DOM** `querySelectorAll('h1..h6')` → 容器包裹的标题仍成 `<h4>` →「目录弹出能看到、全局搜索搜不到」的矛盾即源于此。
- 复现（临时测试已删）：`> #### 💛 grill-me (skill)` 或 `- #### …` → `searchNotes('grill')` 标题命中为空；普通裸 `####` 正常。

## 方案

`extractHeadings` 增模式参数：**token 流（默认，markdown-it parse 后取 `heading_open` token）** vs **regex（旧行为）**。token 流只吃块级语法（CommonMark+表格，不需要 linkify/highlight，建索引最小实例），markdown-it 对容器包裹的标题天然产出 `heading_open` token；围栏内代码块的 `#` 天然不出 heading token（无需像正则那样手写围栏跳桶）。代码围栏语义与现有正则一致（现有 `extract-headings.test.ts` 用例锚定该语义，token 流须全绿）。

**新增设置开关 `AppSettings.betterHeadingExtract: boolean（默认 true=token 流）`**：手机端如果索引重建耗时不可接受可关回旧正则。开关变化需重建索引（`app.tsx` buildIndex 的 useMemo 依赖加该字段）。

## 实测基准（591 篇 / 595 万字符，jsdom 环境，已记录）

| 维度 | regex（现状） | token 流（完整链路配置） | token 流（最小实例，建索引） |
|---|---|---|---|
| 时间（索引重建一次） | **32 ms** | 701 ms | **577 ms** |
| 内存稳态（591 篇后） | +4.2 MB | +1.6 MB | — |
| 内存瞬时峰值 | — | — | ~0.05 MB/篇（10KB 内容） |
| 磁盘 | 零变化（buildIndex 纯内存，不写 IDB） | 同 | 同 |

- buildIndex 是 `useMemo(files)`，只在同步/首载后重建一次，搜索路径不受影响；0.5s 一次性成本叠加在既有同步耗时中。
- 内存：token 数组逐篇生成逐篇释放，峰值=单篇 token 大小，不随总篇数增长；索引本体（headings 数组）两方案大小相同。
- 磁盘：`IndexEntry.body` 引用 files 的 content 字符串不复制；索引不写 IndexedDB → 磁盘零影响。

## Answer

- 2026-11-16 完成。`extractHeadings` 加模式参数 `ExtractMode = 'token' | 'regex'`（默认 token）：token 流用**最小 markdown-it 实例**（仅 CommonMark+表格，无 linkify/highlight 的 `indexMd`）`parse` 后取 `heading_open` token，文本取紧随的 `inline.content`；现有 `extractHeadingsRegex` 保留为 `mode='regex'` 分支。
- 语义验证：旧 `extract-headings.test.ts` 全绿在 token 流下跑通（围栏内不算标题、`#` 无空格不算、CommonMark 尾部 `#`、CRLF），新增用例锁「引用> / 列表- / 有序1. 内的标题 token 流抽出」「regex 模式退回旧行为」「围栏内标题 token 流也不抽」。
- **设置开关 `AppSettings.betterHeadingExtract`（默认 true=token 流）**：`SettingsView` 加 checkbox「检索用渲染器语义提取标题」；`app.tsx` `buildIndex(files, mode)` 依开关选模式、useMemo 依赖加该字段（开关变化重建索引）。`searchNotes`/`rankHit`/TOC 全部不用动。
- 性能/资源基准（591 篇 / 595 万字符，jsdom）：时间 regex 32ms → token(最小实例) 577ms，索引重建一次性（buildIndex 是 useMemo(files)，只在同步/首载时机，搜索路径不受影响）；内存 token 流稳态 +1.6MB（比 regex 的 +4.2MB 还省，token 逐篇释放、峰值≈单篇 ~0.05MB）；磁盘零变化（索引纯内存、不写 IDB）。
- 全量 241/241 绿，typecheck ✓，verify:pwa ✓（111 预缓存）。隐私自查：fixtures 仍哑值，未引用私库内容。


## Terms

- `索引`：见 GLOSSARY「全局搜索」；`单篇 TOC`：见票 08/11/13。

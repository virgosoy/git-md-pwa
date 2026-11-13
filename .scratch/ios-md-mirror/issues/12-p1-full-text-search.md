Status: resolved
Type: task
Blocked by: 06-p1-title-search

# 12 · P1 全文搜索（正文）

把全局搜索从「标题 + 文件名」扩展到**正文全文**：查询片段命中笔记正文时也返回该笔记，并带一段上下文摘录（snippet）让用户知道命中在哪。离线可用（索引仍本地预计算，不联网）。

**范围边界**：本票只加「正文命中」。`draft.md` 里另有三条独立搜索项**不在本票**：① 检索结果排序优化、② 单篇 TOC 目录内搜索、③ 检索展示优化——各是独立后续票，不混入。

## 语义（决策已定）

- **命中来源三态**：`文件`（路径/文件名含片段）、`标题 H{n}`（H1-H6 标题含片段）、`正文`（正文文本含片段）。三态可叠加（沿用票 06「双标」思路，现变「三标」）。
- **「正文」的判定**：查询片段出现在**非标题、非围栏标记行**的文本里。标题命中不重复计入正文（避免每篇标题命中都同时冒一个冗余「正文」标）。代码块内正文算正文（可搜），围栏标记行本身跳过。
- **Snippet**：命中正文的那一行，trim 后截断到 **140 字符**（超长尾加 `…`）。命中多行取第一行。
- **大小写不敏感、子串匹配**：与票 06 完全一致。
- **排序不变**：仍按路径 `localeCompare`（排序优化是另一张票，本票不碰）。

## 架构

- `src/search/index.ts`：`IndexEntry` 增 `body: string`（存 `f.content` 的**引用**，不复制字符串——JS 字符串不可变、按引用共享，内存开销≈每文件一个指针）；`buildIndex` 一行把 content 挂进索引。新增纯函数 `findBodySnippet(content, query)`（围栏感知，镜像 `extractHeadings` 的围栏跳桶逻辑）返回首个命中正文行或 `null`。
- `searchHeadings` 改名 `searchNotes`：命中时补 `bodyMatch: boolean` + `bodySnippet: string | null`。
- `SearchResults.tsx`：正文命中加「正文」标签 + 摘录文本。
- `app.tsx`：`searchHeadings` → `searchNotes`（单处 import + 调用）。

## Slices

1. `index.ts`：`findBodySnippet` + `searchNotes`（含 `IndexEntry.body`、`SearchHit` 扩展）+ `search.test.ts` 补正文用例。
2. `SearchResults.tsx` + `app.tsx` 接线 + `app.search.test.tsx` 集成「正文命中带标签与摘录」。
3. 全量测试绿 + typecheck + `verify:pwa` + 隐私自查；回写本票 + spec 队列 + draft.md。

## 验收

- 搜一个只出现在正文、不在标题/文件名的片段 → 返回该笔记，带「正文」标签 + 摘录，点击可打开。
- 标题命中不产生冗余「正文」标。
- 代码块内片段可搜到；围栏标记行本身不产生正文命中。
- 大小写不敏感、空查询返回空、按路径排序、离线可搜——与票 06 行为一致。

## Answer

- 2026-11-13 完成。`index.ts` 增 `findBodySnippet`（围栏感知：代码块内正文可搜、围栏标记行与标题行跳过；命中行 trim 后截断 140 字符加 `…`）；`IndexEntry` 增 `body`（存 content 引用，不复制）；`searchHeadings` 改名 `searchNotes`，命中补 `bodyMatch` + `bodySnippet` 三态（文件/标题/正文可叠加）。
- 接线：`app.tsx` 单处改 import + 调用；搜索框占位「搜索标题 / 文件名 / 正文」；`SearchResults.tsx` 加「正文」标签 + 摘录（正文独显时主行用 snippet，标题+正文双命中时正文摘录另起一行）。
- 测试：`search.test.ts` 重写为 `searchNotes` + `findBodySnippet` 用例（含「标题行不算正文」「代码块内算正文」「截断」）；`app.search.test.tsx` 补集成「正文命中带标签与摘录、不含标题标签」。
- 全量 220/220 绿（31 文件），typecheck ✓，verify:pwa ✓（111 预缓存 / prompt 模式不自跳）。mermaid 真机 smoke 在全量跑时偶发超时、单跑即绿——与本票无关的既有 flake。
- 隐私自查：无笔记库痕迹（fixtures 仍 `me/fixtures` 哑值）。
- draft.md 仍挂三条独立搜索项（排序优化 / TOC 内搜索 / 展示优化），不在本票范围，留队列。


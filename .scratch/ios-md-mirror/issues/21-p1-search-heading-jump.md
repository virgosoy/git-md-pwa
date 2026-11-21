Status: resolved
Type: task

# 21 · P1 主页搜索结果点标题直接跳到该标题

首页全局搜索（票 06/12/14/15）的结果里，每条命中的标题行目前只是展示。本票让**标题行成为独立点击目标**：点击后打开该笔记并直接滚到这条标题；结果卡其余区域（文件名主行 / 目录 / 正文摘录 / 空白）保持现有行为（打开笔记、还原上次阅读位置）。定位不到目标标题时降级为普通打开，并用底部 notice 轻提示（4 秒自动消失）。

## 决策

- **交互**：结果卡由「整卡一个 `<button>`」改为容器 div；文件名主行为独立 button（普通打开）；每个命中标题行为独立 button（打开并跳转）。标题行不新增箭头/下划线等装饰，只给 `:active` 反馈。
- **标题文本口径**：索引抽取的标题文本改从 markdown-it `inline.children` 的 `text` + `code_inline` 拼纯文本，与渲染后 `textContent` 对齐；建索引的 markdown-it 实例开 `html:true`（与 `render.ts` 的渲染器一致，否则标题内行内 HTML 抽不对）。副作用：结果标题行不再显示 `**` 等标记；搜索 `**`、链接 URL、图片 alt 不再命中标题（正文不受影响）。
- **定位机制**：`Heading` 增加 `nth`（同 level+text 的第几次出现，1 起）；点击把 `{level,text,nth}` 传给阅读器，阅读器在 `assignHeadingIds` 的结果里按同规则找第 nth 个。找不到 → 还原阅读位置 + 提示。
- **regex 回退模式**（`betterHeadingExtract=false`）：保持原样，跳转 best-effort（文本带标记，可能对不上 → 走提示降级）。
- **notice**：去掉 `notice && !current` 门控，阅读器里也显示（顺带修「阅读中点内链到未镜像笔记、提示不可见」的旧缺口）；所有 notice 统一 4 秒自动消失。跳转失败文案：「未找到该标题，已从上次阅读位置打开」。
- **阅读位置**：跳转后滚动照常防抖写回；下次打开停在该标题。

## 实现要点

- `src/search/index.ts`：`Heading` 增 `nth`；抽出 `inlinePlainText`；`indexMd` 开 `html:true`；两条抽取路径统一过 `withNth`；新增 `HeadingAnchor` 类型与纯函数 `findAnchorIndex(headings, anchor)`。
- `src/search/SearchResults.tsx`：行结构重构；新 prop `onOpenHeading(path, anchor)`。
- `src/styles.css`：`.search-item` 迁到容器 div（沿用 `.recent__item` 外观）；`.search-item__name` / `__heading` 复位 button 默认样式。
- `src/reader/ReaderView.tsx`：新 props `initialAnchor`、`onAnchorMiss`；`fill()` 里 `assignHeadingIds` 之后按锚点定位（仅新笔记；同路径刷新不重复跳、不重复提示）。
- `src/app.tsx`：`openNote(path, anchor?)`；`OpenNote` 增 `anchor?`；接 `onOpenHeading`；notice 门控去掉、加 4 秒自动消失 effect。

## 测试

- `src/search/extract-headings.test.ts`：既有期望补 `nth`；新增行内标记剥纯文本（链接/行内 HTML/图片 alt）与重复标题 nth 用例。
- `src/search/search.test.ts`：既有字面量补 `nth`；新增 `findAnchorIndex` 用例。
- `src/reader/ReaderView.test.tsx`：命中锚点不回调 miss；未命中回调 `onAnchorMiss` 且保留阅读位置。
- `src/app.search.test.tsx`：点标题行打开笔记并显示正文；点主行照旧打开。

## 范围边界

- 不做：跨笔记跳到标题后的「回到搜索结果」历史栈；不为 regex 回退模式做伪渲染剥标记；不改 DB schema；不改阅读位置保存逻辑。
- 隐私：本票不新增任何 owner/repo/令牌读写；测试 fixture 保持哑值（`me/fixtures`、`ghp_test_dummy`）。

## 验收

- 搜索出带标题的结果 → 点标题行 → 打开该笔记并滚到该标题（12px 偏移）。
- 点文件名/摘要/空白 → 普通打开，还原阅读位置。
- 无标题命中的结果行为不变；普通词搜索行为不变。
- 定位失败 → 普通打开 + 「未找到该标题，已从上次阅读位置打开」，4 秒自动消失。
- 「尚未镜像」提示在阅读器里也可见（门控已去）。
- `npm test` / `npm run typecheck` / `npm run build` 全绿；隐私自查通过。

## Answer

- 2026-11-21 完成。
- `src/search/index.ts`：`Heading` 增 `nth`（同 level+text 第几次出现，1 起）；标题文本改由 `inlinePlainText` 拼 `text`/`code_inline` 子 token（链接文字、行内 HTML 可见文本、行内代码保留；链接 URL、图片 alt 剔除），与渲染后 `textContent` 对齐；建索引实例开 `html:true`（与 `render.ts` 一致）；token/regex 两条路径统一过 `withNth`。新增 `HeadingAnchor` 与纯函数 `findAnchorIndex(headings, anchor)`（找不到返回 -1）。
- `src/search/SearchResults.tsx`：结果卡由整卡 `<button>` 改为容器 div；文件名主行、每条命中标题行都是独立 button（标题行点击 `stopPropagation` 后 `onOpenHeading(path, hh)`）；目录/摘录/空白仍走普通打开。新 prop `onOpenHeading`。
- `src/styles.css`：`.search-item` 迁到容器 div（沿用 `.recent__item` 外观）；`__name` / `__heading` 复位 button 默认样式，加 `:active` 弱反馈。
- `src/reader/ReaderView.tsx`：新 props `initialAnchor` / `onAnchorMiss`（用 ref 存储，不进 effect 依赖）；`fill()` 里先还原 `initialScrollTop`，仅新笔记且带锚点时按 `findAnchorIndex` 定位并 `headingScrollTarget` 滚动，未命中回调 miss（同路径刷新不重跳、不重提示）。
- `src/app.tsx`：`openNote(path, anchor?)`、`OpenNote.anchor`；接 `onOpenHeading`；ReaderView 传 `initialAnchor` 与 miss 提示「未找到该标题，已从上次阅读位置打开」；notice 去掉 `!current` 门控（阅读器里也可见，顺带修内链未镜像提示的旧缺口），新增 `NOTICE_AUTO_DISMISS_MS = 4000` 自动消失 effect。
- 测试：+8 → 全量 286/286 绿（38 文件）；`typecheck` ✓；`build` ✓（111 预缓存，5.67 MiB）。新增/更新：`extract-headings.test.ts` 补 nth + 行内标记剥纯文本 + 重复标题 nth；`search.test.ts` 补 nth + `findAnchorIndex` 两组；`ReaderView.test.tsx` 锚点命中（scrollTop = 阅读位置 - 12）/未命中（保留位置 + miss 回调）；`app.search.test.tsx` 点标题行打开并跳转（锚点覆盖阅读位置 500→488）、定位失败弹提示并在 4.2s 后自动消失。
- 文档：`GLOSSARY.md` 全局搜索条目补「标题行可点击跳转」；`CLAUDE.md` 架构表 search 行补文本口径与跳转。
- 隐私自查：未新增任何 owner/repo/令牌读写；测试 fixture 仍为哑值（`me/fixtures`、`ghp_test_dummy`）。

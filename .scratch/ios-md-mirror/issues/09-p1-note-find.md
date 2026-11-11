Status: resolved
Type: task
Blocked by:

# 09 · P1 单篇笔记内查找（应用内 find-in-note）

阅读单篇笔记时，**应用内**「在笔记里查找」：读器顶栏加🔍按钮，展开顶部查找条；在**渲染后正文**里做大小写不敏感子串匹配，输入即高亮全部命中、当前命中区分、显示 n/m、上一下一（循环）、回车下一个、自动滚动到当前命中、无命中提示。

**背景（grilling 已定，2026-11-11）**：iPhone PWA 独立模式（display:standalone）无 Safari 工具栏，iOS 无任何 WebKit/JS API 可调出原生「页面内查找」（`window.find()` 在 iOS 不可用；iOS 26 也只加了 Safari 浏览器 chrome 里的入口，且**即使切回 Safari，原生 find 也看不到 Shadow DOM 里的正文**）。**应用内查找是唯一能搜到正文的方式**。`draft.md:10`（原「或暂时实现 safari 页面内搜索」已作废）。

**完成定义**：单篇笔记打开后顶栏有🔍；点开 → 标题下方滑出查找条（输入框 + n/m + ↑↓ + ✕），自动聚焦；输入即高亮全部命中（Shadow DOM 内 `<mark>`），当前命中高亮色不同；n/m 计数与「无结果」提示；↑/↓/回车上一下一，循环；关闭（✕/Esc）→ 还原查找前阅读位置、清除高亮。

## 决策（2026-11-11 grilling 已定）

- **形态**：应用内查找；Safari 原生线排除（平台事实已复核 + Shadow DOM 不可见双重确认）。
- **范围**：**当前打开的这篇**笔记。检索 `.md-body` 渲染后可见文本：正文/各级标题/表格/代码块都算；大小写不敏感、子串、非重叠匹配。**跳过 `[data-mermaid]` 渲染出的 SVG 文字**（`mermaid` 关闭或渲染失败时，`data-mermaid` 宿主块不存在/保留源码，自然可搜）；同时跳过 `script/style/template/noscript`（raw HTML 透传的防御）。
- **交互**：标准查找式——输入即高亮全部命中；当前命中 `.is-current` 另一色；n/m；↑↓按钮 + 回车下一个（Shift+回车上一个）；循环；自动滚动到当前命中（`headingScrollTarget` 复用，offset 12）；无命中显示「无结果」。
- **位置（Q4）**：查找期间**不触发** `onScroll` 的防抖保存（`.reader` 的 onScroll 按 `findOpen` 断路）；关闭时**还原查找前 scrollTop**（打开瞬间记录），并清高亮、清输入。阅读位置不被临时查找污染。
- **入口/布局（Q5）**：读器顶栏（`app.tsx` header，`‹ 返回 · 标题 · [全下 🔍]`）加🔍按钮（`aria-label`）；查找条放 **light DOM**、ReaderView 顶层（`.app__main--flush` 改 `display:flex; flex-direction:column`，`.reader` 改 `flex:1; min-height:0`，bar 占自己的行、reader 占剩余——bar 显隐不破坏 `.reader` 作为唯一滚动容器）。不用底部（会压 TOC 按钮 + 被键盘顶走）。
- **键盘（Q6）**：**不拦截** Cmd/Ctrl+F（只用🔍按钮；Esc 关闭）。桌面浏览器原生 Cmd+F 依然看不到 shadow 正文——已知限制，如实记录（不引入设置项）。
- **工具**：`find` 状态（query/count/current）放 Preact state；高亮落在 shadow 的 mark，`fill()` 重建（refreshToken/全下）后**重放**（读 refs 重 apply + 恢复 current）。
- **无新设置项 / 无 DB schema / 无新依赖**。

## Slices

1. `src/reader/find.ts` 纯函数 + `find.test.ts`：`findMatchesInText`（大小写不敏感/非重叠/边界）、`collectLeafTexts`（跳 mermaid/script/style，文档序）、`planFind`、`clearMarks`（unwrap + `normalize`，保证跨上次边界的命中可再匹配）、`applyFind`（逆序 split+wrap 避免同叶多命中坐标失效；当前命中落 index 0）、`setCurrentMark`。
2. ReaderView 接线：🔍打开的 bar（light DOM）+ `findOpen`/`onFindClose` props + 滚动门控 + 打开记录/关闭还原 + `fill()` 后重放；
   - `app.tsx`：header 加🔍 + `findOpen` state + `openNote` 重置；`styles.css` flex 布局 + `--find-hit*` token + find-bar 样式。
   - `ReaderView.test.tsx` 新 describe（集成）：输入→高亮计数+n/m、prev/next 循环、无结果、findOpen 时 .reader 滚动不冒泡 onScroll、关闭还原 scrollTop。
3. 全量测试绿 + typecheck + `verify:pwa` + 隐私自查；spec/票回写；draft.md 勾掉；提交附带 iPhone 手验清单。

## 验收

- 打开笔记 → 顶栏🔍；点开滑出顶部查找条并自动聚焦输入框。
- 输入「快速」：正文里所有命中高亮（含代码/表格/标题内），计数 1/n，当前命中色不同；回车/↓/↑ 逐个跳并循环、自动滚动；改输入实时重算。
- 乱输 → 「无结果」，无残留高亮；清空输入 → 提示与高亮清空。
- 关闭（✕/Esc）→ 还原到查找前阅读位置（查找期间的滚动不写阅读存储）。
- Mermaid 渲染图内文字不参与命中；`mermaid` 关闭时其源码可命中。
- iPhone 手验：顶部查找条在键盘弹起时可见、输入/上下跳手感正常、阅读位置不被污染。

## Comments

- 2026-11-11 grilling 共识确认（Q1 形态 / Q2 范围 / Q3 交互 / Q4 位置 / Q5 布局 / Q6 键盘 / Q7 测试面）。平台事实由子代理复核：iOS standalone PWA 无原生 find API，`window.find()` iOS 不可用（MDN/caniuse/WebKit blog/SO）；代码探测确认每篇笔记正文在独立 Shadow DOM（`ReaderView.tsx:217` attachShadow、`273` mdBody.innerHTML），原生 find 与全局标题搜索都碰不到它。

## Answer

- 2026-11-11 完成。S1 `src/reader/find.ts` 纯函数（`findMatchesInText` 大小写不敏感非重叠 / `collectLeafTexts` 跳 `[data-mermaid]`+script/style / `planFind` / `clearMarks`（unwrap + normalize，换查询跨旧边界可再匹配）/ `applyFind` 逆序 split+wrap 避免同叶多命中失真 / `setCurrentMark`）；S2 ReaderView 接线（light DOM 顶部查找条 + `findOpen`/`onFindClose` props + `.reader` onScroll 按 findOpen 断路 + 打开记录/关闭还原 scrollTop + `fill()` 重建后 `reapplyFind`）、`app.tsx` 顶栏🔍 + `openNote` 重置、`styles.css` flex 布局 + `--find-hit*` token + bar 样式。
- 关键点：原生 find 在 PWA 独立模式不可达（无 API）+ Shadow DOM 让原生 find 与全局标题搜索都搜不到正文 → 应用内查找是唯一路径；查找条放 light DOM（shadow 每次 fill 重置）；阅读位置保护（Q4）；无新设置项/无 DB 变更/无新依赖/不拦 Cmd+F（Q6，桌面浏览器 Cmd+F 搜不到 shadow 正文记为已知限制）。
- 测试：find.test.ts 18 例 + ReaderView 6 例集成（高亮计数 n/m、↑↓ 循环、回车/Shift+回车、滚动断路不污染位置、关闭还原+清态、refreshToken 重建后重放）。全量 182 绿（含一次 mermaid 真渲染 smoke 偶发 flaky，单跑/重跑均过，与本次无关）、typecheck ✓、verify:pwa ✓、隐私自查干净。
- iPhone 手验清单（待用户验证后此票闭环）：打开笔记→顶栏🔍→点开自动聚焦→输中文命中高亮/计数/上下跳/循环→开键盘时顶条不被遮挡→关闭还原阅读位置→读库位置不被查找污染。


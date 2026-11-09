Status: resolved
Type: task
Blocked by:

# 08 · P1 单篇 TOC（浮动「目录」按钮 + 层级面板 + 滚动高亮）

阅读单篇笔记时，右下角浮动「目录」按钮；展开为 H1–H6 层级缩进面板，点击条目滚动定位到对应标题，滚动时高亮当前所在章节。**默认开、无设置项**（纯静态页内导航，无资源/带宽成本，与公式/Mermaid 的按需开关不同类）。

**完成定义**：≥2 个标题的笔记出现 TOC；点击跳转定位；滚动随动高亮；标题带唯一 `id`（`#锚点` 可直达）；1 个标题或无标题的笔记不显示。

## 决策（2026-11-09 grilling 已定）

- **形态**：浮动「目录」按钮 + 面板，全放 ReaderView 的 Shadow DOM 内（样式不外漏）；按钮 `position:fixed` 视口定位（`.reader` 无 transform 祖先，fixed 不受滚动容器影响），面板同理。
- **层级**：H1–H6 全收，按 `level` 缩进；**≥2 个标题才显示按钮**（1 个标题没意义）。
- **联动**：点击条目 → `host.scrollTop = 目标`（**不用** `scrollIntoView`，保 jsdom 可测 + 与阅读位置模型一致）；滚动 → `scroll` 事件（rAF 节流）里按目标位置算出当前章节、给面板条目加高亮。
- **开关**：默认开，不进 settings（无新 Store 字段）。
- **锚点 id**：渲染后（mdBody.innerHTML 已落）DOM 遍历 `h1–h6` 赋唯一 `id`：`slugify(标题文本)`（Unicode `\p{L}\p{N}` 保留，其余折叠为 `-`；空 slug 用 `sec-N` 兜底；重名加 `-2/-3…` 且写入全文唯一）。副产物：笔记里 `[跳](#解析出的slug)` 内链可直达标题。
- **跳过**：`pre`/`code` 里的标题不进 TOC（raw HTML 防御）；fence 代码块天然不出 heading token。
- **复用**：不复用 `search/extractHeadings`（它吃 markdown 原文、文本不准）；TOC 从**渲染后的 DOM** 构建（标题文本/层级/顺序即渲染所见）。
- 测试缝：`src/reader/toc.ts` 纯函数（slugify / assignHeadingIds / 目标滚动 / 当前章节索引）+ ReaderView 集成（button 显隐 / 面板 / 点击定位 / 滚动高亮）。

## Slices（实现时按红绿灯再拆，勿照抄）

1. `toc.ts` 纯函数 + `toc.test.ts`：slugify（ASCII/CJK/标点折叠/空兜底/重名去重）、assignHeadingIds（层级顺序/唯一 id/跳过 pre-code）、目标滚动与当前章节索引。
2. ReaderView 接线 + `ReaderView.test.tsx`：渲染后装配 TOC（id 赋值 + 按钮/面板 DOM + 点击跳转 + 滚动高亮/collapse）、button 显隐条件、TOC 与既有渲染（KaTeX/Mermaid/资产）共存不互相破坏。
3. 全量测试绿 + typecheck + `verify:pwa` + 隐私自查；spec/票回写。

## 验收

- 打开 ≥2 标题的笔记 → 右下「目录」按钮；展开见 H1–H6 层级缩进列表，顺序同正文。
- 点条目 → 正文滚动定位到该标题；滚动时当前章节条目高亮。
- 1 个标题/无标题笔记 → 无 TOC 按钮。
- 标题元素带唯一 `id`；`pre`/`code` 内标题不产生条目。

## Answer

- 2026-11-09 完成。S1 toc.ts 纯函数（slugify / assignHeadingIds 唯一 id + 跳 pre/code / headingScrollTarget 跨 shadow 几何差值 / currentHeadingIndex）；S2 ReaderView 接线：渲染后统一赋 id + 浮动按钮/层级面板（shadow 内，`position:fixed`）+ 点击 `host.scrollTop` 定位并收起 + rAF 节流滚动高亮；≥2 标题才显示。
- 方案要点：目标 scrollTop 用 `host.scrollTop + (heading.rect.top - host.rect.top)` 差值，跨 Shadow DOM 成立不依赖 offsetParent；无设置项（默认开），选用 DOM 而非 markdown 原文作目录源（渲染所见即所得，且 `#slug` 内链副产物可用）。
- 评审修正：滚动高亮补 rAF 节流（票决策）、同路径刷新后 <2 标题无条件卸载 scroll 监听、测试几何桩抽共享 helper。
- 测试 155/155 绿，typecheck ✓，verify:pwa ✓，隐私自查干净。
- 提交：d64161e。无真机依赖，票可直接 closed。

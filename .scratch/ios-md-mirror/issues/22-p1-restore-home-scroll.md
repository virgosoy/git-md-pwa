Status: resolved
Type: task

# 22 · P1 从笔记返回首页时恢复列表滚动位置

从首页（搜索结果 / 最近打开 / 全部笔记）点开笔记后，返回首页时列表被重置到顶部。根因：首页列表与阅读器共用 `.app__main` 布局，阅读器使用 `.app__main--flush` 把内容替换为自滚动的 `.reader`，原 `scrollTop` 被浏览器夹到 0；返回只做 `setCurrent(null)`，没有恢复逻辑。搜索结果本身（`query`）是保留下来的，缺的只是滚动位置。

## 决策（2026-11-22 与用户确认）

- **范围**：所有从首页进入阅读器的路径都恢复——搜索结果、最近打开、全部笔记；阅读中经内链切到别的笔记，返回时也恢复最初离开首页时的位置。
- **精度**：按离开首页时的精确 `scrollTop` 还原（像素级）。
- **列表变化兜底**：阅读期间后台同步/清理导致返回时列表变短，只靠浏览器夹取到新的最大可滚值，不额外回顶、不加提示。
- **不改**：搜索关键字保留逻辑（现状即保留）、阅读位置保存逻辑、DB schema、返回栈/前进历史（票 21 已明确不做）。

## 实现要点

- `src/app.tsx`：
  - `openNote` 开头在**当前不在阅读器**（`current == null`）时记录 `mainRef.scrollTop`；阅读中经内链切篇（`current != null`）不覆盖，保住最初离开首页的位置。
  - `useLayoutEffect` 监听 `current`：由非空变空时把 `main.scrollTop` 设回记录值；首挂载（从未打开过笔记）不恢复。
  - 返回按钮仍只是 `setCurrent(null)`，恢复统一在 effect 里做（渲染提交后、绘制前，无闪烁）。

## 测试

- 新增 `src/app.scroll.test.tsx`（App 集成，stub fetch/PWA 模块缝）：
  1. 搜索结果滚到中部 → 点标题行 → 模拟阅读器期间 `scrollTop` 归零 → 返回 → 位置还原，结果列表与查询仍在。
  2. 全部笔记列表滚到中部 → 打开笔记 → 返回 → 位置还原。
  3. 从列表打开 A → 阅读中经内链切到 B（`current` 非空不得覆盖记录）→ 返回 → 仍还原到最初列表位置。

## 范围边界

- 不做：多级返回栈、滚动动画、列表内容变化时的「回到某条目」兜底。
- 隐私：不新增任何 owner/repo/令牌读写；fixture 保持哑值。

## 验收

- 搜索结果点标题/卡片 → 阅读 → 返回：回到点击前的结果位置。
- 最近打开 / 全部笔记同样生效。
- 内链跳转后返回，仍回到最初首页位置。
- `npm test` / `npm run typecheck` / `npm run build` 全绿；隐私自查通过。

## Answer

- 2026-11-22 完成。
- `src/app.tsx`：新增 `homeScrollTop`（离开首页时的 `.app__main` scrollTop）与 `prevCurrent`；`openNote` 开头仅在 `current == null` 时记录（阅读中内链切篇不覆盖）；`useLayoutEffect` 监听 `current`，非空→空（返回）时在提交后、绘制前把 `main.scrollTop` 设回记录值，首挂载不触发。
- 测试：新增 `src/app.scroll.test.tsx` 三例——搜索结果点标题返回还原（420px，查询与结果保留）；全部笔记打开返回还原（640px）；内链 A→B 后返回仍还原最初列表位置（300px）。jsdom 无布局夹取，测试中手动把主容器归零模拟真实浏览器。
- 验证：全量 289/289 绿（39 文件）；`typecheck` ✓；`build` ✓（111 预缓存，5672.99 KiB）。
- 文档：`GLOSSARY.md` 全局搜索条目补「返回停留在离开时的滚动位置」；`CLAUDE.md` 架构表新增 `src/app.tsx` 行说明共享滚动容器与还原策略。
- 隐私自查：未新增任何 owner/repo/令牌读写；fixture 仍为哑值（`me/fixtures`）。

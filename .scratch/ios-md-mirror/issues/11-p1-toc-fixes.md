Status: resolved
Type: task
Blocked by:

# 11 · P1 单篇 TOC 三个缺陷修复（固定按钮关面板 / 头部滚出 / 高亮错位）

阅读器 TOC（票 08）上线后的三处收尾 bug，同在一个组件、一并修。

**缺陷**：
1. 点「固定」按钮会把 TOC 面板关掉（应只切换固定状态，面板保持原样）。
2. 面板条目多时，「目录 + 固定」头部随列表一起滚出可视区，固定按钮点不到。
3. 点 TOC 条目后正文定位正确，但高亮常落在上一个标题（亚像素取整偏差）。

## 根因（代码定位）

1. **固定关面板**：`handleTocPinChange` → `saveSettings` → `setSettings` 触发 App 重渲染 → `assetLoader` 是 `useMemo(..., [settings])`，settings 引用一换就拿到新对象 → ReaderView `useLayoutEffect` 依赖含 `assetLoader` → shadow 整个重建 → 面板 `is-open` 是 DOM 本地态，重建即丢。本质是「tocPinned 变化不该引发 reader 重建」。
2. **头部滚出**：`.reader-toc__panel` 自身 `overflow-y: auto`，头部是列表第一个子元素，随列表滚走。
3. **高亮错位**：点条目把标题滚到 `顶 + offset`，但 `getBoundingClientRect` 亚像素、`scrollTop` 整数取整，落点实为 `顶 + offset + ε`；`currentHeadingIndex` 用 `targets[i] <= scrollTop`，重算 target 略大于 scrollTop → 返回上一个。

## 决策（2026-11-12 grilling 已定）

- **固定按钮行为契约**：点「固定」只切换固定状态，面板展开/收起必须原样保留、不引发重建闪烁。修法 = 把 reader 重建触发收敛到真正影响内容的字段（`token/owner/repo` 变了才重建），不给面板加「open 状态跨重建保持」补丁。
- **吸顶范围**：整行「目录 + 固定按钮」一起固定在面板顶部（加下边框隔开），不是只吸顶按钮。
- **高亮语义不变**：当前章节 = 正文顶部阅读线已越过的最后一个标题；只修亚像素，比较时对 target 取 `Math.floor`（等价 `<1px` 容差，且不提前 1px 高亮）。
- **回归测试**：`toc.test.ts` 纯函数测亚像素场景；`ReaderView.test.tsx` 测面板头部在滚动列表外（结构）；bug 2 根因在 App 接线（assetLoader 稳定性），用 App 集成测试覆盖「点固定后面板仍展开」。

## Slices

1. `toc.ts`：`currentHeadingIndex` 对 target 取 `Math.floor` + `toc.test.ts` 补亚像素回归。
2. `ReaderView.tsx`：面板 DOM 拆出 `.reader-toc__list` 滚动容器，头部移出滚动区 + `ReaderView.test.tsx` 结构回归。
3. `app.tsx`：`assetLoader` 依赖收敛到 `token/owner/repo` + 新增 `app.toc.test.tsx` 集成回归「点固定不关面板」。
4. 全量测试绿 + typecheck + `verify:pwa` + 隐私自查；回写本票。

## 验收

- 打开 ≥2 标题笔记 → 展开 TOC → 点「固定」：按钮态切换、面板保持展开不闪烁。
- 面板条目很多时：头部「目录 + 固定」始终可见，只有条目列表滚动。
- 点 TOC 条目 → 正文定位正确、且高亮落在被点标题（不是上一个）。
- 已有 TOC 行为（层级缩进/收起/滚动高亮/唯一 id）不回退。

## Answer

- 2026-11-12 完成。三个缺陷同根修完：
  - **固定关面板**：`app.tsx` 的 `assetLoader` 依赖从 `[settings]` 收敛到 `[token, owner, repo]` 三原语（`ensureAsset` 本就只吃 client+repo）。开关类设置（tocPinned 等）变化不再触发 ReaderView shadow 重建 → 面板 `is-open` 本地态原样保留。用意即「tocPinned 变化不该引发重建」，不额外打「open 状态跨重建」补丁。
  - **头部滚出**：`.reader-toc__panel` 去掉 `max-height/overflow-y`，移入新 `.reader-toc__list` 滚动容器；头部（目录 + 固定）整行留在面板顶，加 `border-bottom` 隔开列表。
  - **高亮错位**：`currentHeadingIndex` 对 target 取 `Math.floor`——点击跳转时浏览器把浮点 scrollTop 向下取整，重算 target = scrollTop + 亚像素 ε，`<= scrollTop` 会把被点标题判成上一个。floor 等价「<1px 容差」，消亚像素又不提前 1px 高亮。
- 回归：`toc.test.ts` 补亚像素用例（target 200.4/200.99 @ scrollTop 200 → 判定为被点标题；199 不越级）；`ReaderView.test.tsx` 补「头部在滚动列表之外、条目全在 list 内」结构断言；新增 `app.toc.test.tsx` App 集成（点「固定」→ 面板同一元素且 keep open、固定态切换、aria-pressed）——此用例旧代码必红（settings 引用一变即重建）。
- 全量 213/213 绿（31 文件），typecheck ✓，verify:pwa ✓（111 预缓存 / prompt 模式不变），隐私自查干净。
- draft.md 勾掉对应三行。

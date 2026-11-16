Status: resolved
Type: task
Blocked by: 15-p1-nested-heading-extract

# 16 · P2 回退路径正则围栏层级错配修复

`extractHeadingsRegex`（以及 `findBodySnippet` 同族逻辑）的围栏闭合判定不看开口反引号数，
CommonMark 语义「闭合 ≥ 开口」未实现 → 4 反引号外层围栏被内层 3 反引号错误提前关闭，
后续 4 反引号被误当新开口 → 其后的裸标题全部被吞进围栏。

## 根因（2026-11-16 用真实文件 `draft/AI使用与落地.md` 验证）

- 该文件 2230 行 ````md`（**4 反引号**）开了外层围栏，内含 2237 ````bash` 等内层 3 反引号围栏，2375 行 ````（4 反引号）才闭合外层。
- 旧 `extractHeadingsRegex`（也是旧默认）：
  - `FENCE_OPEN_RE = /^(```|~~~)/` 前缀匹配，````md`（4反引号+md）也能开围栏 → `fenceChar='`'`。
  - `fenceCloses = /^`{3,}$/` 只要 ≥3 纯反引号就闭合。
  - 于是 2243 行内层 ```` 3反引号被误判为「外层闭合」→ 外层围栏状态提前清空。
  - 2375 行 ```` 4反引号因此被当成**新开口** → 它的闭合要在更后面找 → 2377 `#### 💛 grill-me (skill)`、2383 `#### karpathy-guidelines`、2389-2395 等**一段连续裸 `####`/`###` 标题全部被吞**（现实证：regex 抽到含 grill 标题 0 条，markdown-it 抽到 1 条且 searchNotes 命中 H4）。
- 同一语义在 `findBodySnippet` 的围栏跳桶里也存在（摘录定位同样会错）。

## 修复

给围栏状态记录开口长度，闭合判定改为「同字符且数量 ≥ 开口长度」（CommonMark）：

- `extractHeadingsRegex`：`fenceChar` 旁增 `fenceLen`，开口记 `match(/^`*|^~*/)[0].length`；闭合用 `fenceCloses` 传入长度（`^`{len,}$` / `^~{len,}$`）。
- `findBodySnippet`：同步同样的围栏状态（保持两处语义一致）。
- 作用域核对：`fenceCloses` 目前两处调用都是 `(line, ch)` 双参；改成 `(line, ch, len?)`，默认 len=3 保持旧签名兼容。

## 范围边界

- 只修**围栏层级**这一确定缺陷。正则仍是「浅层近似」，复杂容器（列表内标题、嵌套引用、HTML 块、setext 标题等）继续由 token 流覆盖——默认模式仍是 `token`，本票不改变默认，只让**关掉开关的回退路径不再静默丢标题**。
- `fenceCloses` 默认参数向后兼容，不破坏 `extractHeadings`/`findBodySnippet` 现有签名。

## Answer

- 2026-11-16 完成。`search/index.ts` 围栏状态机改为记录**开口字符 + 长度**：`interface Fence { ch, len }`，`fenceOpen(line)` 取 `^(`+|~+)` 的实际长度（≥3 才为开口），`fenceCloses(line, f)` 用 `^char{len,}$`（闭合须 ≥ 开口数，CommonMark）。废弃裸 `fenceChar` 与 `FENCE_OPEN_RE`。
- 两处共用同一状态机：`extractHeadingsRegex`（标题抽取回退路径）与 `findBodySnippet`（正文摘录围栏跳桶）——语义一致，一处修复两处受益。
- 红灯先行：`extract-headings.test.ts` 加 3 用例（4反引号外层不被内层3反引号提前闭合→标题恢复；双内层实链→karpathy-guidelines 恢复；findBodySnippet 同场景标题行不算正文→摘录 null）。首版两条用例未红（中间补了一组反引号行使旧代码碰巧配对救回状态）——按诊断纪律修正为**最小链条**后确认红，再实现绿。
- 真实文件 `draft/AI使用与落地.md` 复验：regex 回退现抽到 `💛 grill-me (skill)`（修复前 0）、`karpathy-guidelines`；`searchNotes('grill')` regex 模式命中 H4。临时脚本已删，未 commit 私库内容。
- 全量 244/244 绿（31 文件），typecheck ✓，verify:pwa ✓（111 预缓存）。默认模式仍 `token`，本票只修回退路径，行为改善无回归。
- 隐私自查：fixtures 仍哑值；`draft/` 目录（含私库镜像）为 untracked，未纳入任何提交，已在对话内向用户提醒其风险。


## Terms

- `围栏`：markdown 代码块三反引号/波浪线定界；CommonMark 规定闭合行须不少于开口数。

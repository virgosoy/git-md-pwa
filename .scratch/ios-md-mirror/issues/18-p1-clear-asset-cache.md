Status: resolved
Type: task
Blocked by:

# 18 · P1 清理图片等资源缓存（带确认）

设置页「本机存储」区块（票 17）新增「清理图片等资源缓存」按钮：点击先出现**两步确认**（说明将清除的条数、约释放量、离线影响），确认后只删除 `assets` 表中已缓存的资源本体，保留超大占位记录；完成后原地刷新本机存储统计并提示结果。不动笔记镜像、设置、阅读位置与 Service Worker 离线缓存。

**完成定义**：设置页能看到清理入口并需确认才执行；确认后 `assets` 表 `ok` 记录清空、`too-large` 占位保留；统计自动刷新；失败不破坏数据；测试/typecheck/`verify:pwa` 全绿。

## 决策（建议，实施前可调整）

- **清理范围 = `assets` 表 `status: 'ok'` 的记录**（dataURL 本体）。`too-large` 占位不删——它们不含资源数据（一条只有 path/size/savedAt，几字节），保留后下次联网打开笔记不会为了「再发现一次超限」整包下载大文件。
- **确认交互 = 区块内两步确认**，不引入原生 `window.confirm`、不加弹窗库（与现有轻量 UI 一致，且便于组件测试）：点「清理图片缓存」→ 原地出现确认行：
  「将清除 N 个资源（约 X）。离线时这些图片将不再显示；联网重新打开笔记会再次下载。」+「确认清理」「取消」。
  取消回到常态，不删任何数据。
- **按钮可用性**：统计完成且 `usage.assets.count > 0` 才可点；统计中、统计失败或 0 个时禁用。0 个时旁边提示「没有已缓存的资源」。
- **清理中**：按钮显示「清理中…」并禁用，防重复触发；确认按钮同样禁用。
- **结果反馈**：成功 →「已清理 N 个资源（约 X）」，N/X 用清理函数实际删除的返回值（非打开设置页时的旧统计）；失败（事务 abort/error）→ 数据不动，提示「清理失败，请重试」。
- **字节口径**：X = 被删记录 `dataUrl` 字符串长度之和（dataURL 全 ASCII，1 B/字符），与本机存储区块「图片等资源」行的 `contentBytes` 口径一致；不把 `size` 当释放量（dataURL 约大 1/3）。
- **清理后刷新统计**：重新执行 `estimateStorage()` 更新五行与总量，不要求重开设置页。

## 实现要点

- `src/assets/store.ts` 新增 `clearCachedAssets(): Promise<{ count: number; bytes: number }>`：
  - 先 `getAll()` 读出全部记录，过滤 `status === 'ok'`，累加 `dataUrl?.length ?? 0`；
  - 在一个 readwrite 事务里逐条 `delete()`（`withStore` 的 fn 内可发多个请求，等 `tx.oncomplete` 才算成功）；
  - 返回实际删除的条数与字节和。`too-large` 记录不删。
- `src/storage/StorageUsage.tsx` 增加 `confirming` / `clearing` / `result` 状态，按钮与确认文案挂在「图片等资源」行附近；成功/失败后重跑统计。
- 不新增 DB schema、不改 `DB_VERSION`。
- 测试缝（按仓库约定，纯函数/组件优先、断言已知字面量、fixture 哑值）：
  - `store.test.ts`：预置 2 条 `ok` + 1 条 `too-large` → 清理后只剩 `too-large`；返回值 `count=2`、`bytes=<dataUrl 字面长度和>`。
  - `StorageUsage.test.tsx`：点清理出现确认（含条数/字节）；取消不调用清理、统计不变；确认后显示成功并重新统计；失败显示错误且不清成 0。

## 范围边界

- **不做**：清空笔记镜像、全部重置、清 Service Worker/Cache Storage 离线缓存（均为 `draft.md` 独立待办）。
- **不做**：「自动加载图片可配置项」（`draft.md` 独立待办）。当前联网打开笔记会自动缓存引用资源，因此清理后联网再打开笔记会重新缓存——这是预期行为，确认文案已说明。
- 不做孤儿资源识别、按引用删除、在途请求阻断：只做全量清空已缓存资源。单页应用同一时刻只显示一个视图，设置页打开时不会触发票 05 的懒加载拉取，故无实际竞态路径。
- 不改 `mirror`/`settings`/`meta`/`reading` 表，不动阅读位置，不影响离线打开已镜像的笔记正文。
- 隐私：清理逻辑与 UI 不读写 owner/repo/令牌内容，隐私红线不受影响。

## 验收

- 设置页统计完成且存在已缓存资源：点「清理」出现确认，含条数与约释放量；点取消不删数据、统计不变。
- 确认后：`assets` 表 `ok` 记录清空、`too-large` 保留；「图片等资源」行与总量自动刷新。
- 清理后离线打开含图笔记 → 图片显示占位符；联网重新打开 → 重新缓存并正常显示。
- 清理失败（模拟事务报错）→ 数据与统计不被破坏，显示错误提示。
- `npm test` / `npm run typecheck` / `npm run verify:pwa` 全绿；隐私自查通过。

## Answer

- 2026-11-21 完成。
- `src/assets/store.ts`：新增 `clearCachedAssets(): Promise<{ count, bytes }>`——`getAll()` 后过滤 `status === 'ok'`，`bytes` 为 `dataUrl.length` 之和（dataURL 全 ASCII，1 B/字符），在一个 readwrite 事务内逐条 `delete()`（`withStore` fn 内发多个请求，等 `tx.oncomplete`）；`too-large` 占位保留。
- `src/storage/StorageUsage.tsx`：在「图片等资源」行下接入两步确认（确认文案含条数与约释放量、离线影响）；取消不删数据；确认后显示「已清理 N 个资源（约 X）」并重跑 `estimateStorage()` 刷新统计；失败提示「清理失败，请重试。」、保留确认态可重试；统计中/失败/0 个时按钮禁用，0 个时提示「没有已缓存的资源」。
- `src/styles.css`：`--danger` 变量、`.btn--danger`、`.storage__actions/__buttons/__confirm/__notice`。
- 测试：`store.test.ts` +2（清理语义：ok 删、too-large 留、返回 `{count: 2, bytes: 52}`；空库 `{0, 0}`）；`StorageUsage.test.tsx` +2（确认/取消/成功刷新统计；失败不清数据）——用 `vi.mock` 包装真实模块，默认委托 actual，仅失败用例注入 `mockRejectedValueOnce`。
- 全量 271/271 绿（36 文件），typecheck ✓，`verify:pwa` ✓（111 预缓存，5.67 MiB）。首轮全量 `mermaid.smoke` 5s 超时（既有 flaky，单跑与二次全量均绿）。
- 隐私自查：无 owner/repo/令牌参与逻辑或 UI；fixtures 仍哑值。

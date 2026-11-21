Status: resolved
Type: task
Blocked by: 17-p1-storage-usage

# 19 · P1 清空本机笔记镜像（带确认，保留设置）

设置页「本机存储」区块（票 17）在「笔记」行下新增「清空笔记镜像」按钮：点击先出现**两步确认**（说明将删除的篇数、约释放量、离线影响），确认后清空本机镜像的笔记、同步记录与阅读位置；设置（令牌 / owner/repo / 开关 / 更新提示记忆）与已缓存的图片等资源保留。

**完成定义**：设置页能看到入口且需确认才执行；确认后 `mirror` 表清空、`meta` 同步记录删除、`reading` 表清空，`settings` 与 `assets` 不动；存储统计自动刷新；下次联网「刷新」能重新镜像全部笔记（不被版本门短路）；失败不破坏数据；测试 / typecheck / `verify:pwa` 全绿。

## 决策（建议，实施前可调整）

- **清理范围**：
  - `mirror` 表**全部**记录（`status: 'ok'` 的正文 + `too-large` 占位）。
  - `meta` 表 `MIRROR_META_KEY` 记录**必须删除**——`mirrorRepo` 的版本门（`meta.commitSha === tree.sha` 直接返回 0 拉取）会在 meta 还在时把清空后的同步短路，导致笔记永远回不来。这是本票最关键的一条。
  - `reading` 表清空——阅读位置与「最近打开」都指向已删除的笔记；不清理会在首页留下打不开的死条目。
  - 不动 `settings`（含 `lastPromptedVersion`）、`assets`（图片等资源，走票 18 的单独按钮）、Cache Storage（应用离线缓存）。
- **原子性**：三个仓库的删除放进**一个** readwrite 事务（`mirror.clear()`、`meta.delete(MIRROR_META_KEY)`、`reading.clear()`），等 `tx.oncomplete` 才算成功；abort/error 一律失败，三表都不动，旧镜像保持可用。
- **确认交互 = 区块内两步确认**，与票 18 同一模式（不引入 `window.confirm`、不加弹窗库），按钮挂在「笔记」行下方。确认文案示例：
  「将删除本机镜像的 **N** 篇笔记（另有 **M** 篇超大未镜像，约 **X**）。同步记录、阅读位置与最近打开也会清除；设置和已缓存的图片不受影响。离线时将无法阅读；联网后点右上「刷新」可重新镜像。」
  - `M === 0` 时省略「另有 M 篇超大未镜像」半句。
  - `N` = `status === 'ok'` 条数，`M` = `too-large` 条数。
- **字节口径**：`X` = 全部被删记录 `content` 按票 17 的 `stringBytes` 口径之和（Latin-1 1 B/字符、其余 UTF-16 2 B/字符），与「笔记」行的 `contentBytes` 一致；占位记录 content 为空，不贡献字节，但计入 `M`。
- **按钮可用性**：统计完成且 `notes.count + notes.skipped > 0` 才可点；统计中、统计失败或 0 篇时禁用，0 篇时旁边提示「本机没有已镜像的笔记」。
- **同步中禁用**：App 把 `syncStatus === 'syncing'` 传给设置页，同步进行中禁用清空按钮（避免「边拉边清」让完成提示与最终状态不一致；票 02 的两阶段写库不受影响，但 UI 承诺应准确）。
- **清空后 App 状态刷新**：新增 `onMirrorCleared` 回调，从 `StorageUsage → SettingsView → App`。App 收到后：
  - `setLastSyncedAt(null)`（顶部横幅不再显示旧的「上次同步 x 分钟前」）、`setSyncFail(null)`；
  - `refreshFiles()`、`refreshRecent()`（首页回到「还没有笔记」欢迎态，搜索索引随 `files` 变化自动重算）；
  - `setQuery('')`（清空首页搜索输入，避免关闭设置后停在空结果页）。
- **不自动重新同步**：清空的动机通常是释放空间；联网后由用户点右上「刷新」重新镜像，确认文案已说明。
- **结果反馈**：成功 →「已清空本机笔记（N 篇，约 X）」，N/X 用清理函数实际返回值（非打开设置页时的旧统计），随后重跑 `estimateStorage()` 刷新五行与总量；失败 →「清空失败，请重试。」，保留确认态可重试，数据与统计不被破坏。

## 实现要点

- `src/idb.ts`：新增多仓库事务助手 `withStores(storeNames: string[], fn: (tx: IDBTransaction) => void): Promise<void>`——等 `tx.oncomplete` 再 resolve，`onabort/onerror` reject；**不新增表、不改 schema、`DB_VERSION` 不变**。
- `src/lib/bytes.ts`（新）：把 `stringBytes` 从 `src/storage/estimate.ts` 移到这个中立模块；`estimate.ts` 与 `mirror/store.ts` 都从它导入（若留在 estimate，会形成 `mirror/store → storage/estimate → mirror/store` 的环）。相应把 `stringBytes` 的 4 条断言移到 `src/lib/bytes.test.ts`。
- `src/mirror/store.ts`：新增
  ```ts
  interface ClearedMirror { count: number; skipped: number; bytes: number }
  function clearMirror(): Promise<ClearedMirror>
  ```
  - 在同一事务内先对 `mirror` 发 `getAll()` 取得待删记录（请求先于 `clear()` 排队，结果反映清空前内容），据此算 `count` / `skipped` / `bytes`；同时 `reading` 发 `getAll()`（本票不需要返回值，仅为顺序清晰可省）。
  - 随后 `mirror.clear()`、`meta.delete(MIRROR_META_KEY)`、`reading.clear()`；`tx.oncomplete` 后返回统计值。
- `src/storage/StorageUsage.tsx`：
  - 新增 props `{ syncing?: boolean; onMirrorCleared?: () => void }`。
  - 把「按钮 / 确认行 / 忙碌 / 结果提示」状态机抽成文件内子组件（如 `StorageAction`），图片与笔记两处复用（票 20「全部重置」可继续复用）；**票 18 的图片清理行为与文案不变**。
  - 在「笔记」行下渲染笔记清理动作；成功清空后调用 `onMirrorCleared?.()`，再 `refresh()`。
- `src/settings/SettingsView.tsx`：透传 `syncing`、`onMirrorCleared` 给 `StorageUsage`。
- `src/App.tsx`：`SettingsView` 传 `syncing={syncStatus === 'syncing'}`、`onMirrorCleared={() => void handleMirrorCleared()}`；`handleMirrorCleared` 实现上面的 App 状态刷新。
- 不新增 DB schema、不改 `DB_VERSION`。

## 测试缝（按仓库约定：纯函数 / 组件优先、断言已知字面量、fixture 哑值）

- `src/mirror/store.test.ts`：
  - 预置 2 条 `ok`（内容 `'hi'`、`'中文'`）+ 1 条 `too-large` + meta + reading + settings → `clearMirror()` 返回 `{ count: 2, skipped: 1, bytes: 6 }`（2 + 4）；`loadFiles()` 空、`loadMirrorMeta()` 为 `null`、`listRecent()` 空、`loadSettings()` 返回原值（令牌等字段仍在）。
  - 空库 → `{ count: 0, skipped: 0, bytes: 0 }`，不抛错。
- `src/mirror/mirror.test.ts`：
  - **版本门回归**：预置 meta `commitSha: 'abc'`，`clearMirror()` 后用 stub client（同一 `tree.sha = 'abc'`、1 个 `.md`）跑 `mirrorRepo` → `fetched = 1`，证明清空后不会被短路。
- `src/storage/StorageUsage.test.tsx`：
  - 点「清空笔记镜像」出现确认，文案含篇数与字节、提到阅读位置清除；取消不调用 `clearMirror`、统计不变。
  - 确认后显示「已清空本机笔记（2 篇，约 6 B）」、笔记行变 0、调用 `onMirrorCleared`、统计已重算。
  - 失败（`vi.mock` 注入 `mockRejectedValueOnce`）→ 显示错误且笔记行不为 0。
  - `syncing` 时按钮禁用。
- `src/app.clear.test.tsx`（集成，沿用现有 stub fetch + 预置 IndexedDB 模式）：
  - 预置 settings（owner/repo 哑值）+ 笔记 + meta + reading → 渲染 `App` → 进设置 → 清空 → 收起 → 首页显示「还没有笔记…」、顶部无「上次同步」；再点「刷新」会重新请求 GitHub（meta 已删，不短路）。

## 范围边界

- **不做**：清图片等资源（票 18 已有按钮）、清 Cache Storage / Service Worker、重置设置、**全部重置**（票 20 单独做，可复用本票的 `StorageAction` 与 `withStores`）。
- 不做按仓库切换识别孤儿资源、按引用删除；不做「清空后自动重同步」。
- 不改 `settings` 表任何字段（含 `lastPromptedVersion`），不改 `assets` 表。
- 隐私：清理逻辑与 UI 不读写 owner/repo/令牌内容，隐私红线不受影响；测试 fixture 仍用哑值（`me/fixtures`、`ghp_test_dummy`）。

## 验收

- 设置页「笔记」行下出现「清空笔记镜像」；统计完成且有笔记时可点，点击出现确认（含 N/M/X 与影响说明）；取消不删数据、统计不变。
- 确认后：`mirror` 表为空、`meta` 同步记录删除、`reading` 表为空；`settings` 与 `assets` 原样保留；「笔记」行与总量自动刷新；显示实际清理篇数与字节。
- 关闭设置回首页：无笔记、无旧「上次同步」、搜索框已清空；联网后点「刷新」重新镜像全部笔记（版本门不短路）。
- 失败注入（模拟事务 abort/写库抛错）→ 三表均未被清空，提示「清空失败，请重试。」，旧镜像仍可离线阅读。
- 同步进行中按钮禁用。
- `npm test` / `npm run typecheck` / `npm run verify:pwa` 全绿；隐私自查通过。

## Answer

- 2026-11-21 完成。
- `src/mirror/store.ts`：新增 `clearMirror(): Promise<{ count, skipped, bytes }>`——单个 readwrite 事务内 `mirror.getAll()`（先于 `clear()` 排队，统计清空前内容）→ `mirror.clear()`、`meta.delete(MIRROR_META_KEY)`、`clearReadingIn(tx)`；事务提交后才返回。`count` = `ok` 篇数，`skipped` = `too-large` 占位，`bytes` = `stringBytes(content)` 之和。**必须删 meta**，否则 `mirrorRepo` 的 commitSha 版本门会短路重新同步。
- `src/idb.ts`：新增 `withStores(storeNames, fn)` 多仓库事务助手；与 `withStore` 共用私有 `beginTransaction`，消除事务 wiring 重复。`tx.abort()` 时 `tx.error` 可能为 null，统一给可读错误；`fn` 同步抛错时吞掉 `done` 的拒绝避免 unhandled rejection。不新增表、`DB_VERSION` 不变。
- `src/lib/bytes.ts`（新）：`stringBytes` 从 `src/storage/estimate.ts` 移到中立模块，估计与清空镜像共用口径（避免 storage ↔ mirror 循环依赖）；断言移到 `src/lib/bytes.test.ts`。
- `src/reader/reading.ts`：新增 `READING_STORE` 与 `clearReadingIn(tx)`——阅读表归本模块所有，清空镜像在同一事务里调用它，而不是跨模块直接 `objectStore('reading')`。
- `src/storage/StorageUsage.tsx`：抽出文件内 `StorageAction`（按钮 / 确认 / 忙碌 / 结果状态机，图片与笔记复用；票 18 文案与行为不变）。「笔记」行下新增「清空笔记镜像」，两步确认文案含 `N 篇 + M 篇超大占位 + 约 X`、阅读位置/最近打开清除、离线影响与重新镜像提示；统计失败（笔记类为 null）时按钮禁用并提示「笔记数据读取失败，无法清空」；0 篇/同步中禁用；成功提示用清理函数实际返回值并重跑 `estimateStorage()`，失败提示「清空失败，请重试。」且数据不动。
- `src/settings/SettingsView.tsx` / `src/app.tsx`：透传 `syncing` 与 `onMirrorCleared`；App 收到后 `setLastSyncedAt(null)`、清 `syncFail`、`setQuery('')`、`refreshFiles()`、`refreshRecent()`。同步进行中按钮禁用，避免「边拉边清」。
- 文档：`GLOSSARY.md` 增补「笔记镜像」（仓库镜像中的 Markdown 正文部分，不含资源缓存与设置）；`CLAUDE.md` 架构表补 `src/lib/bytes.ts` 与 `src/storage/`。
- 测试：+7 → 全量 278/278 绿（38 文件）；`typecheck` ✓；`verify:pwa` ✓（111 预缓存，5.67 MiB）。新增：`store.test.ts` 2（清理语义/空库）、`mirror.test.ts` 1（清空后同树重新拉取，版本门回归）、`StorageUsage.test.tsx` 3（确认/取消/成功回调/失败/同步中禁用）、`app.clear.test.tsx` 1（清空后首页复位、无旧「上次同步」、再刷新真正拉回内容、搜索框复位）；`bytes.test.ts` 承接原 1 条断言。测试按钮助手抽到 `src/test/dom.ts`。
- 评审两轴已过：Standards 无硬性违规（隐私红线、schema 归属、测试缝约定均符合）；Spec 缺项已补（票据结案、笔记类统计失败时禁用态、取消断言、集成测试改用「真正拉回内容」作判别）。
- 已知边界：整体统计仍为「统计中」时整块不渲染（沿用票 17），此时不存在可禁用的按钮；`assets` 清理的按钮隐藏逻辑未改（票 18 行为）。
- 隐私自查：清理逻辑与 UI 不读写 owner/repo/令牌；fixture 仍为哑值（`me/fixtures`、`ghp_test_dummy`）。

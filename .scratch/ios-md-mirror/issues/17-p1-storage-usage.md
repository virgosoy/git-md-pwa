Status: resolved
Type: task
Blocked by:

# 17 · P1 本机存储占用展示（设置页）

设置页新增「本机存储」区块：打开时统计 IndexedDB（mirror/assets/meta/settings/reading）与 Cache Storage 实际保存的数据，展示总量 + 分类明细。

不调用 `navigator.storage.estimate()`：iOS 16.1.1 的 Safari 没有该接口（Safari 17+ 才有，见 caniuse/MDN），因此全部自算，保证各设备口径一致。

## 决策

- 只读展示；清理类功能（清图片 / 清镜像 / 全部重置）不在本票，登记在 `draft.md`。
- 打开设置页时统计一次，先显示「统计中…」；不缓存、不加刷新按钮。
- 字节口径：字符串全部码元 ≤ 0xFF 按 1 B/字符，否则按 UTF-16 2 B/字符（对应引擎内部 Latin-1 / 两字节表示）；数字 8 B、布尔 1 B；缓存响应体按 `arrayBuffer()` 字节。
- 展示五行，总量 = 五行之和：
  - 笔记：只数已镜像（`status: 'ok'`）；有占位记录时行内追加「另有 N 篇超大未镜像」。
  - 图片等资源：只数已缓存（`ok`）；有占位时追加「另有 N 个超大未缓存」。
  - 应用离线缓存：Cache Storage 条目数。
  - 设置与阅读数据：settings + meta + reading 记录。
  - 记录与索引开销：可读部分——mirror 的 path/sha/status/size、assets 的 path/status/size/savedAt、主键重复存的路径、settings/meta 的键、缓存条目 URL 与响应头。
- 任一类读取失败：该行与总量显示「—」，附「部分数据读取失败，重新打开设置可重试」；其它行照常。
- 不展示 owner/repo/令牌内容，只展示条数与字节（隐私红线不受影响）。

## 范围边界

- 浏览器底层的页对齐、压缩、日志、对象内部结构、HTTP 缓存 JS 读不到，说明文字中明示未计入；未来 iOS 升级后可用 `estimate()` 对照（`draft.md` 待办）。
- 不做任何清理/删除动作，不改 DB schema。
- `draft.md` 追加：清图片缓存 / 清笔记镜像 / 全部重置 / iOS 升级后展示 `estimate()` 总量与配额。

## Answer

- 2026-11-21 完成。新增 `src/storage/`：`format.ts`（`formatBytes`）、`estimate.ts`（四类统计 + `estimateStorage()`）、`StorageUsage.tsx`（设置页区块，位于「应用版本与更新」之后）。
- 口径：`stringBytes` 全码元 ≤0xFF 按 1 B/字符，否则 2×；数字 8 B、布尔 1 B；缓存响应体 `arrayBuffer().byteLength`。
- 分类行只展示数据本体（正文 / dataURL / 响应体 / 设置与阅读字段）；记录字段、主键重复、缓存条目 URL 与响应头统一进「记录与索引开销」。总量 = 四类本体之和 + 开销，避免同一份开销重复计入。
- 单类失败：该类为 `null`，UI 该行与总量显示「—」并附「部分数据读取失败，重新打开设置可重试」；其它行照常。
- 为读 settings/meta 主键，导出 `SETTINGS_KEY`（settings/store）与 `MIRROR_META_KEY`（mirror/store），不复制字面量。
- 测试：`format.test.ts` 3 例；`estimate.test.ts` 3 例（人工推导已知字面量，覆盖 IDB 四表 + 假 Cache Storage 与单类失败）；`StorageUsage.test.tsx` 2 例（正常渲染 + 失败降级）；`SettingsView.test.tsx` 1 例接线。
- 全量 267/267 绿（36 文件），typecheck ✓，verify:pwa ✓（111 预缓存，5.67 MiB）。首轮全量曾遇 `mermaid.smoke` 5s 超时（并发负载），单独复跑与二次全量均绿——既有 flaky，与本票无关。
- 隐私自查：fixtures 仍哑值；UI 只显示条数与字节，不展示 owner/repo/令牌内容。

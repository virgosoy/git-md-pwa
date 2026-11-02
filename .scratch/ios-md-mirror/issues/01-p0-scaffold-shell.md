Status: resolved
Type: task
Blocked by:

# 01 · P0 骨架：PWA 工程底座 + 设置页

Vite + TypeScript + Preact 工程；`manifest`（standalone）+ `apple-touch-icon` + `apple-mobile-web-app-capable`（可「加到主屏幕」、全屏独立）；Service Worker 外壳缓存（应用 shell 离线可用）；设置页：粘贴细粒度只读 PAT + 填 `owner/repo` +「同步开关（默认开）」；令牌只存本应用 IndexedDB。

**完成定义**：`npm run dev` 起得来；Safari 加主屏幕呈现独立窗口；设置可保存并在 IndexedDB 读到；devtools 里 SW 缓存命中 shell。

## Answer

- 2026-11-02 完成。交付：Vite+TS+Preact 工程（vite-plugin-pwa，standalone manifest + apple 元数据 + 占位图标），SW 外壳预缓存（`verify:pwa` 校验 dist 含 sw.js/manifest/index.html）。
- `src/settings/store.ts`：单例 IDB 连接 + 等 `tx.oncomplete` 再 resolve，保证「保存后立即可读回」；同步开关默认开。
- 测试 5/5 绿（S1 设置存储 + S2 安装元数据）。typecheck ✓。
- 双轴 code-review：Standards 无硬违规；Spec 缺陷（事务竞态/连接泄漏）已修。
- 提交：6ee4ea3（脚手架）+ 35598be（存储/UI/测试/评审修正）。真机「加到主屏幕」验证待用户安装时做。

Status: open
Type: task
Blocked by:

# 01 · P0 骨架：PWA 工程底座 + 设置页

Vite + TypeScript + Preact 工程；`manifest`（standalone）+ `apple-touch-icon` + `apple-mobile-web-app-capable`（可「加到主屏幕」、全屏独立）；Service Worker 外壳缓存（应用 shell 离线可用）；设置页：粘贴细粒度只读 PAT + 填 `owner/repo` +「同步开关（默认开）」；令牌只存本应用 IndexedDB。

**完成定义**：`npm run dev` 起得来；Safari 加主屏幕呈现独立窗口；设置可保存并在 IndexedDB 读到；devtools 里 SW 缓存命中 shell。

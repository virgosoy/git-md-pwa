# MD 镜像 · git-md-pwa

把 GitHub 的 Markdown 仓库（私有或公开）镜像成人**无网也能读**的 PWA，装到自己设备上、零成本、不搭服务器。

**在线版：https://virgosoy.github.io/git-md-pwa/** （Safari「添加到主屏幕」即得一个全屏 App）

## 功能

- **镜像**：只拉仓库里的 `.md`（单个 >10MB 自动跳过并标注「未镜像」），增量同步
- **离线阅读**：Shadow DOM 渲染（代码高亮/表格/原始 HTML 透传）、`[]()` 内链互跳、阅读位置记忆、最近打开
- **全局搜索**：H1–H6 标题 + 文件名/路径，命中标注「文件」/「标题 H{n}」
- **资源懒加载**：笔记引用的图片/PDF 在线自动缓存，离线有占用占位，可「全下」预载整篇
- **同步**：打开自动（可关）、手动刷新、顶部「离线 · 上次同步 x 分钟前」横幅
- **私有/公开通吃**：私有库填一个**只读**细粒度令牌；公开库令牌可留空

## 隐私

- 令牌只存**你自己的设备**（浏览器/手机 IndexedDB），不离开设备、不进代码/日志/仓库
- 本仓库公开，且**不包含任何私有笔记库信息**（红线）——你的笔记库地址由你在 App 设置里填

## 开发

```bash
npm install
npm run dev          # 本地开发 http://localhost:5173
npm run typecheck
npm test             # vitest 全量（纯函数/组件/集成三层）
npm run verify:pwa   # 构建 + 校验 PWA 产物
bash scripts/wizard-token.sh   # 交互向导：建细粒度只读令牌 + 写入 gitignore 的 .env
```

架构与测试缝约定见 [`CLAUDE.md`](./CLAUDE.md)；领域词汇见 [`GLOSSARY.md`](./GLOSSARY.md)。

## 部署

push `main` → GitHub Actions 自动构建到 Pages（Settings → Pages → Source: **GitHub Actions**）。手机打开 Pages 地址 → 分享 → **添加到主屏幕**，即完成安装。

## 技术栈

Vite + TypeScript + Preact · markdown-it + highlight.js · IndexedDB（`src/idb.ts` 单一 schema 所有者）· vite-plugin-pwa · 零后端、零构建服务器。

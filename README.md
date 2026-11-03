# git-md-pwa

把 GitHub 私有 Markdown 笔记库「镜像」到 iPhone 上离线阅读的纯 PWA。Windows 开发、零成本、无自建服务器、个人自用。

- 设计语言与决策见 `GLOSSARY.md`、`docs/adr/`。
- 技术栈：Vite + TypeScript + Preact；markdown-it + highlight.js；vite-plugin-pwa（托管 GitHub Pages）；IndexedDB 本地存储。

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 本地开发服务器
npm run typecheck    # 类型检查（tsc --noEmit）
npm test             # 全量测试（vitest）
npm run verify:pwa   # 构建 + 校验离线外壳（sw.js/manifest/index.html）
```

## 真实私有库联调

先跑 `scripts/wizard-token.sh` 生成本地 `.env` 令牌（只读、单仓库），再起 `npm run dev` 验证。
详见「[本地联调令牌向导](docs/wizard-token.md)」。

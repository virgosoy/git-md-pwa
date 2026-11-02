Status: resolved
Type: task
Blocked by: 01-p0-scaffold-shell

# 02 · P0 镜像核心：拉树 + 下载 md + 离线列表

用 git trees API（默认分支，`recursive=1`）取全树；只镜像 `.md` 文件（单个 >10MB 跳过并标注「未镜像」）；内容取不到（>1MB 文件）时回退 raw；存入 IndexedDB；离线渲染文件列表/目录树。增量：记录仓库整体 commit 版本号，变了才逐文件 diff。

**完成定义**：能对着一个公开 fixture 仓库离线列出全部 md；有网时拉到最新、断网时从 IDB 出列表。

## Answer

- 2026-11-02 完成。S1 客户端（git trees 拉树 + contents raw 取原文，Bearer，不带 X-GitHub-Api-Version）、S2 策略（只 .md、>10MB 标 too-large）、S3 存储（IDB round-trip + 纯 diff）、S4 编排（两阶段：先网络后写库，失败不破坏旧镜像）。
- 评审修正：版本号早退门（树 sha 未变即已最新）、truncated 树中止；共享 src/idb.ts 集中 schema；删 parseTree 中间层；wipeDb 测试共享。全程 raw 单一路径替代 base64+回退（与用户确认的简化）。
- 测试 25/25 绿，typecheck ✓，全历史隐私复检干净。
- 提交：278ae43（fixture）+ b06f49e（实现与评审修正）。离线列表 UI 属票 03。

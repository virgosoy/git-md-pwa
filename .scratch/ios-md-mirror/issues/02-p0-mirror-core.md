Status: open
Type: task
Blocked by: 01-p0-scaffold-shell

# 02 · P0 镜像核心：拉树 + 下载 md + 离线列表

用 git trees API（默认分支，`recursive=1`）取全树；只镜像 `.md` 文件（单个 >10MB 跳过并标注「未镜像」）；内容取不到（>1MB 文件）时回退 raw；存入 IndexedDB；离线渲染文件列表/目录树。增量：记录仓库整体 commit 版本号，变了才逐文件 diff。

**完成定义**：能对着一个公开 fixture 仓库离线列出全部 md；有网时拉到最新、断网时从 IDB 出列表。

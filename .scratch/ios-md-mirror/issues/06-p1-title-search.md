Status: resolved
Type: task
Blocked by: 03-p0-reader

# 06 · P1 全局标题搜索

建立轻量索引：每个 md 的首个 `#` 标题（无标题则文件名）+ 相对路径；搜索框按文件名字/标题模糊匹配，结果可跳转；离线可用（索引本地预计算）。

**完成定义**：输入片段能列出标题或文件名命中的 md 并点击跳转；断网可用。

## Answer

- 2026-11-06 完成。S1 extractHeadings（H1-H6、围栏跳桶、CommonMark 尾部 #）、S2 buildIndex+searchHeadings（文件/标题命中判别、双标、大小写、排序）、S3 首页接线（搜索框 + SearchResults 标签 + useMemo 索引）。
- 用户修订：H1-H6 全抽；标题命中（含 H1，0-N 个）标「标题 H{n}」，路径/文件名标「文件」，可双标。
- 评审修正：围栏正则收敛、`# foo#` 语义、删中间层、统一连接符、补双命中测试。
- 测试 88/88 绿，typecheck ✓，全历史隐私干净。
- 提交：3c00645。P1 剩 05 资源懒加载。

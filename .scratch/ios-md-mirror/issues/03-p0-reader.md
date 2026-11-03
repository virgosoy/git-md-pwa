Status: resolved
Type: task
Blocked by: 02-p0-mirror-core

# 03 · P0 阅读器：渲染 + 内链跳转 + 阅读位置 + 最近打开

markdown-it（CommonMark + 表格）渲染；语法高亮（highlight.js）；**原始 HTML 透传**（ADR-0002，注意 `<style>` 作用域不污染 App UI）；`[]()` 相对内链 → App 内打开对应 md；`http(s)` 外链 → 新开浏览器；`![]()` 图 → 留给 05 的懒加载路径；每篇记忆阅读位置；「最近打开」列表。

**完成定义**：能渲染一段含代码块、表格、`<style>` 片段和相对链接的 md；点内链在 App 内跳转、点外链出浏览器；重进回到上次位置。

## Answer

- 2026-11-03 完成。S1 渲染管线（markdown-it 表格 + highlight.js + 原始 HTML 透传/ADR-0002）、S2 链接分类与路径解析、S3 阅读/最近存储（idb v3 reading 表）、S4 ReaderView（Shadow DOM 作用域 + 点击委托）。
- 评审修正：resolveNotePath decode markdown-it 的 href 转义（Spec 缺陷：空格/中文内链此前静默失效）；onScroll 300ms 去抖；仅切笔记时还原阅读位置；idb 注释/pathOnly/消 Middle Man/单外壳/未镜像反馈。
- 测试 47/47 绿，typecheck ✓，PWA 产物 ✓，全历史隐私干净。
- 提交：1d68c69。资源配置（懒加载）与全文搜索后续票；真机验收待联调。

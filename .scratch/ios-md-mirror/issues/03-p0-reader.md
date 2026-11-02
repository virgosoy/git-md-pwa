Status: open
Type: task
Blocked by: 02-p0-mirror-core

# 03 · P0 阅读器：渲染 + 内链跳转 + 阅读位置 + 最近打开

markdown-it（CommonMark + 表格）渲染；语法高亮（highlight.js）；**原始 HTML 透传**（ADR-0002，注意 `<style>` 作用域不污染 App UI）；`[]()` 相对内链 → App 内打开对应 md；`http(s)` 外链 → 新开浏览器；`![]()` 图 → 留给 05 的懒加载路径；每篇记忆阅读位置；「最近打开」列表。

**完成定义**：能渲染一段含代码块、表格、`<style>` 片段和相对链接的 md；点内链在 App 内跳转、点外链出浏览器；重进回到上次位置。

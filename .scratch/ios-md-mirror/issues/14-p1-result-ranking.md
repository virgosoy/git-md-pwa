Status: resolved
Type: task
Blocked by: 12-p1-full-text-search

# 14 · P1 检索结果排序优化

优化 `searchNotes` 的结果排序（draft.md「优化现有标题和文件名检索的结果排序」）。**匹配语义完全不动**（单子串、大小写不敏感、空查询返回空、三态命中判定全照旧），只替换 `src/search/index.ts:124` 那行 `path.localeCompare` 排序。

## 语义（grilling 定稿，2026-11-16）

**类型主序（四档，从高到低）**：`文件名` > `标题` > `目录` > `正文`。每篇笔记进它命中的**最高档**。

| 档 | 档内排序 | 平局兜底 |
|---|---|---|
| 文件名 | 精确 > 前缀 > 包含 | `path.localeCompare` |
| 标题 | 精确 > 前缀 > 包含；同质量 **H6 > H5 > … > H1**（深者在前） | `path.localeCompare` |
| 目录 | — | `path.localeCompare` |
| 正文 | — | `path.localeCompare` |

**「精确 / 前缀 / 包含」定义**：
- 文件名：去 `.md` 后，`=== 查询` / `以查询开头` / `含查询`
- 标题：标题文本，`=== 查询` / `以查询开头` / `含查询`

**同文件多标题命中**：取最优那条定档内位次（精确 > 前缀 > 包含；同质量取最深，H6）。

**已接受的弱-强反转**：文件名「包含」排在标题「精确」之前（用户选 A）。目录命中为弱信号，降档到标题之下、正文之上。

## 架构

- `src/search/index.ts`：`searchNotes` 排序改为四档分级。`SearchHit` 结构不变（`fileMatch`/`headingHits`/`bodyMatch`/`bodySnippet`、UI 标签「文件/标题/正文」全照旧）——排序内部加一个 hit→档位+质量+深度的排序键，`sort` 改用该键比较。
- `src/search/search.test.ts`：补排序用例（已知字面量，独立断言）。

## Answer

- 2026-11-16 完成。`searchNotes` 排序由 `path.localeCompare` 换成四档分级：**文件名 > 标题 > 目录 > 正文**，每篇只进命中的最高档；文件名档内 精确 > 前缀 > 包含（剥 `.md` 比 stem），标题档内 精确 > 前缀 > 包含、同质量越深越前（H6 > … > H1，多标题命中取最优）；目录/正文档纯按 path 兜底，最终同档平局 path。
- 设计（grilling 定稿）：用户选「文件 > 标题 > 目录 > 正文」类型主序 —— 目录命中为弱信号从文件档拆出降到标题之下；接受「文件名包含压过标题精确」的反转；标题档深者在前（用户修订 H6 优先于 H1）。
- 实现：`SearchHit`/UI 标签/匹配语义全不动，`SearchResults.tsx` 无需改；排序键一次预计算再排（Schwartzian，避免比较器重算）。
- code-review 修正：① 查询串带 `.md` 后缀（整文件名粘贴）时文件名档两端剥扩展名不对称，会错误降档 → 修：文件名档比较前对查询也剥 `.md`（带空串守卫）；② 比较器每次比较重算 rank → 预计算；③ 目录/正文档恒 0 的字段不再参与比较；④ 补 3 个排序测试（同笔记双命中取最高档 / 排序层大小写不敏感 / 带 `.md` 查询不降档）。
- 测试：搜索单文件 26/26，全量 238/238 绿，typecheck ✓，verify:pwa ✓（111 预缓存 / prompt 不自跳）。mermaid smoke 全量时未触发既有 flake。
- 隐私自查：无笔记库痕迹。draft.md 该项勾选。不提交 `.claude/settings.json`（worktree bgIsolation）与 `.gitignore`（teach-workspace/）这两处会前既存的无关改动。


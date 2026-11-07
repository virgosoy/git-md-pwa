Status: open
Type: task
Blocked by:

# 07a · P1 公式渲染（KaTeX）

设置页新增「渲染数学公式」开关（**默认关**）。开启时，笔记内 `$$…$$`（块）、`$…$`（行内）、`\begin{…}…\end{…}`（环境）经 KaTeX 渲染；关闭或语法错误时静默当源码（`$x$` 按字面文本）。

**完成定义**：开关默认关；开启后含公式的笔记**离线**也渲染出排版公式；`\$` 可转义、货币 `$` 不被误伤；语法错误显示红色错误块而非崩溃。

## 决策（2026-11-07 grilling 已定）

- 插件 **@vscode/markdown-it-katex**（`^1.1.2`，VS Code 生产在用、活跃）+ katex **`^0.19.1`**（运行时注入）。token 级解析。定界符：`$$` / `$` / `\begin{}`；**不支持 `\(…\)`，已确认接受**。
- 渲染期同步 `katex.renderToString(tex, { throwOnError: false })` → `.katex-error` 红色块即降级 UI（错误前 Keep 源码）。
- **按需加载**：`renderMath === false` 时完全不接插件（`$` 字面文本，关=方案A）；开时才动态 `import('katex')`；内容无 `$`/`\` 标记可预检跳过 import。
- 渲染管线重构：`renderNote` 调整为可注入可选引擎的工厂（如 `createMd(engine?)`），原无公式默认行为保持，供其他调用方/旧测试。
- ReaderView 加载时序：开启时先 `await import('katex')` 再渲染、注入；**守卫路径竞态**（沿用现有 `pathRef` 模式，切走时不写回旧结果）。
- KaTeX CSS：`import css from 'katex/dist/katex.min.css?inline'` 注入 shadow root。**不要 `?raw`**（字体相对路径会 404）。字体由 Vite emit 为资产。
- **Workbox `globPatterns` 增加 `woff2,woff,ttf`**，否则 KaTeX 字体不预缓存、离线空白。
- 新增 **ADR-0003**：渲染增量按需加载 + 默认关闭（连同私有 HTML 透传前提一起记录）。

## Slices（实现时按红绿灯再拆，勿照抄）

1. settings：`AppSettings.renderMath: boolean`（默认 `false`）+ `SettingsView` 勾选项（`bindCheck` 放宽为 boolean 键）+ settings-store 测试（默认 false、persist true）。
2. render：`createMd` 重构 + 公式插件接线（katex 可注入）、render.test 断言定界符/`\$` 转义/货币不误伤/错误块字面量。
3. ReaderView：动态 import + 异步渲染 + 竞态守卫；KaTeX CSS 注入 shadow。
4. Workbox 字体预缓存；ADR-0003；spec 回写。
5. `verify:pwa` + typecheck + 全量测试绿；隐私自查（不涉笔记库）。

## 验收

- 开关默认关；关 → `$x^2$` 字面显示。
- 开 → `$$..$$` / `$..$` / `\begin{aligned}` **离线**渲染；`cost \$5` 保留为文本。
- 未闭合公式 → 红色 `katex-error` 块，不崩。

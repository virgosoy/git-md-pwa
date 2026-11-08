# 渲染增量（公式 KaTeX）按需加载，默认关闭

Status: accepted

## 背景

笔记仓库里有 LaTeX 公式，但只在部分章节出现。把 katex（约 259KB gz 后 78KB）塞进主包、每篇都跑一遍解析，代价不高但没必要；更关键的是公式语法错误不能打断阅读。因此把「数学公式渲染」做成一个人工打开的开关，行为和资源都是**按需**的。

## 决策

- 设置页新增「渲染数学公式」开关 `AppSettings.renderMath`，**默认关**。
- **关 = 完全不接插件**：`$…$` 按字面文本渲染，主包零 katex 依赖（`/…\`、`$` 可以是正文里的普通字符）。
- **开 = 动态加载**：渲染前先 `dynamic import('katex')` + `@vscode/markdown-it-katex`（token 级解析；`$$…$$`、`$…$`、裸 `\begin{…}\end{…}` 环境）；正文不含 `$`/`\` 时预检跳过 import。
- 渲染期 `katex.renderToString(tex, { throwOnError: false })`：语法错误由 katex 输出 `<span class="katex-error">…源码…</span>` 红色降级块（错误前内容保留），**不抛错、不崩**。
- 渲染工厂 `createMd(opts)`（`{ math?, mermaid? }`）独立构建 markdown-it，注入 math 引擎时才 `md.use` 公式插件、mermaid 开启才把 ```mermaid 围栏转宿主块；旧 `renderNote`（无 options）行为不变，供资源提取等其它调用方。
- **Mermaid 延续同一模式（07b）**：`renderMermaid` 默认关，开且正文含 ```mermaid 围栏时 markdown-it 输出带 `data-mermaid` 的宿主块（源码转义保留），装配层再按需 `import('mermaid')` 渲染成自包含 SVG 注入 shadow；语法/render 失败保留源码 + 内联「渲染失败」标，分块加载失败则静默保留源码块（不误加标），不崩。
- KaTeX CSS 经 `?inline` 注入 shadow root（字体 `url()` 由 Vite 重写为产物资产绝对路径；`?raw` 会 404）；Workbox `globPatterns` 含 `woff,woff2,ttf`，字体离线预缓存。

## 前提与边界

沿用 ADR-0002「放行原始 HTML」的信任前提：内容是用户自己的私有仓库、只在自己设备查看，没有不可信输入。新增的公式渲染只在这个前提内成立；一旦引入协作/公开内容，先净化再扩展渲染能力（届时重新评估本文档）。

代价：开公式的第一篇笔记需要编译期连带拉取 katex 几个分块（约 500KB 原始 / 160KB gz），此后缓存复用；`mayHaveMath` 用 `$`/`\` 做的预检是保守近似（正文里出现反斜杠也会触发加载）。

## Considered Options

- **默认开、渲染进主包**：简单，但 `$` 语义污染正文（货币/价格容易误判）、公式语法错误需要自研降级、离线启动变重。未采用。
- **按需加载 + 默认关（采用）**：资源与语义都不污染；降级由 `throwOnError:false` + 插件既有 `.katex-error` 块承担。

## Consequences

- 开公式后，含 `$`/`\` 的正文第一次渲染会多一次分块加载请求；失败时退回无公式渲染（不白屏）。
- `\$` 转义、货币 `$5` 不误伤、未闭合 `$` 维持字面——这些行为由插件定界符规则 + 本应用集成测试共同保障。
- 按需分块：`math`（装配 + KaTeX CSS 字符串）与 `katex`（ESM 本体）。`package.json` `overrides` 把**所有**传递依赖（含插件、mermaid 的数学图）的 katex 版本统一到 `0.19.1` 并去重。
- 仍存在两份 katex **产物**块：插件 `@vscode/markdown-it-katex` 是 CJS（`require('katex')` 解析到 katex 的 CJS 构建），应用走 ESM 构建——同一版本两套入口、各自成块。CJS 那份仅是插件默认 fallback 死重（我们恒注入 ESM 实例），只随公式按需块加载（约 78KB gz），可接受。
- 语法错误的降级红块由 `baseNoteCss` 的 `.katex-error` 规则提供（katex 自带 CSS 不给该 class 上色；块公式错误没有内联 color）。

## 参考

- [[GLOSSARY.md]]：私有仓库、仓库镜像等术语。
- [[0002-allow-raw-html-in-markdown]]：信任前提的来源，本决策依赖它。
- `.scratch/ios-md-mirror/issues/07a-p1-formula-render.md`：决策与验收。

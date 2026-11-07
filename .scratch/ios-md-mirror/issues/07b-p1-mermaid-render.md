Status: open
Type: task
Blocked by: 07a-p1-formula-render

# 07b · P1 Mermaid 图表渲染

设置页新增「渲染 Mermaid 图表」开关（**默认关**）。开启时，笔记内 ` ```mermaid ` 围栏**离线**渲染成 SVG 图表；关闭或语法错误时保留代码块（+ 内联错误标）。

**完成定义**：开关默认关；开启后含 ` ```mermaid ` 的笔记渲染出可读图表；语法错误显示源码 + 错误提示；在 **iPhone 14 / iOS 16.1.1** 真机实测一个 flowchart 正常出图。

## 决策（2026-11-07 grilling 已定）

- **mermaid `~10.9.8`**（官方 `backport` 维护线，兼容 iOS16；**v12 待用户升 iOS 后单独票**，进 spec 未排期）。
- **按需加载**：`renderMermaid === false` 时 ` ```mermaid ` 走普通代码块（关=方案A），零依赖；开时才动态 `import('mermaid')`。
- markdown-it 侧：`lang === 'mermaid'` 时不走 hljs，输出带 `data-mermaid` 标记的宿主块，**源码以转义文本保留**（供降级）。
- **Shadow DOM 对策**（上游 issue #6306 未关闭）：不把 shadow root 交给 mermaid——让 mermaid 在自建的临时 DOM 节点里 `render`，只把返回的 `svg` 字符串 `innerHTML` 注入 shadow 内宿主 div（同现有注入方式）；**接受放弃 `bindFunctions` 点击交互**。如 v10 实测在 shadow 内可行可简化，以实测为准。
- 每图唯一 id（v10 `render` 内部串行、id 进入 svg，撞 id 会坏）。
- 降级顺序：`mermaid.parse` 语法校验（v10 返回 boolean，需 try/catch）→ 失败保留源码 + 「渲染失败」内联标；成功才 render。render 抛错同样降级。
- `securityLevel` 用默认（strict）。
- 测试（jsdom）：抽纯函数提取 `[data-mermaid]` 块 + 注入 mock mermaid 断言 id/调用/svg 注入；真 mermaid 冒烟：合法 flowchart → svg 存在，非法 → 错误路径；**不断言布局几何**（jsdom 无布局）。
- iOS 兼容为票内验收项：真机 iPhone 14 / 16.1.1 实测 flowchaart。

## 交付

- wire 层：检测 `[data-mermaid]` 块 → 按需 `import('mermaid')` → parse/render/replace/降级（共用 07a 的扫描→替换骨架，属其延续）。
- `AppSettings.renderMermaid: boolean`（默认 `false`）+ `SettingsView` 勾选项。
- spec 回写 + 全部测试绿 + `verify:pwa` + typecheck；隐私自查（不涉笔记库）。

## 验收

- 开关默认关；关 → ` ```mermaid ` 显示为代码块。
- 开 → flowchart/sequence/pie 离线出 SVG；非法语法 → 源码 + 错误标，不崩。
- iPhone 14 / iOS16.1.1 真机出图（本票阻塞在据此判定兼容，不接受跳票到 `待定`）。

# 浅色主题的状态栏用深色带，而不是改 apple-mobile-web-app-status-bar-style

Status: accepted

主屏幕 App 用 `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`：状态栏透明、页面延伸到栏下（配合 `viewport-fit=cover` 与 `env(safe-area-inset-top)`）。这也决定了状态栏文字由 iOS 绘制。iOS 没有提供运行时改变状态栏文字颜色的接口。主题切到浅色后，白色文字（时钟、电量）落在浅色页面上，不可读。

## 决策

- 保留 `black-translucent`，不切换到 `default`：`default` 虽是黑字，但状态栏不透明、页面不再延伸到栏下；深色主题会留下一条浅色状态栏，而且这个 meta 只在启动时读取，无法跟随应用内主题切换。
- 浅色主题在状态栏区域（`env(safe-area-inset-top)` 高度）铺一条与深色页面同色的带子：`body::before` + `--status-bar-bg`。深色主题该变量为 `transparent`，行为不变。
- 状态栏背景可以继续用 `theme-color`（iOS 15+ 的 Safari 会用它影响状态栏/overscroll 背景），但**不依赖它控制文字颜色**；当前实现用页面自己的带子，覆盖范围明确。
- 不采用 Web App Manifest 的 `status_bar` 成员：没有 Apple/WebKit 一手文档支持，是网络上流传的疑似虚构字段。

## Considered Options

- **`default`（黑字）**：能读，但放弃全屏、深色主题变成浅色状态栏，且启动时固定，不能跟随应用内主题。未采用。
- **运行时改 `apple-mobile-web-app-status-bar-style`**：iOS 在启动时读取该 meta，JS 改这个标签会被忽略；只有重新下载/重装 web app 才可能变化。未采用。
- **Manifest `status_bar: { background_color, style }`**：查不到 Apple/WebKit 文档，疑似虚构。未采用。
- **`black-translucent` + 浅色主题深色带（采用）**：文字始终为白，背景由页面控制；不改变深色主题。

## Consequences

- 浅色主题顶部有一条深色状态栏区域；这是有意的，不是漏配背景。
- 状态栏文字颜色无法随主题切换。应用内任何主题方案都必须保证「白字下有深底」。iOS 16.1.1 上观察到 `black-translucent` 的文字为白色；有报告称新版 iOS 可能让它跟随系统外观，但无论哪种，都没有运行时改文字的接口。
- `theme-color` 与页面顶部色带可能同时存在；若真机上 `theme-color` 的不透明背景盖住色带，备选是把浅色模式的 `theme-color` 也设为深色（代价：Safari 地址栏与 overscroll 也变深）。
- Safari 26 起改为采样页面顶部颜色，而不是依赖 `theme-color`；届时 `body::before` 若不被采样，改用真实 `<div>`。iOS 16.1.1 目标暂不受影响。
- 2026-11-25 在 iPhone 14 / iOS 16.1.1 真机验证：浅色下来能看到深色带，时钟与电量清晰。

## 参考

- [[GLOSSARY.md]]：状态栏、主题。
- `.scratch/ios-md-mirror/spec.md`：票 25。
- 提交 `3a5952a`（主题切换）、`8add9ea`（状态栏深色带）。
- [WebKit — New WebKit Features in Safari 15](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/)：`theme-color` 影响状态栏与 overscroll 背景。
- [Apple — Configuring Web Applications（归档）](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)：`apple-mobile-web-app-status-bar-style` 只在主屏幕 standalone 模式生效。
- [Safari status bar & theme-color 实测参考](https://github.com/unibeck/uptime-monitor/blob/5643b28b8cfb005bbf2b41b07076ba80ac539441/.agents/skills/apple-web-app/references/theme-color-and-status-bar.md)。

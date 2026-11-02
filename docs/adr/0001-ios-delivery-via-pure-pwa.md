# iOS 交付采用纯 PWA，而非原生 .ipa 或 React Native/Expo

Status: accepted

在 Windows（无 Mac）、个人自用、零成本、不自建服务器的约束下，要把自己 GitHub 私有仓库的 Markdown 离线阅读器装进 iPhone（iOS 16.1.1），本应用以**纯 PWA**（静态网页 + Service Worker + GitHub REST API）交付，而不是 React Native/Expo（独立版需云端构建），也不是云端构建 .ipa + AltStore 侧载。理由：PWA 不依赖 Mac、服务器或任何付费梯度，GitHub 本身就是唯一后端，也免去侧载方案的 7 天重签循环和云端构建月度免费额度的持续摩擦；iOS 11.3+ 对主屏幕网页应用的离线与独立窗口支持（Service Worker、Cache API、IndexedDB、standalone 模式）已充分满足需求。

## Considered Options

- **React Native / Expo**：Expo Go 可免费真机运行，但独立安装包必须走 EAS 云端构建（免费档每月 30 次左右、低优先级），且仍然不是真原生调用本机的能力需求。
- **云端 .ipa + AltStore 侧载**：免费 Apple ID 可行（AltStore 官方支持 Windows），但每 7 天须重签一次；且私有仓库的 GitHub Actions 免费额度里 macOS runner 按 10 倍计费，实际月 macOS 构建时间约 200 分钟——持续维护成本高。

## Consequences

- iOS 网页应用无法真后台同步/推送，同步时机只能是「打开 App 时 + 手动刷新」。
- 离线缓存存在被系统回收的可能，需以「检测到缓存为空时自动重新拉取」兜底。
- 「安装」体验是 Safari「添加到主屏幕」，不是 App Store 分发——这是与用户确认过的可接受语义。

## 相关

- [[0002]] 尚无；本决策关联词汇见 `GLOSSARY.md`（主屏幕 App、仓库镜像、同步）。

Status: resolved
Type: task
Blocked by: 02-p0-mirror-core

# 04 · P0 同步：自动增量 + 手动刷新 + 离线提示

打开 App 时若同步开关开启：后台问默认分支最新 commit；未变则跳过，变了则按文件 diff 拉取更新镜像；手动「刷新」按钮强制走一遍；GitHub 不可达/失败：沿用旧镜像并顶部显示「离线 · 上次同步 x 分钟前」；同步开关关闭则完全不做自动同步。

**完成定义**：改一个 fixture 仓库文件 → 重开 App 自动更新该文件；断网打开无白屏、提示离线与上次同步时间；关掉开关后重开不请求网络。

## Answer

- 2026-11-03 完成。S1 formatLastSync 文案、S2 runSync+错误分类（network/api/truncated/unknown typed 结果）、S3 SyncBanner 文案、S4 开关守门集成测试（autoSync 关=0 请求 / 开=自动同步）。
- 评审修正：砍 idle 态统一三态映射；网络失败 message 即「离线」删横幅特判；TruncatedError 类型替代字符串比对；rejection 兜底。
- 测试 65/65 绿，typecheck ✓，PWA 产物 ✓，全历史隐私干净。
- 提交：34e3c77。注：版本号用 tree sha（02 设计，内容变必变）；「未变跳过」早退门在 mirrorRepo。
- 真机「开 App 自动同步你的私有笔记」待联调（建令牌 + 装到主屏幕）。

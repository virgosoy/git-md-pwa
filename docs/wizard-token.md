# 本地联调令牌向导（`scripts/wizard-token.sh`）

## 什么时候用

- 首次在**开发机**上做真实联调，让 App 能拉你自己的私有笔记库；
- 令牌过期 / 被吊销，需要重建；
- 换了一台开发机。

**只用于开发机。** iPhone 上用的是同一个 `github_pat_…`，在 App 的「设置」页粘贴（设备本地存储），不走这个脚本。

## 它做了什么（4 个阶段）

1. **创建令牌**：打开 GitHub 细粒度令牌创建页，引导你设置
   `Repository access = Only select repositories` → 勾选自己的笔记库；
   `Permissions → Contents = Read-only`；其余留 None；生成并复制。
2. **粘贴 + 填仓库**：隐藏输入粘贴 `github_pat_…`（屏幕上不显示），填写笔记库 `owner / repo`。
3. **真实验证**：用该令牌请求一次笔记库的文件树接口；200 即通过。令牌无效 / 权限不足 / 仓库名不对 / 网络波动（国内）都有明确提示，最多换新令牌重试 3 次。
4. **写入 `.env` + 收尾**：把 `GITHUB_TOKEN`、`REPO_OWNER`、`REPO_NAME` 写进本地 `.env`（0600 权限，`.gitignore` 已忽略），并提示 iPhone 用法。

## 隐私保证

- 脚本**不含**任何你的仓库信息（owner/repo 运行时才由你输入），因此可以提交进仓库；
- `.env` 已被 `.gitignore` 忽略，令牌**永不进 git**；
- 验证只取 HTTP 状态码，不打印令牌，也不打印仓库内容。

## 怎么跑

```bash
bash scripts/wizard-token.sh
```

跑完后 `.env` 里有三个值；之后在这台开发机上做真实联调时直接读取 `.env` 即可（例如用开发服务器在手机上验证）。

Status: open
Type: task

# 26 · P2 回写：编辑现有笔记并提交回私有仓库

目标：在 iPhone 主屏 PWA 里编辑**已镜像的现有 `.md` 笔记正文**，保存时提交回私有仓库的默认分支。回写是设置项，默认关闭；不改变「仓库镜像不是 Git 工作副本」的语义（ADR-0005）。

**范围**：编辑现有笔记正文。不做新建、删除、重命名、附件上传、跨文件原子提交、自动重试队列。行级 diff 只记在 `draft.md`，未排期。

## 完成定义

### 设置与入口

- `AppSettings.writeBackEnabled`（默认 `false`，持久化）。设置页新增「回写」区块：开关 + 一句「需要 Contents: Read and write 令牌」；令牌字段文案改为「细粒度令牌（只读 / 读写）」。
- 开关关闭：阅读器/首页不出现任何编辑、草稿入口（草稿仍保留在 IDB，再次开启可继续）。关闭时若本机有草稿，提示「草稿保留在本机」。
- 开关开启且令牌非空：阅读器顶栏出现 ✏️（笔记均为已镜像的 `ok` 文件）；点击 >1MB 的笔记提示「文件过大，暂不支持手机编辑」，不进入编辑器。
- 令牌为空（公开库匿名）时不显示编辑入口。
- `scripts/wizard-token.sh` 增加「只读（默认）/ 读写（回写）」选择；`README.md`、`docs/wizard-token.md`、`CLAUDE.md` 的「只读」措辞同步更新。
- 不做联网权限探测；保存遇 403 时提示换读写令牌。

### 阅读器与草稿露出

- 进入阅读器时读取该 path 的草稿：有草稿则在顶部显示横幅「本机有未提交草稿 · 继续编辑」；阅读器仍显示**已提交的镜像正文**。
- 首页「全部笔记」「最近打开」对有草稿的 path 加「草稿」标记；只在开关开启时显示。
- 草稿按 path 唯一，存 IDB 新表 `drafts`（`keyPath: 'path'`）；字段至少 `content`、`baseSha`、`eol`、`updatedAt`。
- `src/idb.ts` 增加 `STORE_DRAFTS`，`DB_VERSION` 升到 5；不需要数据迁移。

### 编辑器

- 全屏编辑器（App 内状态路由，不改 URL）：App 顶栏返回 / 保存；编辑器顶栏「编辑 / 预览」切换 + 丢弃草稿（二次确认）。
- 预览复用 `renderNote`；图片/附件沿用 `autoDownloadAssets` 规则。
- 输入防抖（约 500ms）自动写草稿；App 被杀/切后台不丢。内容与进入编辑时的正文一致时删除草稿。
- 返回：不弹确认，直接退出；草稿保留。返回阅读器时恢复进入编辑前的阅读位置。
- 丢弃草稿：二次确认后删除并退出。
- 保存成功后留在编辑器，提示「已提交」；保存进行中禁用保存按钮。
- 离线/网络失败：草稿保留，提示「已存草稿，联网后再保存」。
- 进入编辑时记录 `baseSha` 和原始内容；编辑期间后台同步不改变这次编辑的基准。

### 提交

- `PUT /repos/{owner}/{repo}/contents/{path}`，JSON body：`message: 手机编辑：<path>`、`content`（UTF-8 → base64）、`sha: baseSha`；`branch` 省略（默认分支）。
- 不发送 `X-GitHub-Api-Version`；带 `Authorization` 与 `Content-Type: application/json`。
- 成功：用响应 `content.sha` 更新本地 mirror 记录的 content/sha/size（`status` 仍为 `ok`）；删除草稿；刷新列表、搜索索引与阅读器。**不**改 mirror meta 的 `commitSha`，不额外整树同步。
- 每次保存一个提交；不提供自定义提交说明。

### 冲突与错误

- 409/422 视为疑似冲突：`GET /repos/{owner}/{repo}/contents/{path}`（JSON，≤1MB 内联 base64）拿远端 sha/正文。
- 远端存在且 sha 不同：弹冲突面板，可**只读预览远端版本（源文）**；操作：
  - 「覆盖远端」：用刚拿到的远端 sha 重新 PUT；
  - 「放弃我的修改，加载远端版本」：二次确认后删草稿、用远端正文/sha 更新镜像与阅读器；
  - 「取消」：保留草稿，不动远端。
- 远端文件已不存在：提供「在远端重新创建」/「放弃」。
- 403：提示「当前令牌没有写权限，请到设置换成 Contents: Read and write 的令牌」；401/404/其他 API 错误显示 GitHub 返回的 `message`。
- 网络错误/超时：草稿保留，可重试。
- 冲突处理中再次撞上远端变化：回到冲突面板，不静默覆盖。

### 保真

- 打开编辑时检测原文件行尾：统一 CRLF 则保存 CRLF，统一 LF 则 LF；混合行尾统一为 LF。BOM 不保留。
- 内容按 UTF-8 处理；中文/emoji 往返不损坏。

### 清空镜像与存储统计

- `clearMirror` 在同一事务内删除 drafts；返回值增加草稿条数（及字节），两步确认里明确「另有 N 份未提交草稿会一并删除」。
- 存储统计新增独立的「草稿」类别（`StorageUsage.drafts`）：条数 + 数据字节 + 记录开销，计入总量；**仅在有草稿时显示该行**（无草稿不占位）。
- 草稿行不因回写开关关闭而隐藏：只要本机有草稿就显示，因为它会在「清空笔记镜像」时被删除。
- `writeBackEnabled` 计入设置布尔字段。

## 事实依据（2026-11-25 调研）

- PUT contents 更新时必须带 `sha`（被替换文件的 blob SHA）；`branch` 省略即默认分支；响应里的 `content.sha` 是新 blob SHA、`commit.sha` 是新提交 SHA。
- 官方 changelog 写明 PUT 文件上限 100 MB；**实际处理上限未公开**，社区实测 10–19 MB 可用、50 MB+ 常报 `422 Sorry, the file is too large to be processed`，也可能 413。base64 膨胀约 33%。
- 细粒度 PAT 需要 **Contents: write**（外加 Metadata: read）。
- `api.github.com` 对浏览器来源开放；继续不发送 `X-GitHub-Api-Version`（本项目已知会触发 CORS 预检失败）。
- `GET /repos/{owner}/{repo}` 的 `permissions.push` 对细粒度 PAT 是否如实反映写权限，官方未承诺，因此不用它做入口门控。
- 参考：[Repository contents](https://docs.github.com/en/rest/repos/contents)、[2022 changelog](https://github.blog/changelog/2022-05-03-increased-file-size-limit-when-retrieving-file-contents-via-rest-api/)、[community #155856](https://github.com/orgs/community/discussions/155856)。

## 决策（已与用户确认）

- 特性开关默认关；关闭保留草稿。
- 单令牌；开启回写才需要 Contents: Read and write。
- 只编辑现有笔记正文；1MB 上限走 Contents API；>1MB 只读。
- 保存 = 立即提交；不自动重试。
- 冲突不自动合并；提供远端只读预览；行级 diff 记在 `draft.md`，未排期。
- 直接提交默认分支，固定提交说明。
- 提交成功本地回填，不立即同步。
- 存储统计为草稿单列一行（仅在有草稿时显示），不混入笔记行。
- 信任边界：笔记原始 HTML 透传 + 内联事件处理器可读 IDB；写权限仅在自己笔记库、默认关的前提下接受（ADR-0005）。

## 测试缝

纯函数单测（哑值）：

- UTF-8 ↔ base64（中文、emoji、换行、1MB 边界）。
- 行尾检测/还原（全 LF、全 CRLF、混合）。
- 提交说明生成。
- 写错误分类（401/403/409/422/404/网络/超时）。
- 草稿与基准正文相同 → 不落草稿。

集成（stub fetch + 预置 IDB；render `<App/>` 前先 `vi.mock('virtual:pwa-register/preact')`）：

- 开关关：无 ✏️、无草稿标记。
- 开关开 + 保存成功：请求体带 sha/message/base64；mirror 更新为新 sha/正文；草稿删除；阅读器刷新。
- 409/422 → GET 远端 → 冲突面板；覆盖与放弃两条路径。
- 403 → 写权限提示，草稿保留。
- 断网/超时 → 草稿保留。
- 重启 App（重新 render + 同一 IDB）草稿仍在，阅读器横幅出现。
- 清空镜像删除草稿并在确认文案里显示数量。
- 存储统计：无草稿时没有「草稿」行；有草稿时显示条数/字节并计入总量。

真机验收（iPhone 14 / iOS 16.1.1 Safari 主屏）：

- 编辑小笔记 → 保存 → GitHub 出现 `手机编辑：<path>` 提交，正文一致。
- 编辑中断网/杀 App → 重开有草稿 → 联网保存成功。
- 电脑/GitHub 网页改同一文件 → 手机保存提示冲突 → 预览远端 → 覆盖/放弃均符合预期。
- CRLF 文件只改一行 → GitHub diff 只有该行。
- 键盘弹出时编辑区可滚动、保存可达；返回阅读器位置不跳顶。

## 涉及模块（实施时）

- `src/idb.ts`：`STORE_DRAFTS`、`DB_VERSION` 5。
- `src/settings/store.ts` / `SettingsView.tsx`：`writeBackEnabled`、回写区块、令牌文案。
- `src/github/client.ts`：`getFileContent`（sha + 正文）、`putFile`（返回新 blob sha）；UTF-8 base64 工具放 `src/lib/`。
- 新模块（建议 `src/write/`）：草稿存取、行尾、提交编排、错误分类；编辑器组件（建议 `src/editor/EditorView.tsx`）。
- `src/mirror/store.ts`：草稿删除纳入 `clearMirror`；成功后回填 mirror 文件。
- `src/app.tsx`：编辑状态/路由、✏️、草稿横幅、保存与冲突编排、阅读位置恢复。
- `src/notes/NotesList.tsx` + 最近打开：草稿标记。
- `src/storage/estimate.ts` / `StorageUsage.tsx`：新增 `drafts` 类别与条件行（有草稿时显示），计入总量与开销。
- `src/styles.css`：编辑器与冲突面板样式（含安全区）。
- `scripts/wizard-token.sh`、`README.md`、`docs/wizard-token.md`、`CLAUDE.md`：权限措辞。
- `package.json` 版本号按仓库惯例。

## 未做（后续）

- 新建笔记（下一张票，编号 27 候选）。
- 删除/重命名/移动。
- 图片/附件上传。
- 行级 diff（`draft.md` 已记）。
- >1MB 文件编辑（Git Data API）。
- 自动重试队列 / 多文件原子提交。
- 自定义 commit message。
- 联网探测令牌写权限。

## 验收

- `npm test`、`npm run typecheck`、`npm run verify:pwa` 全绿。
- 隐私自查：fixture 只用哑值；不提交任何真实 owner/repo/令牌。
- 兼容基线：iOS 16.1.1 Safari 主屏；不使用 Safari 17+ API。

## Comments

2026-11-25 实施完成（代码 + 自动化测试全绿），**待 iPhone 真机验收**。

- DB 升至 v5，新增 `drafts` 表；清空镜像同一事务删除草稿，存储统计单列「草稿」行（有草稿时才显示）。
- 新增 `src/{lib/base64,eol}.ts`、`src/write/{draft,submit,errors}.ts`、`src/write/ConflictPanel.tsx`、`src/editor/EditorView.tsx`；客户端补 `getFileContent` / `putFile`。
- App 接线：设置「回写」开关（默认关）、阅读器 ✏️、全屏编辑器 + 预览、草稿横幅/列表标记、保存/冲突/放弃/重新创建、返回恢复阅读位置。
- 测试：新增 10 个 App 集成用例（开关关、保存成功、409 覆盖、远端删除重建、冲突放弃、403、断网、>1MB、草稿改回不落盘、重开 App 草稿横幅）；`npm test` 382/382 绿，`typecheck` ✓，`verify:pwa` ✓（v0.0.7+ea37dd2）。
- 真机验收清单：保存产生 `手机编辑：<path>` 提交；断网/杀 App 草稿还在；网页改同一文件触发冲突并预览/覆盖/放弃；CRLF 文件只改一行时 diff 只显示该行；键盘弹出时编辑区可滚动、保存可达。

2026-11-26 code review 修复：

- 草稿落盘：新增 `editorRef` + `visibilitychange`/`pagehide` 立即 flush，不再只靠 500ms 防抖；新增 pagehide 回归测试。
- 冲突重入：`resolveWriteConflict` 在远端 sha 未变 / 读取失败时关闭面板并提示，避免 `busy` 卡死；新增回归测试。
- 令牌 label 改为「细粒度令牌（只读 / 读写）」；401 提示保留 GitHub 原始 message。
- 丢弃草稿位置：保留在编辑器顶栏（App 顶栏只有返回/保存），本票文案已对齐。
- 规范清理：`withTimeoutReject` 移入 `src/lib/async.ts`；`bytesToDataUrl` 复用 lib base64；`WriteTarget` 复用 `GithubClient`/`Repository`；`PutFileResult` 去掉未使用的 `commitSha`；ConflictPanel 的 kind 文案收成映射。
- 全量 384/384 绿，typecheck ✓，verify:pwa ✓（构建串仍为 v0.0.7+62f4f0b，因为修复尚未提交）。

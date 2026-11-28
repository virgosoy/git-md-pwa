Status: open
Type: task

# 28 · P2 新建目录：随首篇笔记创建多级目录并提交

目标：在「新建笔记」弹层里输入一个相对父目录的多级新目录，创建首篇空 `.md` 时由同一个 Contents API 提交把目录带出来。新建目录属于回写能力，跟随 `writeBackEnabled` 开关（默认关闭），不改变「镜像不是 Git 工作副本」的语义（ADR-0005）。

**范围**：新建目录 + 首篇空文件；中间层可以没有直接文件（只被更深层的文件带出）。不做真空目录、删除/重命名/移动目录、目录管理界面、附件上传。

## 完成定义

### 入口与门控

- 首页顶栏「＋」与阅读器 ✏️ 共用门控：`writeBackEnabled` + 令牌非空 + owner 非空 + repo 非空，与 `currentWriteTarget()` 一致；缺任一项都不显示入口。
- 弹层内新增「＋ 新建目录」开关（默认关）。打开后显示「新目录路径」输入框，父目录下拉保持可见并作为基准；关闭即恢复票 27 的纯选择模式。
- 回写关闭、令牌为空或缺 owner/repo：应用内无反写入口。

### 弹层与校验

- 目录下拉沿用票 27：根目录 `/（根目录）` 固定首项，其余从镜像 `.md` 路径推导（含所有祖先目录）。
- 新目录路径是**相对选中父目录**的路径，用 `/` 分隔、可多级（如 `a/b/c`）。
- 规范化与校验（纯函数）：
  - 整串 `trim`；按 `/` 切段，每段 `trim`。
  - 任一段为空（首尾 `/`、`a//b`）→ 报错，不发起请求。
  - 任一段为 `.` 或 `..` → 报错。
  - 含 `\` 或控制字符（U+0000–U+001F、U+007F）→ 报错。
  - 允许中文、空格、emoji；保留大小写；目录名按字面使用，不补 `.md`。
  - 空输入不报错，「创建目录并新建笔记」禁用。
- 文件名规则完全沿用票 27：去首尾空白、自动补 `.md`、拒绝 `/` `\` 控制字符、`.`/`..`；空则禁用创建。
- 两字段都合法时显示预览「将创建：`<父目录>/<新目录>/<文件名>.md`」。
- 完整目录（父目录 + 新目录路径）已存在于镜像目录列表 → 提示「目录已存在，将直接在该目录新建笔记」，允许继续；只是某段前缀已存在 → 正常新建更深层，不提示。
- 创建中按钮显示「创建中…」并禁用；用 ref 守卫防止连点重复 PUT。

### 创建

- 提交：`PUT /repos/{owner}/{repo}/contents/{完整 path}`；body 含 `message: 手机新建：<完整 path>`、`content`（空文件，UTF-8 → base64），**不带 `sha`**、不带 `branch`（默认分支）。
- 中间层目录由同一个 commit 隐式带出；不调用目录端点（Git 不存空目录），不使用 `.gitkeep`。
- 不发送 `X-GitHub-Api-Version`；超时沿用 30s（`withTimeoutReject`），按网络错误处理。
- 成功：用响应 `content.sha` 与空正文 `upsertFile({ path, sha, content: '', size: 0, status: 'ok' })`；刷新 `files`（首页列表、目录下拉、搜索索引自动重算）；清空首页搜索词；`openNote(path)`（写入最近打开）；随即进入编辑器（`baseSha` = 新 sha，`baseContent` = `''`，`eol` = `lf`）。
- **不**修改 mirror meta 的 `commitSha`，不做整树同步；下次同步按 sha diff 自然校准。
- 本地回填失败按票 26/27 的容错：不阻断「已创建」结果，不额外报错；下次同步校准。
- 只记住**父目录**作为下次弹层默认值（新目录要等 `refreshFiles` 后才进入下拉，不能记成新目录）。

### 重名与错误

- 本地镜像已有同 path：提示「已存在同名笔记」，不发请求。
- 远端 PUT 返回 409/422：用 `getFileContent` 确认——
  - 远端存在该文件：提示「已存在同名笔记」，保留输入，不覆盖、不自动改名；
  - 远端不存在或读取失败：显示 GitHub 原始 message，或「新建失败，请稍后再试」。
- 403：提示「当前令牌没有写权限，请到设置换成 Contents: Read and write 的令牌」。
- 401：显示 GitHub 原始 message（与票 26/27 一致）。
- 404：显示 GitHub 原始 message（可能是仓库/分支不存在或权限不足；官方对权限不足允许 403 或 404）。
- 网络错误/超时：提示「新建失败，需要联网后再试」。
- 所有失败：弹层保持打开、输入保留，**不落草稿**，镜像不变。

### 创建后的导航与展示

- 创建成功直接进编辑器；编辑器「返回」→ 阅读器显示这篇新笔记；再返回 → 首页。
- 首页仍按**顶层目录**分组，每行显示完整路径；不做树形展开/折叠。
- 新目录的所有祖先（含没有直接文件的中间层）在下次打开弹层的目录下拉中出现。
- 搜索索引由 `files` 派生，新文件可按文件名/完整路径命中；空文件没有标题与正文命中。

### 文档与版本

- `package.json` 0.0.8 → **0.5.0**，与 tag 对齐；完成后打轻量 tag **`v0.5.0`**。
- ADR-0005：正文补充「新建目录已纳入：相对多级路径、随首篇文件在同一 commit 诞生、中间层可无直接文件、不支持真空目录、不用 `.gitkeep`」；Consequences 对应更新。
- `GLOSSARY.md`、`.scratch/ios-md-mirror/spec.md`、`draft.md`、`README.md`、`CLAUDE.md` 同步。

## 事实依据（2026-11-28 核对）

- Git 不把目录作为独立条目跟踪，Contents API 也没有「创建目录」端点；官方社区答案：要得到目录，必须在其中创建文件（`.gitkeep` 是社区约定）。
  - https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
  - https://github.com/orgs/community/discussions/21705
- PUT 嵌套新路径（如 `a/b/c.md`，`a/b` 不存在）在实践中会成功并隐式创建父目录，但 docs.github.com **没有明确承诺**；失败会返回 404/422，按错误处理即可。不为此引入 Git Data API。
- 新建成功返回 201；响应 `content.sha` 是新文件 blob SHA。
- 文件已存在但未传 `sha`：官方只列 409/422，现场以 422 为主、也有 409；两者都按疑似冲突处理并 GET 确认。
- 权限不足可能返回 403 或 404；无效凭证返回 401。
- 零字节 `content` 的 Base64 空串官方未明确，但票 27 已按空串提交并在用，本票沿用。
- 镜像入口只收 `.md` blob（`src/mirror/tree.ts:22`），`.gitkeep` 会被丢弃；目录只由 `.md` 路径前缀推导（`src/write/newNote.ts` 的 `deriveDirectories`），祖先目录自动补全。
- 首页按顶层目录分组（`src/notes/group.ts`）；搜索按完整 path 匹配（`src/search/index.ts`）。

## 决策（2026-11-28 与用户确认）

- 产物形态 A：新建目录 = 在「新建笔记」弹层里创建「新目录 + 首篇文件」，一次 PUT 完成；不做独立目录操作、不用 `.gitkeep`、不做真空目录。
- 新目录输入支持相对多级路径；中间层可以没有直接文件。
- 每次可建多层；父目录必须是既有镜像目录（或根目录），不扫描远端。
- 首篇文件名必填；空则禁用。
- 完整目录已存在时提示并继续；前缀存在不提示。
- 首页展示保持扁平（顶层分组 + 完整路径）；树形目录 UI 另开票。
- 提交说明沿用 `手机新建：<完整 path>`，一个 commit。
- 顺手修「＋」/✏️ 门控：补 owner/repo，与 `currentWriteTarget()` 一致。
- 版本统一到 0.5.0 并打 tag `v0.5.0`；更新 ADR-0005，不新开 ADR。

## 测试缝

纯函数单测（哑值）：

- 目录路径规范化：单段、多级逐段 trim、中文/空格/emoji、拒绝 `//`/首尾 `/`、`.`/`..`、`\`、控制字符、空输入。
- 目录拼接：根目录、子目录、空相对路径、父目录 + 多级 + 文件名 → 完整 path。
- 提交说明：`手机新建：notes/a/b/哑值.md`。

集成（stub fetch + 预置 IndexedDB；render `<App/>` 前先 `vi.mock('virtual:pwa-register/preact')`）：

- 缺 owner 或 repo：首页无「＋」。
- 父目录 + 多级新目录创建成功：请求 URL/方法/body（无 `sha`、message、空 content）；镜像新增 path；编辑器打开；返回后列表显示完整路径；再次打开弹层，所有祖先目录可选项。
- 根目录下多级新目录：path 不带前导 `/`。
- 完整目录已存在：提示并继续；发往该目录的 PUT。
- 非法新目录路径：按钮禁用、提示；改合法后恢复。
- 404：显示 GitHub 原始 message，弹层保留，镜像不变。
- 连点创建只发一次 PUT（沿用票 27 守卫）。

真机验收（iPhone 14 / iOS 16.1.1 Safari 主屏）：

- 首页「＋」→ 选父目录 → 打开「新建目录」→ 输入 `a/b/c` + 中文文件名 → 创建 → GitHub 出现 `手机新建：<path>` 的空文件提交，目录与首篇同时出现 → 编辑器打开。
- 写正文并保存 → 出现 `手机编辑：<path>` 提交。
- 新建后返回首页：列表按顶层目录分组、显示完整路径；最近打开与文件名搜索能找到；再次打开弹层时 `a`、`a/b`、`a/b/c` 都在目录下拉里。
- 输入已存在的完整目录 → 提示并继续，不覆盖任何文件。
- 输入 `a//b`、`/a`、`a/`、`a/../b` → 弹层内提示，创建禁用。
- 离线创建 → 提示需联网，输入不丢；恢复网络后重试成功。
- 键盘弹出时弹层字段可滚动、创建可达；取消与点遮罩不产生提交。
- 回写关闭、令牌为空、缺 owner/repo：首页无「＋」、阅读器无 ✏️。

## 涉及模块（实施时）

- `src/write/newNote.ts`：新增 `normalizeDirPath`、`joinDirPath`。
- `src/write/NewNotePanel.tsx`：新旧目录模式开关、路径输入、预览、已存在提示、提交载荷。
- `src/app.tsx`：门控补 owner/repo、`handleCreateNote(input)` 解析多级目录、只记住父目录。
- `src/styles.css`：弹层模式开关与预览样式。
- `package.json`、`docs/adr/0005-write-back-via-contents-api.md`、`GLOSSARY.md`、`.scratch/ios-md-mirror/spec.md`、`draft.md`、`README.md`、`CLAUDE.md`。

## 未做（后续）

- 真空目录（没有任何文件的目录）——Git 限制。
- 删除、重命名、移动目录。
- 目录管理界面 / 树形目录 UI。
- 模板 / 初始正文。
- 图片/附件上传。
- 离线排队新建。
- 行级 diff、>1MB 文件编辑、自定义 commit message。

## 验收

- `npm test`、`npm run typecheck`、`npm run verify:pwa` 全绿。
- 隐私自查：fixture 只用哑值；不提交任何真实 owner/repo/令牌。
- 兼容基线：iOS 16.1.1 Safari 主屏；不使用 Safari 17+ API。

## Comments

2026-11-28 实施完成（代码 + 自动化测试全绿），**待 iPhone 真机验收**。

- 新增 `normalizeDirPath`（多级相对路径逐段校验）与 `joinDirPath`；`NewNotePanel` 增加「＋ 新建目录」开关、路径输入、完整路径预览与「目录已存在」提示；`handleCreateNote` 改为接收 `{ baseDir, newDir, rawName }`，一次 PUT 创建多级目录下的首篇空文件。
- 「＋」/✏️ 门控补 owner/repo，与 `currentWriteTarget()` 一致。
- 测试：`newNote` 纯函数新增 15 个用例（目录规范化、拼接、目标解析）；`app.new-note` 新增 6 个集成用例（多级、根目录、已存在、非法路径、404、缺 owner/repo）；全量 431/431 绿，typecheck ✓，verify:pwa ✓（v0.5.0）。
- `package.json` 0.5.0；文档同步 ADR-0005 / GLOSSARY / spec / draft / README / CLAUDE。
- 真机验收清单：见上「真机验收」。

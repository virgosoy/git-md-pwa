# 回写经 Contents API 单文件提交，不做本地 Git 工作副本

Status: accepted

主屏幕 PWA 在 iPhone 上没有可访问的本地工作区；应用现有的「仓库镜像」是离线副本，不是 Git 工作副本。第二版需要在手机上编辑现有 Markdown 并写回私有仓库。决定：用 GitHub Contents API 的 `PUT /repos/{owner}/{repo}/contents/{path}` 直接提交单个文件；更新时携带上次同步得到的 blob SHA 作为乐观并发前置条件；每次保存产生一个提交，提交到默认分支，提交说明固定为 `手机编辑：<path>`；回写是设置项，默认关闭。单文件编辑上限 1 MB，更大的文件只读。

## Considered Options

- **Contents API + blob SHA（采用）**：一次请求完成提交；`sha` 前置条件天然提供「远端变了就拒绝」的乐观并发；单文件、≤1MB 的 Markdown 足够。
- **Git Data API（blob → tree → commit → ref）**：blob 可达 100 MB，可做多文件原子提交；但至少 4 次请求，还要自己处理 ref 非快进、重建与竞态。本版没有多文件需求，1 MB 足够覆盖现有笔记，不值得。
- **本地 clone / 工作副本**：iOS PWA 没有可用的本地磁盘层，而且会把「镜像」语义改成 Git 语义，与产品定义冲突。否决。
- **分支 + PR**：单人笔记库，评审流程是纯开销；直接提交默认分支。
- **读、写令牌分离**：两枚令牌最终都在同一台手机上，隔离收益不成立；改用「单一令牌 + 回写开关默认关」控制权限升级。
- **自动合并 / 行级 diff**：冲突概率低，自动合并在手机上难以做对；先提供远端只读预览 + 覆盖/放弃。行级 diff 只记入 `draft.md`。

## 信任边界

渲染器透传笔记中的原始 HTML（ADR-0002），内联事件处理器在页面作用域执行，能读取 IndexedDB 中的设置与令牌。只读令牌下，这已经是「笔记内容能读走令牌」；开启回写后令牌升级为 Contents: Read and write，影响面变成「笔记内容能修改/删除仓库内容」。接受这个风险的前提是：仓库是用户自己的笔记库、设备是信任边界、开关默认关闭。缓解措施：向导默认签发只读令牌，读写需显式选择；令牌建议 90 天过期；不把写令牌用于不受控的公开仓库。

## Consequences

- 单文件编辑上限 1 MB。Contents API 官方文件上限是 100 MB，但实际处理上限未公开，社区实测 10–19 MB 可用、50 MB+ 常报 422/413；1 MB 远离这个不确定区间。
- 每次保存一个提交，提交说明固定；不支持自定义说明。
- 冲突不自动合并：远端变了就拒绝保存，用户选择覆盖或放弃；远端文件被删除时另外提供「重新创建」。
- 离线或保存失败时保留本地草稿；不自动重试。
- 新建、删除、重命名、附件上传不在本版。
- 提交成功后用响应里的新 blob SHA 回填本地镜像，不立即整树同步；下次同步按 SHA diff 自然校准。
- 保存时保留原文件统一的行尾（CRLF/LF），混合行尾统一为 LF；BOM 不保留。
- 409 和 422 都先按疑似冲突处理，再 GET 远端文件区分「sha 不匹配」「文件已删除」与其他校验错误。

## 参考

- `GLOSSARY.md`：回写、保存、草稿、冲突、仓库镜像。
- `.scratch/ios-md-mirror/spec.md`：票 26。
- `.scratch/ios-md-mirror/issues/26-p2-writeback.md`：完整验收与测试缝。
- [GitHub Docs — Repository contents](https://docs.github.com/en/rest/repos/contents)
- [GitHub Changelog — 2022-05-03](https://github.blog/changelog/2022-05-03-increased-file-size-limit-when-retrieving-file-contents-via-rest-api/)
- [GitHub Community #155856](https://github.com/orgs/community/discussions/155856)
- [yetone/magpie — Contents API 422 与 Git Data API 的实测](https://github.com/yetone/magpie/commit/93b87d00044db93d739db0ca2bc58c52f9f34cfc)

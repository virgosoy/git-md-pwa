Status: resolved
Type: task
Blocked by: 03-p0-reader

# 05 · P1 资源懒加载：图片/PDF 按需缓存 + 占位 + 单篇全下

从渲染出的 md 提取 `![]()` 与 `[title](xxx.pdf)` 引用的相对资源路径；联网打开笔记时静默拉取并缓存（>10MB 跳过）；离线时已缓存显示、未缓存显示占位符（点击可看「未镜像」）；提供「本篇资源全下」按钮。

**完成定义**：含图的 fixture 笔记在线打开图正常、断网再次打开已缓存图正常；未缓存资源显示占位符；「全下」后离线图齐。

## Answer

- 2026-11-13 完成。S1 extract（img/asset 链接归一化）、S2 assets 存储（idb v4）、S3 pipeline（ensureAsset 缓存优先→拉字节→dataURL；>10MB 占位）、S4 wire（图片占位→回填；链接未命中标「未镜像」）+ ReaderView 装配 + App「全下」按钮。
- 方案要点：浏览器 <img> 无法带 Authorization 头 → 用 API 客户端拉字节编码 dataURL 入 IndexedDB。
- 评审修正：pipeline 测试 calls 假阳性、全下 rejection 兜底、链接 is-missing、fetchRaw 去重、MAX_ASSET_BYTES。
- 测试 101/101 绿，typecheck ✓，PWA 产物 ✓，全历史隐私干净。
- 提交：ae8cc68。P1 全部收官（01-06 + 公开库支持）。真机联调唯一待办。

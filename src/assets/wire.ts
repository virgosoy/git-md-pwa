// S4 · 阅读器资源装配：把资源引用接到 dataURL / 占位。
// wireAssets 是纯 DOM 操作（loader 注入），ReaderView 在渲染后调用它。

import { collectAssetRefs, type AssetRef } from './extract'

export interface AssetLoader {
  /** 返回资源 dataURL；查缓存优先，未命中再发起网络（离线且未缓存则 null） */
  load(path: string): Promise<string | null>
}

export const PLACEHOLDER_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#3f3f46"/><text x="8" y="20" font-size="12" fill="#a1a1aa">未镜像</text></svg>'
  )

function applyAsset(ref: AssetRef, url: string): void {
  if (ref.kind === 'image') {
    ref.el.setAttribute('src', url)
  } else {
    ref.el.setAttribute('href', url)
  }
}

/** 装配一片渲染结果中的资源引用；图片先占位、load 成功后回填。返回引用数。 */
export async function wireAssets(
  root: ParentNode,
  notePath: string,
  loader: AssetLoader
): Promise<number> {
  const refs = collectAssetRefs(root, notePath)
  for (const ref of refs) {
    if (ref.kind === 'image') applyAsset(ref, PLACEHOLDER_IMG)
    // 缓存/网络命中后回填；未命中的链接标「未镜像」（图片保持占位）
    void loader.load(ref.path).then(
      (url) => {
        if (url) applyAsset(ref, url)
        else if (ref.kind === 'link') ref.el.classList.add('is-missing')
      },
      () => {}
    )
  }
  return refs.length
}

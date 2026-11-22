// S4 · 阅读器资源装配：把资源引用接到 dataURL / 占位。
// wireAssets 是纯 DOM 操作（loader 注入），ReaderView 在渲染后调用它。

import { collectAssetRefs, type AssetRef } from './extract'

export interface AssetLoader {
  /** 返回资源 dataURL；查缓存优先，未命中再发起网络（离线且未缓存则 null） */
  load(path: string): Promise<string | null>
  /** 只读缓存（不联网）；未缓存返回 null。关闭自动下载时用于回填已缓存资源（23） */
  cached?(path: string): Promise<string | null>
}

export const PLACEHOLDER_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#3f3f46"/><text x="8" y="20" font-size="12" fill="#a1a1aa">未镜像</text></svg>'
  )

/** 关闭自动下载时的占位：「没试过」与「试过没拿到」（未镜像）区分开（23） */
export const NOT_LOADED_IMG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#3f3f46"/><text x="8" y="20" font-size="12" fill="#a1a1aa">未下载</text></svg>'
  )

export interface WireOptions {
  /**
   * false = 不自动联网：只回填已缓存资源，未缓存的标「未下载」并挂点击单张下载。
   * 默认 true（既有行为）。
   */
  autoDownload?: boolean
}

function applyAsset(ref: AssetRef, url: string): void {
  if (ref.kind === 'image') {
    ref.el.setAttribute('src', url)
  } else {
    ref.el.setAttribute('href', url)
  }
}

/** 手动模式：点未下载资源只拉这一个；成功回填，失败降级为「未镜像」（可再点重试）。 */
function attachManualDownload(ref: AssetRef, loader: AssetLoader): void {
  const onClick = (e: Event): void => {
    // 链接默认会跳到相对 URL（GitHub Pages 上 404 并离开 App）；图片无默认动作
    if (ref.kind === 'link') e.preventDefault()
    void loader.load(ref.path).then(
      (url) => {
        if (url) {
          applyAsset(ref, url)
          ref.el.classList.remove('is-not-downloaded', 'is-missing')
          // 下载完就摘掉监听：链接之后要走默认打开（否则永远被 preventDefault 拦住）
          ref.el.removeEventListener('click', onClick)
          return
        }
        if (ref.kind === 'image') applyAsset(ref, PLACEHOLDER_IMG)
        else {
          ref.el.classList.remove('is-not-downloaded')
          ref.el.classList.add('is-missing')
        }
      },
      () => {}
    )
  }
  ref.el.addEventListener('click', onClick)
}

/** 装配一片渲染结果中的资源引用；图片先占位、load 成功后回填。返回引用数。 */
export async function wireAssets(
  root: ParentNode,
  notePath: string,
  loader: AssetLoader,
  options: WireOptions = {}
): Promise<number> {
  const refs = collectAssetRefs(root, notePath)

  if (options.autoDownload !== false) {
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

  // 关闭自动下载：先落「未下载」，再只读缓存回填（零网络）；未命中的挂点击单张下载
  for (const ref of refs) {
    if (ref.kind === 'image') applyAsset(ref, NOT_LOADED_IMG)
    else ref.el.classList.add('is-not-downloaded')
  }
  await Promise.all(
    refs.map(async (ref) => {
      const url = loader.cached ? await loader.cached(ref.path).catch(() => null) : null
      if (url) {
        applyAsset(ref, url)
        ref.el.classList.remove('is-not-downloaded')
        return
      }
      attachManualDownload(ref, loader)
    })
  )
  return refs.length
}

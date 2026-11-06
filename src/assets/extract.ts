// S1 · 从渲染后的笔记 DOM 提取资源引用（图片 / 链接型资源）。
// 相对地址基于当前笔记路径归一化为仓库内相对路径；data:/http(s)/#/md 排除。

import { classifyLink, resolveNotePath } from '../reader/links'

export type AssetKind = 'image' | 'link'

export interface AssetRef {
  /** 归一化为仓库相对路径 */
  path: string
  kind: AssetKind
  /** 待装配的元素 */
  el: HTMLImageElement | HTMLAnchorElement
}

export function collectAssetRefs(root: ParentNode, notePath: string): AssetRef[] {
  const out: AssetRef[] = []

  root.querySelectorAll<HTMLImageElement>('img[src]').forEach((el) => {
    const href = el.getAttribute('src')
    if (!href) return
    const kind = classifyLink(href)
    if (kind !== 'asset') return
    out.push({ path: resolveNotePath(notePath, href), kind: 'image', el })
  })

  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((el) => {
    const href = el.getAttribute('href')
    if (!href) return
    const kind = classifyLink(href)
    if (kind !== 'asset') return
    out.push({ path: resolveNotePath(notePath, href), kind: 'link', el })
  })

  return out
}

/** 直接从渲染出的 HTML 字符串抓资源（「本篇资源全下」用；浏览器环境）。 */
export function assetRefsFromHtml(html: string, notePath: string): Array<{ path: string; kind: AssetKind }> {
  const tpl = document.createElement('div')
  tpl.innerHTML = html
  return collectAssetRefs(tpl, notePath).map(({ path, kind }) => ({ path, kind }))
}

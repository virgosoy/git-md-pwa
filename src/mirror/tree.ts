// S2 · 树解析与镜像策略
// 把 git trees 响应拍平成候选文件，再按策略选出要镜像的：
// 只镜像 .md；单个文件超过 10MB 跳过并标注「未镜像」（too-large）。

import type { TreeEntry } from '../github/client'

export type MirrorStatus = 'ok' | 'too-large'

export interface MirrorFile {
  /** 相对仓库根的路径 */
  path: string
  /** 文件 blob sha（用于增量比对） */
  sha: string
  size: number
  status: MirrorStatus
}

export const MAX_MIRROR_BYTES = 10 * 1024 * 1024

export function selectMirrorFiles(entries: TreeEntry[]): MirrorFile[] {
  return entries
    .filter((e) => e.type === 'blob' && e.path.toLowerCase().endsWith('.md'))
    .map((e) => {
      const size = e.size ?? 0
      return {
        path: e.path,
        sha: e.sha,
        size,
        status: size > MAX_MIRROR_BYTES ? 'too-large' : 'ok'
      }
    })
}

// S2 · 资源缓存存储（assets 表，key=仓库相对路径）
// 存 dataURL 字符串，兼容离线回填与 fake-indexeddb 测试。

import { STORE_ASSETS, withStore } from '../idb'

export type AssetStatus = 'ok' | 'too-large'

export interface AssetRecord {
  path: string
  dataUrl?: string
  size: number
  status: AssetStatus
  savedAt: number
}

export async function saveAsset(rec: AssetRecord): Promise<void> {
  await withStore(STORE_ASSETS, (s) => s.put(rec))
}

export async function loadAsset(path: string): Promise<AssetRecord | undefined> {
  return withStore<AssetRecord | undefined>(STORE_ASSETS, (s) => s.get(path))
}

export async function removeAsset(path: string): Promise<void> {
  await withStore(STORE_ASSETS, (s) => s.delete(path))
}

export interface ClearedAssets {
  /** 实际删除的已缓存资源条数 */
  count: number
  /** 删除的 dataURL 字符串字节数（全 ASCII，1 B/字符） */
  bytes: number
}

/**
 * 清掉已缓存的资源本体（`status: 'ok'`），返回实际删除的条数与字节数。
 * 保留 `too-large` 占位：它们不含资源数据（几字节），保留后下次联网打开笔记
 * 不会为了「再发现一次超限」整包下载大文件。
 */
export async function clearCachedAssets(): Promise<ClearedAssets> {
  const all = await withStore<AssetRecord[]>(
    STORE_ASSETS,
    (s) => s.getAll() as IDBRequest<AssetRecord[]>
  )
  const cached = all.filter((a) => a.status === 'ok')
  const bytes = cached.reduce((sum, a) => sum + (a.dataUrl?.length ?? 0), 0)
  if (cached.length > 0) {
    await withStore(STORE_ASSETS, (s) => {
      for (const a of cached) s.delete(a.path)
      return s.count()
    })
  }
  return { count: cached.length, bytes }
}

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

// S3 · 镜像存储
// 把镜像文件与其元数据（commit SHA / 同步时间）持久化到 IndexedDB
// （对象仓库 mirror[path]、meta[key]，schema 由 src/idb.ts 统一拥有）。
// 纯 diff 计算在这里，供镜像编排复用。

import { STORE_META, STORE_MIRROR, withStore } from '../idb'

export { clearCachedDb } from '../idb'

import type { MirrorFile } from './tree'

export interface StoredFile {
  path: string
  sha: string
  content: string
  size: number
  status: MirrorFile['status']
}

export interface MirrorMeta {
  commitSha: string
  syncedAt: number
}

export interface MirrorDiff {
  /** 需要拉取内容：远端 ok 且（本地缺失 / sha 变更 / 由 too-large 转 ok） */
  fetch: MirrorFile[]
  /** 需要写占位：远端 too-large 且（本地缺失 / 由 ok 转 too-large） */
  placeholder: MirrorFile[]
  /** 需要删除：本地存在、远端已无 */
  remove: string[]
}

const META_KEY = 'meta'

export async function saveMirrorMeta(meta: MirrorMeta): Promise<void> {
  await withStore(STORE_META, (s) => s.put({ key: META_KEY, ...meta }))
}

interface MetaRecord extends MirrorMeta {
  key: string
}

export async function loadMirrorMeta(): Promise<MirrorMeta | null> {
  const rec = await withStore<MetaRecord | undefined>(STORE_META, (s) => s.get(META_KEY))
  return rec ? { commitSha: rec.commitSha, syncedAt: rec.syncedAt } : null
}

export async function upsertFile(file: StoredFile): Promise<void> {
  await withStore(STORE_MIRROR, (s) => s.put(file))
}

export async function getFile(path: string): Promise<StoredFile | undefined> {
  return withStore<StoredFile | undefined>(STORE_MIRROR, (s) => s.get(path))
}

export async function loadFiles(): Promise<StoredFile[]> {
  const all = await withStore<StoredFile[]>(STORE_MIRROR, (s) =>
    s.getAll() as IDBRequest<StoredFile[]>
  )
  return all.sort((a, b) => a.path.localeCompare(b.path))
}

export async function removeFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    await withStore(STORE_MIRROR, (s) => s.delete(p))
  }
}

/** 纯函数：本地镜像与远端文件集比对，得出要拉/要占位/要删。 */
export function diffWithRemote(local: StoredFile[], remote: MirrorFile[]): MirrorDiff {
  const localByPath = new Map(local.map((f) => [f.path, f]))
  const remoteByPath = new Map(remote.map((f) => [f.path, f]))

  const fetch: MirrorFile[] = []
  const placeholder: MirrorFile[] = []

  for (const r of remote) {
    const l = localByPath.get(r.path)
    if (r.status === 'ok') {
      const stale = !l || l.status !== 'ok' || l.sha !== r.sha
      if (stale) fetch.push(r)
    } else {
      const stale = !l || l.status !== 'too-large'
      if (stale) placeholder.push(r)
    }
  }

  const remove = local.filter((l) => !remoteByPath.has(l.path)).map((l) => l.path)
  return { fetch, placeholder, remove }
}

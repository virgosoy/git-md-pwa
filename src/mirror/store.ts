// S3 · 镜像存储
// 把镜像文件与其元数据（commit SHA / 同步时间）持久化到 IndexedDB
// （对象仓库 mirror[path]、meta[key]，schema 由 src/idb.ts 统一拥有）。
// 纯 diff 计算在这里，供镜像编排复用。

import { STORE_DRAFTS, STORE_META, STORE_MIRROR, withStore, withStores } from '../idb'
import { stringBytes } from '../lib/bytes'
import { clearReadingIn, READING_STORE } from '../reader/reading'

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

/** meta 表里同步元数据的主键（存储统计也读它，故导出而非私有） */
export const MIRROR_META_KEY = 'meta'

export async function saveMirrorMeta(meta: MirrorMeta): Promise<void> {
  await withStore(STORE_META, (s) => s.put({ key: MIRROR_META_KEY, ...meta }))
}

interface MetaRecord extends MirrorMeta {
  key: string
}

export async function loadMirrorMeta(): Promise<MirrorMeta | null> {
  const rec = await withStore<MetaRecord | undefined>(STORE_META, (s) => s.get(MIRROR_META_KEY))
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

export interface ClearedMirror {
  /** 已镜像笔记条数（status: ok） */
  count: number
  /** 超大未镜像的占位条数（status: too-large） */
  skipped: number
  /** 被删正文的字节估算之和（与存储统计同一口径） */
  bytes: number
  /** 一并删除的未提交草稿条数 */
  drafts: number
  /** 被删草稿正文的字节估算之和 */
  draftBytes: number
}

interface DraftLike {
  content: string
}

/**
 * 清空本机笔记镜像：mirror 全表 + meta 同步记录 + reading 阅读位置 + drafts 草稿
 * 一起删除，settings 与 assets 不动。四表在同一事务里完成，失败整体回滚。
 *
 * 必须删 meta：mirrorRepo 的版本门（meta.commitSha === tree.sha 直接返回 0 拉取）
 * 会在 meta 残留时把清空后的同步短路，导致笔记永远拉不回来。
 */
export async function clearMirror(): Promise<ClearedMirror> {
  let count = 0
  let skipped = 0
  let bytes = 0
  let draftCount = 0
  let draftBytes = 0

  await withStores([STORE_MIRROR, STORE_META, READING_STORE, STORE_DRAFTS], (tx) => {
    const mirror = tx.objectStore(STORE_MIRROR)
    // getAll 先于 clear 排队，读到的是清空前的内容
    const all = mirror.getAll() as IDBRequest<StoredFile[]>
    all.onsuccess = () => {
      for (const f of all.result) {
        if (f.status === 'ok') count++
        else skipped++
        bytes += stringBytes(f.content)
      }
    }
    mirror.clear()
    tx.objectStore(STORE_META).delete(MIRROR_META_KEY)
    clearReadingIn(tx)

    const drafts = tx.objectStore(STORE_DRAFTS)
    const allDrafts = drafts.getAll() as IDBRequest<DraftLike[]>
    allDrafts.onsuccess = () => {
      draftCount = allDrafts.result.length
      for (const d of allDrafts.result) draftBytes += stringBytes(d.content)
    }
    drafts.clear()
  })

  return { count, skipped, bytes, drafts: draftCount, draftBytes }
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

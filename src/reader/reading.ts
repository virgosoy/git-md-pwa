// S3 · 阅读/最近存储
// 阅读位置（scrollTop）与最近打开列表共用 reading 表：
//   recordOpen 刷新打开时间（进「最近」头部），保留原位；
//   saveScroll 只更新位置，不动打开时间。

import { STORE_READING, withStore } from '../idb'

export interface ReadingRecord {
  path: string
  scrollTop: number
  openedAt: number
}

export async function loadReading(path: string): Promise<ReadingRecord | undefined> {
  return withStore<ReadingRecord | undefined>(STORE_READING, (s) => s.get(path))
}

export async function recordOpen(path: string): Promise<void> {
  const existing = await loadReading(path)
  await withStore(STORE_READING, (s) =>
    s.put({ path, scrollTop: existing?.scrollTop ?? 0, openedAt: Date.now() })
  )
}

export async function saveScroll(path: string, scrollTop: number): Promise<void> {
  const existing = await loadReading(path)
  await withStore(STORE_READING, (s) =>
    s.put({ path, scrollTop, openedAt: existing?.openedAt ?? Date.now() })
  )
}

export async function listRecent(limit = 20): Promise<ReadingRecord[]> {
  const all = await withStore<ReadingRecord[]>(STORE_READING, (s) =>
    s.getAll() as IDBRequest<ReadingRecord[]>
  )
  return all.sort((a, b) => b.openedAt - a.openedAt).slice(0, limit)
}

/** 事务作用域用：阅读表名（schema 仍由 src/idb.ts 唯一拥有）。 */
export const READING_STORE = STORE_READING

/**
 * 在调用方已开启的事务里清空阅读位置。
 * 阅读数据归本模块所有；票 19 的清空镜像需要与 mirror/meta 同一事务（原子），
 * 故由本模块提供事务内的清理钩子，而不是让调用方直接碰 reading 表。
 * 调用方需把 `READING_STORE` 列入事务作用域。
 */
export function clearReadingIn(tx: IDBTransaction): void {
  tx.objectStore(READING_STORE).clear()
}

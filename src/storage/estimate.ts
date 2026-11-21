// 本机存储统计：逐类读取浏览器实际保存的数据（IndexedDB 四表 + Cache Storage）。
// 不调用 navigator.storage.estimate()：iOS 16 的 Safari 没有该接口（Safari 17+ 才有），
// 自算口径在支持/不支持的设备上一致，且读到的就是应用自己写进去的数据。
//
// 字节口径：字符串按引擎内部表示估算——全部码元 ≤ 0xFF 按 Latin-1 1 B/字符，
// 否则按 UTF-16 2 B/字符；数字 8 B、布尔 1 B。另计可读的记录字段、主键重复与
// 缓存条目元数据；浏览器底层的页对齐、压缩、日志与 HTTP 缓存 JS 读不到，不计入。

import {
  STORE_ASSETS,
  STORE_META,
  STORE_MIRROR,
  STORE_READING,
  STORE_SETTINGS,
  withStore
} from '../idb'
import { stringBytes } from '../lib/bytes'
import type { AssetRecord } from '../assets/store'
import type { StoredFile } from '../mirror/store'
import { MIRROR_META_KEY } from '../mirror/store'
import type { ReadingRecord } from '../reader/reading'
import type { AppSettings } from '../settings/store'
import { SETTINGS_KEY } from '../settings/store'

export interface CategoryUsage {
  /** 条目数（笔记/资源 = 已镜像或已缓存；缓存 = 条目数；设置与阅读 = 记录数） */
  count: number
  /** 占位条数（>10MB 未镜像的笔记 / 未缓存的资源） */
  skipped: number
  /** 数据本体字节（正文 / dataURL / 响应体 / 设置与阅读字段） */
  contentBytes: number
  /** 可读的记录字段、主键重复与缓存条目元数据字节 */
  overheadBytes: number
}

export interface StorageUsage {
  notes: CategoryUsage | null
  assets: CategoryUsage | null
  cache: CategoryUsage | null
  settings: CategoryUsage | null
  capturedAt: number
}

interface MetaRecord {
  key: string
  commitSha: string
  syncedAt: number
}

const NUMBER_BYTES = 8
const BOOLEAN_BYTES = 1

function empty(): CategoryUsage {
  return { count: 0, skipped: 0, contentBytes: 0, overheadBytes: 0 }
}

async function notesUsage(): Promise<CategoryUsage> {
  const files = await withStore<StoredFile[]>(
    STORE_MIRROR,
    (s) => s.getAll() as IDBRequest<StoredFile[]>
  )
  const out = empty()
  for (const f of files) {
    if (f.status === 'ok') out.count++
    else out.skipped++
    out.contentBytes += stringBytes(f.content)
    // path 存两遍：记录字段 + 主键（B-tree）；另计 sha/status/size
    out.overheadBytes +=
      2 * stringBytes(f.path) + stringBytes(f.sha) + stringBytes(f.status) + NUMBER_BYTES
  }
  return out
}

async function assetsUsage(): Promise<CategoryUsage> {
  const all = await withStore<AssetRecord[]>(
    STORE_ASSETS,
    (s) => s.getAll() as IDBRequest<AssetRecord[]>
  )
  const out = empty()
  for (const a of all) {
    if (a.status === 'ok') out.count++
    else out.skipped++
    out.contentBytes += stringBytes(a.dataUrl ?? '')
    // path 存两遍（字段 + 主键）；另计 status/size/savedAt
    out.overheadBytes +=
      2 * stringBytes(a.path) + stringBytes(a.status) + NUMBER_BYTES * 2
  }
  return out
}

async function settingsUsage(): Promise<CategoryUsage> {
  const settings = await withStore<Partial<AppSettings> | undefined>(STORE_SETTINGS, (s) =>
    s.get(SETTINGS_KEY)
  )
  const meta = await withStore<MetaRecord | undefined>(STORE_META, (s) =>
    s.get(MIRROR_META_KEY)
  )
  const reading = await withStore<ReadingRecord[]>(
    STORE_READING,
    (s) => s.getAll() as IDBRequest<ReadingRecord[]>
  )

  const out = empty()
  if (settings) {
    out.count++
    out.contentBytes +=
      stringBytes(settings.token ?? '') +
      stringBytes(settings.owner ?? '') +
      stringBytes(settings.repo ?? '') +
      stringBytes(settings.lastPromptedVersion ?? '')
    const booleans = [
      settings.autoSync,
      settings.renderMath,
      settings.renderMermaid,
      settings.betterHeadingExtract,
      settings.tocPinned
    ].filter((v) => typeof v === 'boolean').length
    out.contentBytes += booleans * BOOLEAN_BYTES
    out.overheadBytes += stringBytes(SETTINGS_KEY)
  }
  if (meta) {
    out.count++
    out.contentBytes += stringBytes(meta.commitSha) + NUMBER_BYTES
    out.overheadBytes += stringBytes(MIRROR_META_KEY)
  }
  for (const r of reading) {
    out.count++
    out.contentBytes += stringBytes(r.path) + NUMBER_BYTES * 2 // scrollTop + openedAt
    out.overheadBytes += stringBytes(r.path) // 主键重复
  }
  return out
}

/** 响应头序列化文本（与实际传输的字段量级一致），用于缓存条目元数据估算。 */
function headerText(headers: Headers): string {
  let text = ''
  headers.forEach((value, key) => {
    text += `${key}: ${value}\r\n`
  })
  return text
}

async function cacheUsage(): Promise<CategoryUsage> {
  if (typeof caches === 'undefined') throw new Error('Cache Storage 不可用')
  const out = empty()
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (!res) continue
      out.count++
      out.contentBytes += (await res.arrayBuffer()).byteLength
      out.overheadBytes +=
        stringBytes(req.url) + stringBytes(headerText(res.headers)) + NUMBER_BYTES
    }
  }
  return out
}

async function attempt(fn: () => Promise<CategoryUsage>): Promise<CategoryUsage | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/** 统计本机存储占用；某一类读取失败时该类为 null（不影响其它类）。 */
export async function estimateStorage(): Promise<StorageUsage> {
  const [notes, assets, cache, settings] = await Promise.all([
    attempt(notesUsage),
    attempt(assetsUsage),
    attempt(cacheUsage),
    attempt(settingsUsage)
  ])
  return { notes, assets, cache, settings, capturedAt: Date.now() }
}

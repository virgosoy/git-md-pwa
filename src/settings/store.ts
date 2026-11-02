// S1 · 设置存储
// 公共接口：loadSettings / saveSettings / clearSettings
// 设置（含细粒度只读令牌、owner/repo、同步开关）只持久化在本应用自己的 IndexedDB。
// 隐私红线：令牌与仓库信息只应存在于设备本地，绝无任何硬编码的真实值。

export interface AppSettings {
  /** 细粒度只读 PAT（设备本地） */
  token: string
  /** GitHub owner */
  owner: string
  /** GitHub repo */
  repo: string
  /** 同步开关，默认开 */
  autoSync: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  token: '',
  owner: '',
  repo: '',
  autoSync: true
}

const DB_NAME = 'md-mirror'
const STORE = 'settings'
const KEY = 'app'

// 单例连接复用：iOS Safari 上反复开关连接会累积 blocked/versionchange 卡顿，
// 且跨连接读写会丢失事务顺序（保存后可能瞬时读回旧值）。
let dbPromise: Promise<IDBDatabase> | null = null

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

// 等事务提交（tx.oncomplete）再 resolve，保证「保存后立即可读回」；
// 出错/回滚一律 reject，不把半成品当成功。
function withStore<T>(fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return getDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        let result: T | undefined
        tx.oncomplete = () => resolve(result as T)
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => {
          result = req.result
        }
        req.onerror = () => reject(req.error)
      })
  )
}

export async function loadSettings(): Promise<AppSettings> {
  const raw = await withStore<Partial<AppSettings> | undefined>((s) => s.get(KEY))
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings()), ...patch }
  await withStore((s) => s.put(next, KEY))
  return next
}

export async function clearSettings(): Promise<void> {
  await withStore((s) => s.delete(KEY))
}

export function isConfigured(s: AppSettings): boolean {
  return s.token.length > 0 && s.owner.length > 0 && s.repo.length > 0
}

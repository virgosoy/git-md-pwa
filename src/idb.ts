// 共享 IndexedDB：唯一拥有 md-mirror 数据库 schema 的模块。
// settings（设置）、mirror（镜像）、meta（元数据）、reading（阅读位置/最近打开）、
// assets（资源缓存）、drafts（本机未提交草稿）在此集中声明，
// 避免各模块各自 open() 导致版本号与建仓逻辑散落
// （评审：跨模块 Shotgun Surgery 点）。

export const DB_NAME = 'md-mirror'
export const STORE_SETTINGS = 'settings'
export const STORE_MIRROR = 'mirror'
export const STORE_META = 'meta'
export const STORE_READING = 'reading'
export const STORE_ASSETS = 'assets'
export const STORE_DRAFTS = 'drafts'

const DB_VERSION = 5

const SCHEMA: Array<[string, IDBObjectStoreParameters | undefined]> = [
  [STORE_SETTINGS, undefined],
  [STORE_MIRROR, { keyPath: 'path' }],
  [STORE_META, { keyPath: 'key' }],
  [STORE_READING, { keyPath: 'path' }],
  [STORE_ASSETS, { keyPath: 'path' }],
  [STORE_DRAFTS, { keyPath: 'path' }]
]

let dbPromise: Promise<IDBDatabase> | null = null

function ensureSchema(db: IDBDatabase): void {
  for (const [name, params] of SCHEMA) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, params)
  }
}

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => ensureSchema(req.result)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

/** 仅测试用：关闭并丢弃缓存连接，便于 deleteDatabase 清库后重建。 */
export async function clearCachedDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.then(
      (d) => d,
      () => null
    )
    if (db) db.close()
  }
  dbPromise = null
}

/** 开一个 readwrite 事务，返回它和「提交/中止」的完成 Promise（失败不静默）。 */
async function beginTransaction(
  storeNames: string[]
): Promise<{ tx: IDBTransaction; done: Promise<void> }> {
  const db = await getDb()
  const tx = db.transaction(storeNames, 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    // 主动 abort() 时 tx.error 可能为 null，仍要给出可读错误
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务已中止'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
  })
  return { tx, done }
}

/** 等事务提交再 resolve；abort/error 一律 reject；不把半成品当成功。 */
export async function withStore<T>(
  storeName: string,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const { tx, done } = await beginTransaction([storeName])
  let req: IDBRequest<T>
  try {
    req = fn(tx.objectStore(storeName))
  } catch (err) {
    // fn 同步抛错时事务仍会自行结束；吞掉 done 的拒绝，避免未处理的 rejection
    void done.catch(() => {})
    throw err
  }
  let result: T | undefined
  req.onsuccess = () => {
    result = req.result
  }
  // 请求失败默认会让事务 abort，由 done 统一 reject（此处不 preventDefault）
  req.onerror = () => {}
  await done
  return result as T
}

/**
 * 跨多个仓库的单个 readwrite 事务：等整体提交再 resolve，abort/error 一律 reject。
 * 用于「要么全清、要么全不动」的清理动作（mirror + meta + reading）。
 * 事务内的请求结果由调用方在 fn 里自行收集；请求按发起的先后顺序排队。
 */
export async function withStores(
  storeNames: string[],
  fn: (tx: IDBTransaction) => void
): Promise<void> {
  const { tx, done } = await beginTransaction(storeNames)
  try {
    fn(tx)
  } catch (err) {
    try {
      tx.abort()
    } catch {
      // 事务可能已自动中止；保留原始错误
    }
    void done.catch(() => {})
    throw err
  }
  await done
}

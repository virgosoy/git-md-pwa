// 共享 IndexedDB：唯一拥有 md-mirror 数据库 schema 的模块。
// settings（设置）、mirror（镜像）、meta（元数据）三张对象仓库在此集中声明，
// 避免各模块各自 open() 导致版本号与建仓逻辑散落（评审：跨模块 Shotgun Surgery 点）。

export const DB_NAME = 'md-mirror'
export const STORE_SETTINGS = 'settings'
export const STORE_MIRROR = 'mirror'
export const STORE_META = 'meta'

const DB_VERSION = 2

const SCHEMA: Array<[string, IDBObjectStoreParameters | undefined]> = [
  [STORE_SETTINGS, undefined],
  [STORE_MIRROR, { keyPath: 'path' }],
  [STORE_META, { keyPath: 'key' }]
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

/** 等事务提交再 resolve；abort/error 一律 reject；不把半成品当成功。 */
export function withStore<T>(
  storeName: string,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return getDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        let result: T | undefined
        tx.oncomplete = () => resolve(result as T)
        tx.onabort = () => reject(tx.error)
        tx.onerror = () => reject(tx.error)
        const req = fn(tx.objectStore(storeName))
        req.onsuccess = () => {
          result = req.result
        }
        req.onerror = () => reject(req.error)
      })
  )
}

import { clearCachedDb, DB_NAME } from '../idb'

/** 测试辅助：销毁并重建 md-mirror 数据库，避免用例间互相污染。 */
export async function wipeDb(): Promise<void> {
  await clearCachedDb()
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

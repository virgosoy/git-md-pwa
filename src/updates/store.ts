// U6 · 手动检查时间的持久化：只存「上次手动检查」的时间戳。
// 放 meta 表而不是 settings：设置页保存的是整份表单快照，若时间戳混在
// settings 里，用户开着设置页时点检查更新、再点保存，会把新时间戳覆盖回旧值。
// 周期自动复查不写这里（保持「上次检查」= 用户主动检查一次的语义）。

import { STORE_META, withStore } from '../idb'

const UPDATE_META_KEY = 'updates'

interface UpdateMetaRecord {
  key: string
  lastCheckedAt?: number
}

export async function saveLastCheckedAt(at: number): Promise<void> {
  await withStore(STORE_META, (s) => s.put({ key: UPDATE_META_KEY, lastCheckedAt: at }))
}

export async function loadLastCheckedAt(): Promise<number | null> {
  const rec = await withStore<UpdateMetaRecord | undefined>(STORE_META, (s) => s.get(UPDATE_META_KEY))
  return rec?.lastCheckedAt && rec.lastCheckedAt > 0 ? rec.lastCheckedAt : null
}

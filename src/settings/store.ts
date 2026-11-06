// S1 · 设置存储
// 公共接口：loadSettings / saveSettings / clearSettings
// 设置（含细粒度只读令牌、owner/repo、同步开关）只持久化在本应用自己的 IndexedDB。
// 隐私红线：令牌与仓库信息只应存在于设备本地，绝无任何硬编码的真实值。
// 数据库连接与事务由共享模块 src/idb.ts 集中拥有。

import { STORE_SETTINGS, withStore } from '../idb'

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

const KEY = 'app'

export async function loadSettings(): Promise<AppSettings> {
  const raw = await withStore<Partial<AppSettings> | undefined>(STORE_SETTINGS, (s) =>
    s.get(KEY)
  )
  return { ...DEFAULT_SETTINGS, ...(raw ?? {}) }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings()), ...patch }
  await withStore(STORE_SETTINGS, (s) => s.put(next, KEY))
  return next
}

export async function clearSettings(): Promise<void> {
  await withStore(STORE_SETTINGS, (s) => s.delete(KEY))
}

export function isConfigured(s: AppSettings): boolean {
  // owner+repo 非空即视为已配置：公开仓库可不填令牌，匿名只读
  return s.owner.length > 0 && s.repo.length > 0
}

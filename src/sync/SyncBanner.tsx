// S3 · 同步横幅：把同步状态渲染成顶部一行提示（含「离线 · 上次同步 x 分钟前」）。
// 纯展示组件，文案逻辑由 S1/S2 支撑，本组件只做状态→文案的映射。

import { formatLastSync } from './time'
import type { SyncFailKind } from './sync'

export interface SyncBannerProps {
  status: 'syncing' | 'synced' | 'failed'
  fail: { kind: SyncFailKind; message: string } | null
  lastSyncedAt: number | null
  now?: number
}

export function SyncBanner({
  status,
  fail,
  lastSyncedAt,
  now = Date.now()
}: SyncBannerProps) {
  const last = formatLastSync(lastSyncedAt, now)
  let content = ''

  if (status === 'syncing') {
    content = '正在同步…'
  } else if (status === 'failed' && fail) {
    // 网络失败的 message 即「离线」，与其它失败共用一条展示分支（单一映射源）
    content = `${fail.message}${lastSyncedAt != null ? ` · 上次同步 ${last}` : ''}`
  } else if (lastSyncedAt != null) {
    content = `上次同步 ${last}`
  }

  if (!content) return null
  return (
    <div class="sync-banner" role="status">
      {content}
    </div>
  )
}

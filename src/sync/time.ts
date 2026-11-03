// S1 · 同步时间文案：把「上次同步时间」格式化成人类可读的「x 分钟前」。

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function formatLastSync(syncedAt: number | null | undefined, now: number): string {
  if (syncedAt == null) return '从未同步'
  const diff = now - syncedAt
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  return `${Math.floor(diff / DAY)} 天前`
}

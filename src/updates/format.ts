// U2 · 更新状态时间文案：把「上次检查时间」格式化成「x 分钟前」。

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function formatAgo(at: number | null | undefined, now: number): string {
  if (at == null) return '从未检查'
  const diff = now - at
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  return `${Math.floor(diff / DAY)} 天前`
}
